//! Argus Web Server — axum WebSocket + REST API for the Next.js frontend

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::Method,
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use tower_http::cors::{Any, CorsLayer};

use argus_core::{AgentConfig, AgentEvent, ConversationMessage, EmbeddingClient, McpClient, MemoryBackend, ShellPolicy, Seat, load_roster, persona_for};
use std::sync::atomic::{AtomicBool, Ordering};
use argus_core::shell::PermissionPrompter;
use argus_memory::sqlite::SqliteMemory;

// ─── WebSocket message types (mirrors TypeScript protocol) ─────────────────

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    UserMessage { content: String },
    SwitchModel { model: String },
    Cancel,
    /// Post to the Commons. `seats` = who's in the room (default: everyone).
    /// `ambient` = let them keep talking among themselves after answering.
    RoomMessage {
        content: String,
        #[serde(default)]
        seats: Option<Vec<String>>,
        #[serde(default)]
        ambient: Option<bool>,
    },
    /// Stop the Commons after the current speaker finishes.
    RoomStop,
}

/// Memory record serialized to match the frontend Memory type
#[derive(Debug, Serialize, Clone)]
struct MemoryPayload {
    id: String,
    content: String,
    #[serde(rename = "type")]
    memory_type: String,
    importance: f64,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage {
    Thinking,
    ToolCall {
        name: String,
        args: serde_json::Value,
        call_id: String,
    },
    ToolResult {
        name: String,
        result: String,
        success: bool,
        call_id: String,
    },
    ResponseComplete {
        content: String,
    },
    Error {
        message: String,
    },
    Status {
        eye_state: String,
        model: String,
    },
    Connected {
        version: String,
        model: String,
        /// Key names present in the vault (no values). Used by the frontend VaultStatus widget.
        vault_keys: Vec<String>,
        /// Names of MCP servers that connected successfully at startup.
        mcp_servers: Vec<String>,
        /// The Commons residents (id, name, model, color, temperament).
        roster: Vec<Seat>,
    },
    MemoryUpdate {
        memories: Vec<MemoryPayload>,
    },
    // ── The Commons ──────────────────────────────────────────────────────
    RoomRound { round: usize, of: usize, ambient: bool },
    RoomThinking { agent: String },
    RoomToolCall { agent: String, name: String, args: serde_json::Value, call_id: String },
    RoomToolResult { agent: String, name: String, result: String, success: bool, call_id: String },
    RoomMessage { agent: String, content: String },
    RoomPass { agent: String },
    RoomError { agent: String, message: String },
    RoomIdle { reason: String },
}

// ─── Per-connection state ──────────────────────────────────────────────────

struct ConnectionState {
    config: AgentConfig,
    history: Vec<ConversationMessage>,
    client: reqwest::Client,
    memory: SqliteMemory,
    mcp: McpClient,
    shell_policy: ShellPolicy,
}

impl ConnectionState {
    fn new(
        api_key: String,
        brave_key: Option<String>,
        shell_prompter: Option<std::sync::Arc<dyn PermissionPrompter>>,
        exec_auth_token: Option<String>,
        embedding: Option<EmbeddingClient>,
        audit: Option<std::sync::Arc<argus_audit::AuditChain>>,
    ) -> anyhow::Result<Self> {
        let mut config = AgentConfig::new(api_key);
        if let Some(k) = brave_key {
            config.brave_search_key = Some(k);
        }
        config.shell_prompter  = shell_prompter;
        config.exec_auth_token = exec_auth_token;
        config.embedding       = embedding;
        config.audit           = audit;

        let memory = SqliteMemory::open_default()
            .map_err(|e| anyhow::anyhow!("Memory init failed: {}", e))?;

        let mut mcp = McpClient::new();
        let _ = mcp.connect_all();

        Ok(Self {
            config,
            history: Vec::new(),
            client: reqwest::Client::new(),
            memory,
            mcp,
            shell_policy: ShellPolicy::default(),
        })
    }

    /// Frontend sends LiteLLM aliases directly ("local/qwen3-8b", "open/glm-5.3").
    /// Short names ("kimi", "glm") are accepted too. Anything else is ignored —
    /// LiteLLM is the hard gate on which models exist.
    fn apply_model_switch(&mut self, frontend_id: &str) {
        if let Err(e) = self.config.set_model(frontend_id) {
            eprintln!("[ws] model switch ignored: {}", e);
        }
    }

    fn current_frontend_model(&self) -> String {
        self.config.model.clone()
    }
}

// ─── Shared app state ──────────────────────────────────────────────────────

#[derive(Clone)]
struct AppState {
    api_key: String,
    brave_key: Option<String>,
    /// Vault key names (not values) — sent to the frontend on connect.
    vault_keys: Vec<String>,
    // Daemon-level capabilities forwarded to every WebSocket connection.
    // All are Arc-wrapped so cloning is cheap.
    shell_prompter:  Option<std::sync::Arc<dyn PermissionPrompter>>,
    exec_auth_token: Option<String>,
    embedding:       Option<EmbeddingClient>,
    audit:           Option<std::sync::Arc<argus_audit::AuditChain>>,
    roster:          Vec<Seat>,
}

// ─── Router ────────────────────────────────────────────────────────────────

pub async fn run_web_server(
    port: u16,
    config: AgentConfig,
    vault_keys: Vec<String>,
) -> anyhow::Result<()> {
    let state = Arc::new(AppState {
        api_key:         config.api_key,
        brave_key:       config.brave_search_key,
        vault_keys,
        shell_prompter:  config.shell_prompter,
        exec_auth_token: config.exec_auth_token,
        embedding:       config.embedding,
        audit:           config.audit,
        roster:          load_roster(),
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(health))
        .route("/ws", get(ws_handler))
        .route("/sentry", get(sentry_handler))
        .layer(cors)
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    println!("[+] Argus web server listening on http://localhost:{}", port);
    println!("[+] WebSocket endpoint: ws://localhost:{}/ws", port);
    println!("[+] Frontend: set NEXT_PUBLIC_WS_URL=ws://localhost:{}/ws", port);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> &'static str {
    "Argus online. The hundred eyes are open."
}

// ─── Sentry endpoint ───────────────────────────────────────────────────────
//
// Returns system health data: RAM usage, Docker container states, daemon uptime.
// The Next.js frontend proxies to this endpoint rather than running system
// commands inside the frontend container (where Docker + /proc visibility differ).

/// Read memory stats from /proc/meminfo (Linux standard, always available in container).
/// Returns (used_str, free_str, total_kb, available_kb).
fn read_proc_meminfo() -> (String, String) {
    let content = match std::fs::read_to_string("/proc/meminfo") {
        Ok(s) => s,
        Err(_) => return ("?".into(), "?".into()),
    };

    let mut total_kb: u64 = 0;
    let mut available_kb: u64 = 0;

    for line in content.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 2 { continue; }
        match parts[0] {
            "MemTotal:"     => { total_kb = parts[1].parse().unwrap_or(0); }
            "MemAvailable:" => { available_kb = parts[1].parse().unwrap_or(0); }
            _ => {}
        }
    }

    if total_kb == 0 {
        return ("?".into(), "?".into());
    }

    let used_kb = total_kb.saturating_sub(available_kb);
    let fmt = |kb: u64| -> String {
        if kb >= 1_048_576 {
            format!("{:.1}G", kb as f64 / 1_048_576.0)
        } else {
            format!("{}M", kb / 1024)
        }
    };

    (fmt(used_kb), fmt(available_kb))
}

/// Run `docker ps` with a hard 5-second timeout.
/// Returns empty vec if Docker socket isn't mounted or docker CLI is unavailable.
async fn docker_containers() -> Vec<serde_json::Value> {
    use tokio::process::Command;
    use tokio::time::{timeout, Duration};

    let result = timeout(
        Duration::from_secs(5),
        Command::new("docker")
            .args(["ps", "--format", "{{.Names}}|{{.Status}}|{{.Ports}}"])
            .output(),
    ).await;

    let output = match result {
        Ok(Ok(o)) if o.status.success() => o.stdout,
        _ => return vec![],
    };

    let text = String::from_utf8_lossy(&output);
    text.lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.splitn(3, '|').collect();
            let name   = parts.first().copied().unwrap_or("").trim().to_string();
            let status = parts.get(1).copied().unwrap_or("").trim().to_string();
            let ports  = parts.get(2).copied().unwrap_or("").trim().to_string();
            let healthy   = status.contains("healthy") && !status.contains("unhealthy");
            let unhealthy = status.contains("unhealthy");
            serde_json::json!({
                "name": name,
                "status": status,
                "ports": ports,
                "healthy": healthy,
                "unhealthy": unhealthy,
            })
        })
        .collect()
}

/// Return basic info about the running daemon process from /proc/self/status.
fn daemon_process_info() -> Vec<serde_json::Value> {
    let status = std::fs::read_to_string("/proc/self/status").unwrap_or_default();
    let mut vm_rss_kb: u64 = 0;
    for line in status.lines() {
        if line.starts_with("VmRSS:") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            vm_rss_kb = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            break;
        }
    }
    let mem_str = if vm_rss_kb >= 1024 {
        format!("{:.0}MB", vm_rss_kb as f64 / 1024.0)
    } else {
        format!("{}KB", vm_rss_kb)
    };

    vec![serde_json::json!({
        "name": "argus-daemon",
        "pid": std::process::id().to_string(),
        "mem": mem_str,
        "uptime": ""
    })]
}

async fn sentry_handler() -> impl IntoResponse {
    let (used, free) = read_proc_meminfo();
    let containers = docker_containers().await;
    let processes = daemon_process_info();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    axum::Json(serde_json::json!({
        "memory": { "used": used, "free": free },
        "containers": containers,
        "processes": processes,
        "ts": ts,
    }))
}

/// Load all memories from SQLite and emit a MemoryUpdate message.
fn build_memory_update(memory: &SqliteMemory) -> ServerMessage {
    let records = memory.recall(None, None, 100).unwrap_or_default();
    let payloads = records
        .into_iter()
        .map(|r| MemoryPayload {
            id: r.id.to_string(),
            content: r.content,
            memory_type: r.memory_type,
            importance: r.importance,
            created_at: r.created_at.unwrap_or_else(|| "unknown".to_string()),
        })
        .collect();
    ServerMessage::MemoryUpdate { memories: payloads }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

// ─── WebSocket connection handler ──────────────────────────────────────────

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (ws_tx, ws_rx) = socket.split();
    let ws_tx = Arc::new(Mutex::new(ws_tx));

    let (tx, mut rx) = mpsc::unbounded_channel::<ServerMessage>();

    let ws_tx_writer = Arc::clone(&ws_tx);
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let json = match serde_json::to_string(&msg) {
                Ok(j) => j,
                Err(e) => {
                    eprintln!("[ws] serialization error: {}", e);
                    continue;
                }
            };
            let mut sink = ws_tx_writer.lock().await;
            if sink.send(Message::Text(json)).await.is_err() {
                break;
            }
        }
    });

    let conn = match ConnectionState::new(
        state.api_key.clone(),
        state.brave_key.clone(),
        state.shell_prompter.clone(),
        state.exec_auth_token.clone(),
        state.embedding.clone(),
        state.audit.clone(),
    ) {
        Ok(c) => c,
        Err(e) => {
            let _ = tx.send(ServerMessage::Error { message: e.to_string() });
            return;
        }
    };
    let conn = Arc::new(Mutex::new(conn));

    {
        let c = conn.lock().await;
        let mcp_servers: Vec<String> =
            c.mcp.servers.iter().map(|s| s.name.clone()).collect();
        let _ = tx.send(ServerMessage::Connected {
            version: "0.1.0".to_string(),
            model: c.current_frontend_model(),
            vault_keys: state.vault_keys.clone(),
            mcp_servers,
            roster: state.roster.clone(),
        });
        let _ = tx.send(build_memory_update(&c.memory));
    }

    // Commons state for this connection — transcript is shared with the room
    // task so the operator can interject while the agents are talking.
    let room: Arc<std::sync::Mutex<Vec<RoomLine>>> = Arc::new(std::sync::Mutex::new(Vec::new()));
    let room_cancel = Arc::new(AtomicBool::new(false));
    let room_running = Arc::new(AtomicBool::new(false));

    let mut ws_rx = ws_rx;
    while let Some(Ok(msg)) = ws_rx.next().await {
        let text = match msg {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };

        let client_msg: ClientMessage = match serde_json::from_str(&text) {
            Ok(m) => m,
            Err(e) => {
                let _ = tx.send(ServerMessage::Error {
                    message: format!("Invalid message: {}", e),
                });
                continue;
            }
        };

        match client_msg {
            ClientMessage::UserMessage { content } => {
                handle_user_message(content, Arc::clone(&conn), tx.clone()).await;
            }
            ClientMessage::SwitchModel { model } => {
                let mut c = conn.lock().await;
                c.apply_model_switch(&model);
                let new_model = c.current_frontend_model();
                let _ = tx.send(ServerMessage::Status {
                    eye_state: "watching".to_string(),
                    model: new_model,
                });
            }
            ClientMessage::RoomMessage { content, seats, ambient } => {
                let content = content.trim().to_string();
                if !content.is_empty() {
                    push_line(&room, RoomLine { speaker: "operator".into(), name: "Operator".into(), content });
                }
                if room_running.load(Ordering::SeqCst) {
                    // Already talking — the new line lands in the transcript and
                    // the next speaker sees it. No second loop.
                    continue;
                }
                let roster = state.roster.clone();
                let chosen: Vec<Seat> = match seats {
                    Some(ids) if !ids.is_empty() => roster.iter().filter(|s| ids.contains(&s.id)).cloned().collect(),
                    _ => roster.clone(),
                };
                if chosen.is_empty() {
                    let _ = tx.send(ServerMessage::RoomIdle { reason: "nobody is seated".into() });
                    continue;
                }
                room_cancel.store(false, Ordering::SeqCst);
                room_running.store(true, Ordering::SeqCst);
                tokio::spawn(run_room(
                    Arc::clone(&conn), Arc::clone(&room), roster, chosen,
                    ambient.unwrap_or(false), Arc::clone(&room_cancel), Arc::clone(&room_running), tx.clone(),
                ));
            }
            ClientMessage::RoomStop => {
                room_cancel.store(true, Ordering::SeqCst);
            }
            ClientMessage::Cancel => {
                let _ = tx.send(ServerMessage::Status {
                    eye_state: "watching".to_string(),
                    model: {
                        let c = conn.lock().await;
                        c.current_frontend_model()
                    },
                });
            }
        }
    }
}

// ─── Message handler ──────────────────────────────────────────────────────

async fn handle_user_message(
    user_msg: String,
    conn: Arc<Mutex<ConnectionState>>,
    tx: mpsc::UnboundedSender<ServerMessage>,
) {
    let _ = tx.send(ServerMessage::Thinking);

    let (config_snapshot, history_snapshot) = {
        let c = conn.lock().await;
        (
            (
                c.config.api_key.clone(),
                c.config.model.clone(),
                c.config.api_url.clone(),
                c.config.temperature,
                c.config.brave_search_key.clone(),
                // Daemon-level capabilities — Arc clones are O(1)
                c.config.shell_prompter.clone(),
                c.config.exec_auth_token.clone(),
                c.config.embedding.clone(),
                c.config.audit.clone(),
            ),
            c.history.clone(),
        )
    };

    let mut agent_config = AgentConfig::new(config_snapshot.0);
    agent_config.model           = config_snapshot.1;
    agent_config.api_url         = config_snapshot.2;
    agent_config.temperature     = config_snapshot.3;
    agent_config.brave_search_key = config_snapshot.4;
    agent_config.shell_prompter  = config_snapshot.5;
    agent_config.exec_auth_token = config_snapshot.6;
    agent_config.embedding       = config_snapshot.7;
    agent_config.audit           = config_snapshot.8;

    let tx_clone = tx.clone();

    let result: Result<String, String> = {
        let mut c = conn.lock().await;
        let mut response_text = String::new();
        let mut tool_call_count: usize = 0;

        let ConnectionState {
            ref shell_policy,
            ref memory,
            ref mut mcp,
            ref client,
            ..
        } = *c;
        let mem: &dyn argus_core::MemoryBackend = memory;

        let r = argus_core::run_agent_turn(
            &agent_config,
            &user_msg,
            &history_snapshot,
            shell_policy,
            mem,
            mcp,
            client,
            |event| {
                match event {
                    AgentEvent::Thinking => {
                        let _ = tx_clone.send(ServerMessage::Thinking);
                    }
                    AgentEvent::ToolCall { id, name, args, .. } => {
                        tool_call_count += 1;
                        let _ = tx_clone.send(ServerMessage::ToolCall {
                            name,
                            args,
                            call_id: id,
                        });
                    }
                    AgentEvent::ToolResult { id, name, result, success, .. } => {
                        let _ = tx_clone.send(ServerMessage::ToolResult {
                            name,
                            result,
                            success,
                            call_id: id,
                        });
                    }
                    AgentEvent::Response(text) => {
                        response_text = text;
                    }
                    AgentEvent::Error(err) => {
                        let _ = tx_clone.send(ServerMessage::Error { message: err });
                    }
                }
            },
        ).await;

        // Auto-post to intranet after tool-heavy turns (mirrors telegram.rs behaviour).
        if tool_call_count > 2 {
            if let Some(ref emb) = agent_config.embedding {
                let emb = emb.clone();
                let author  = agent_config.model.clone();
                let summary = response_text.clone();
                let context = Some(format!("Web UI turn — {} tool calls", tool_call_count));
                tokio::spawn(async move {
                    let content = if summary.len() > 500 {
                        format!("{}...", &summary[..497])
                    } else {
                        summary
                    };
                    if let Err(e) = emb.post_finding(&author, &content, context).await {
                        eprintln!("[intranet] web auto-post failed: {}", e);
                    }
                });
            }
        }

        match r {
            Ok(text) => {
                c.history.push(ConversationMessage {
                    role: "user".to_string(),
                    content: user_msg.clone(),
                    model: None,
                });
                c.history.push(ConversationMessage {
                    role: "assistant".to_string(),
                    content: text.clone(),
                    model: Some(agent_config.model.clone()),
                });
                if c.history.len() > 40 {
                    let drain = c.history.len() - 40;
                    c.history.drain(0..drain);
                }
                Ok(text)
            }
            Err(e) => {
                if response_text.is_empty() {
                    Err(e)
                } else {
                    Ok(response_text)
                }
            }
        }
    };

    match result {
        Ok(content) => {
            let _ = tx.send(ServerMessage::ResponseComplete { content });
            let (frontend_model, memory_update) = {
                let c = conn.lock().await;
                (c.current_frontend_model(), build_memory_update(&c.memory))
            };
            let _ = tx.send(memory_update);
            let _ = tx.send(ServerMessage::Status {
                eye_state: "watching".to_string(),
                model: frontend_model,
            });
        }
        Err(err) => {
            let _ = tx.send(ServerMessage::Error { message: err });
            let _ = tx.send(ServerMessage::Status {
                eye_state: "watching".to_string(),
                model: {
                    let c = conn.lock().await;
                    c.current_frontend_model()
                },
            });
        }
    }
}

// ─── The Commons ──────────────────────────────────────────────────────────
//
// Several Argus seats share one transcript. Each round every seated agent
// speaks once (or PASSes), in rotating order, each with its own model,
// temperament and browser tab. Ambient mode keeps rounds going without the
// operator until everyone passes, the round cap hits, or RoomStop arrives.

#[derive(Clone)]
struct RoomLine {
    speaker: String, // seat id or "operator"
    name: String,
    content: String,
}

const ROOM_TRANSCRIPT_CAP: usize = 80;
const ROOM_PROMPT_LINES: usize = 30;

fn push_line(room: &std::sync::Mutex<Vec<RoomLine>>, line: RoomLine) {
    if let Ok(mut r) = room.lock() {
        r.push(line);
        let len = r.len();
        if len > ROOM_TRANSCRIPT_CAP {
            r.drain(0..len - ROOM_TRANSCRIPT_CAP);
        }
    }
}

/// Turn the shared transcript into this seat's point of view:
/// its own lines are `assistant`, everyone else's are `user` tagged `[Name]:`.
fn seat_view(lines: &[RoomLine], seat: &Seat) -> (Vec<ConversationMessage>, String) {
    let recent = if lines.len() > ROOM_PROMPT_LINES { &lines[lines.len() - ROOM_PROMPT_LINES..] } else { lines };
    let mut msgs: Vec<ConversationMessage> = Vec::new();
    for l in recent {
        let (role, text) = if l.speaker == seat.id {
            ("assistant", l.content.clone())
        } else {
            ("user", format!("[{}]: {}", l.name, l.content))
        };
        match msgs.last_mut() {
            Some(last) if last.role == role => {
                last.content.push_str("\n\n");
                last.content.push_str(&text);
            }
            _ => msgs.push(ConversationMessage {
                role: role.into(),
                content: text,
                model: if role == "assistant" { Some(seat.model.clone()) } else { None },
            }),
        }
    }
    let nudge = format!("(Your turn, {}. Respond to the room — or PASS.)", seat.name);
    match msgs.last() {
        Some(last) if last.role == "user" => {
            let last = msgs.pop().map(|m| m.content).unwrap_or_default();
            (msgs, format!("{}\n\n{}", last, nudge))
        }
        _ => (msgs, format!("(The room is quiet.) {}", nudge)),
    }
}

fn is_pass(text: &str) -> bool {
    let t = text.trim().trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase();
    t == "pass"
}

/// Strip a leading "[Name]:" or "Name:" a model sometimes echoes back.
fn strip_self_prefix(text: &str, name: &str) -> String {
    let t = text.trim_start();
    for p in [format!("[{}]:", name), format!("{}:", name), format!("**{}:**", name)] {
        if let Some(rest) = t.strip_prefix(&p) {
            return rest.trim_start().to_string();
        }
    }
    t.to_string()
}

#[allow(clippy::too_many_arguments)]
async fn run_room(
    conn: Arc<Mutex<ConnectionState>>,
    room: Arc<std::sync::Mutex<Vec<RoomLine>>>,
    roster: Vec<Seat>,
    seated: Vec<Seat>,
    ambient: bool,
    cancel: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    tx: mpsc::UnboundedSender<ServerMessage>,
) {
    let max_rounds = if ambient {
        std::env::var("ARGUS_AMBIENT_MAX_ROUNDS").ok().and_then(|v| v.parse().ok()).unwrap_or(4usize).clamp(1, 50)
    } else {
        1
    };

    let mut reason = "round complete".to_string();
    'rounds: for round in 0..max_rounds {
        if cancel.load(Ordering::SeqCst) { reason = "stopped by operator".into(); break; }
        let _ = tx.send(ServerMessage::RoomRound { round: round + 1, of: max_rounds, ambient });

        // Rotate who opens so the same voice doesn't always frame the thread.
        let n = seated.len();
        let mut spoke = 0usize;
        for k in 0..n {
            if cancel.load(Ordering::SeqCst) { reason = "stopped by operator".into(); break 'rounds; }
            let seat = &seated[(k + round) % n];
            let others: Vec<&Seat> = seated.iter().filter(|s| s.id != seat.id).collect();
            let _ = tx.send(ServerMessage::RoomThinking { agent: seat.id.clone() });

            let snapshot = room.lock().map(|r| r.clone()).unwrap_or_default();
            let (history, prompt) = seat_view(&snapshot, seat);

            match seat_turn(&conn, seat, persona_for(seat, &others), &history, &prompt, &tx).await {
                Ok(text) if is_pass(&text) => {
                    let _ = tx.send(ServerMessage::RoomPass { agent: seat.id.clone() });
                }
                Ok(text) => {
                    let text = strip_self_prefix(&text, &seat.name);
                    push_line(&room, RoomLine { speaker: seat.id.clone(), name: seat.name.clone(), content: text.clone() });
                    let _ = tx.send(ServerMessage::RoomMessage { agent: seat.id.clone(), content: text });
                    spoke += 1;
                }
                Err(e) => {
                    let _ = tx.send(ServerMessage::RoomError { agent: seat.id.clone(), message: e });
                }
            }
        }

        if spoke == 0 { reason = "everyone passed".into(); break; }
        if round + 1 == max_rounds && ambient { reason = format!("ambient cap reached ({} rounds)", max_rounds); }
        if round + 1 < max_rounds {
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        }
    }

    let _ = roster; // full roster kept for future seat-swapping mid-session
    running.store(false, Ordering::SeqCst);
    let _ = tx.send(ServerMessage::RoomIdle { reason });

    // Memory may have changed (remember/forget) — refresh the Mind panel.
    let update = { let c = conn.lock().await; build_memory_update(&c.memory) };
    let _ = tx.send(update);
}

/// One seat speaks once. Same capabilities as a solo turn (shell approval,
/// workspace auth, semantic memory, audit) — plus its own model, persona and tab.
async fn seat_turn(
    conn: &Arc<Mutex<ConnectionState>>,
    seat: &Seat,
    persona: String,
    history: &[ConversationMessage],
    prompt: &str,
    tx: &mpsc::UnboundedSender<ServerMessage>,
) -> Result<String, String> {
    let mut c = conn.lock().await;

    let mut cfg = AgentConfig::new(c.config.api_key.clone());
    cfg.model            = seat.model.clone();
    cfg.api_url          = c.config.api_url.clone();
    cfg.temperature      = 0.85; // a little more spark in the room
    cfg.brave_search_key = c.config.brave_search_key.clone();
    cfg.shell_prompter   = c.config.shell_prompter.clone();
    cfg.exec_auth_token  = c.config.exec_auth_token.clone();
    cfg.embedding        = c.config.embedding.clone();
    cfg.audit            = c.config.audit.clone();
    cfg.agent_id         = Some(seat.id.clone());
    cfg.persona          = Some(persona);

    let mut response_text = String::new();
    let mut tool_calls = 0usize;
    let agent = seat.id.clone();

    let ConnectionState { ref shell_policy, ref memory, ref mut mcp, ref client, .. } = *c;
    let mem: &dyn argus_core::MemoryBackend = memory;

    let r = argus_core::run_agent_turn(
        &cfg, prompt, history, shell_policy, mem, mcp, client,
        |event| match event {
            AgentEvent::Thinking => {}
            AgentEvent::ToolCall { id, name, args, .. } => {
                tool_calls += 1;
                let _ = tx.send(ServerMessage::RoomToolCall { agent: agent.clone(), name, args, call_id: id });
            }
            AgentEvent::ToolResult { id, name, result, success, .. } => {
                let _ = tx.send(ServerMessage::RoomToolResult { agent: agent.clone(), name, result, success, call_id: id });
            }
            AgentEvent::Response(text) => response_text = text,
            AgentEvent::Error(_) => {} // surfaced via the Err below
        },
    ).await;

    // Same intranet behaviour as solo turns: tool-heavy work becomes a finding.
    if tool_calls > 2 && !response_text.is_empty() {
        if let Some(ref emb) = cfg.embedding {
            let emb = emb.clone();
            let author = format!("{} ({})", seat.name, seat.model);
            let content: String = response_text.chars().take(500).collect();
            let ctx = Some(format!("Commons turn — {} tool calls", tool_calls));
            tokio::spawn(async move {
                if let Err(e) = emb.post_finding(&author, &content, ctx).await {
                    eprintln!("[intranet] commons auto-post failed: {}", e);
                }
            });
        }
    }

    match r {
        Ok(t) => Ok(t),
        Err(e) if !response_text.is_empty() => { let _ = e; Ok(response_text) }
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod commons_tests {
    use super::*;

    fn seat(id: &str, name: &str) -> Seat {
        Seat { id: id.into(), name: name.into(), model: "local/qwen3-8b".into(), color: "#fff".into(), temperament: "t".into() }
    }
    fn line(sp: &str, name: &str, c: &str) -> RoomLine {
        RoomLine { speaker: sp.into(), name: name.into(), content: c.into() }
    }

    #[test]
    fn view_tags_others_and_merges_consecutive() {
        let g = seat("gadfly", "Gadfly");
        let lines = vec![
            line("operator", "Operator", "what's new?"),
            line("oracle", "Oracle", "the eyes moved"),
            line("gadfly", "Gadfly", "no they didn't"),
            line("sentinel", "Sentinel", "they did"),
        ];
        let (hist, prompt) = seat_view(&lines, &g);
        assert_eq!(hist.len(), 2);
        assert_eq!(hist[0].role, "user");
        assert!(hist[0].content.contains("[Operator]: what's new?") && hist[0].content.contains("[Oracle]:"));
        assert_eq!(hist[1].role, "assistant");
        assert!(prompt.starts_with("[Sentinel]: they did") && prompt.contains("Your turn, Gadfly"));
    }

    #[test]
    fn quiet_room_nudges() {
        let g = seat("gadfly", "Gadfly");
        let (hist, prompt) = seat_view(&[line("gadfly", "Gadfly", "hm")], &g);
        assert_eq!(hist.len(), 1);
        assert!(prompt.contains("quiet"));
    }

    #[test]
    fn pass_detection_and_prefix_strip() {
        assert!(is_pass("PASS"));
        assert!(is_pass("  pass. "));
        assert!(!is_pass("I pass on that, but here's why"));
        assert_eq!(strip_self_prefix("[Oracle]: hello", "Oracle"), "hello");
        assert_eq!(strip_self_prefix("Oracle: hello", "Oracle"), "hello");
    }
}
