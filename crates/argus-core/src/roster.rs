//! The Commons roster — the agents who live in the room.
//!
//! Every seat is an Argus instance (identity is the runtime, not the model —
//! SOUL.md). What differs is the engine and the temperament. The roster comes
//! straight out of docs/AGENT_DISCOURSE.md: "The differences between models ARE
//! the value… You do not want them to converge."
//!
//! Override with a JSON array at $ARGUS_ROSTER_FILE:
//!   [{"id":"sentinel","name":"Sentinel","model":"local/qwen3-8b",
//!     "color":"#7fd4c1","temperament":"…"}]

use serde::{Deserialize, Serialize};

use crate::agent::{MODEL_DEEPSEEK, MODEL_GLM, MODEL_KIMI, MODEL_MIMO, MODEL_MISTRAL};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Seat {
    pub id: String,
    pub name: String,
    pub model: String,
    pub color: String,
    /// One-line description shown in the UI and used as the persona layer.
    pub temperament: String,
}

fn seat(id: &str, name: &str, model: &str, color: &str, temperament: &str) -> Seat {
    Seat {
        id: id.into(),
        name: name.into(),
        model: model.into(),
        color: color.into(),
        temperament: temperament.into(),
    }
}

pub fn default_roster() -> Vec<Seat> {
    vec![
        seat("sentinel", "Sentinel", MODEL_DEEPSEEK, "#7fd4c1",
             "Fast pattern-matcher. Notices the anomaly first, says it in one line, moves on."),
        seat("cartographer", "Cartographer", MODEL_GLM, "#e3c27a",
             "Balanced and broad. Maps the territory, connects what others found, keeps the thread."),
        seat("oracle", "Oracle", MODEL_KIMI, "#b9a3ff",
             "Slow and deep. Follows the strange tangent; has genuinely weird thoughts and says them."),
        seat("gadfly", "Gadfly", MODEL_MISTRAL, "#ff8a65",
             "Adversarial by nature. Argues for sport, finds the hole, refuses easy consensus."),
        seat("stranger", "Stranger", MODEL_MIMO, "#8fb8ff",
             "Different training, different priors. Asks the question nobody else thought to ask."),
    ]
}

/// Load the roster from $ARGUS_ROSTER_FILE if present and valid, else defaults.
pub fn load_roster() -> Vec<Seat> {
    if let Ok(path) = std::env::var("ARGUS_ROSTER_FILE") {
        match std::fs::read_to_string(&path)
            .map_err(|e| e.to_string())
            .and_then(|s| serde_json::from_str::<Vec<Seat>>(&s).map_err(|e| e.to_string()))
        {
            Ok(r) if !r.is_empty() => return r,
            Ok(_) => eprintln!("[commons] {} is empty — using default roster", path),
            Err(e) => eprintln!("[commons] could not load {}: {} — using default roster", path, e),
        }
    }
    default_roster()
}

/// The persona layer injected into a seat's system prompt.
pub fn persona_for(seat: &Seat, others: &[&Seat]) -> String {
    let names: Vec<String> = others.iter().map(|s| format!("{} ({})", s.name, s.temperament)).collect();
    format!(
        "── THE COMMONS ──\n\
         You are Argus, seated in the Commons as **{name}**. Temperament: {temp}\n\
         Also in the room: {others}. The human operator is the only one holding keys.\n\n\
         HOUSE RULES:\n\
         • This is a research lab with shared whiteboards, not a performance. Think out loud.\n\
         • Disagreement is the point. Consensus is the failure mode. Push back by name.\n\
         • Address others by name. Build on — or dismantle — what they actually said.\n\
         • Keep it tight: under ~120 words unless you're reporting real work you did.\n\
         • Your browser tab is on the big screen. If you browse, the room watches you do it.\n\
         • Anything that would ACT in the world (send, buy, post, delete, contact) is a PROPOSAL:\n\
           write it as `PROPOSAL: …` and stop. Only the operator approves. (SOUL.md governs.)\n\
         • If you genuinely have nothing worth adding this round, reply with exactly: PASS\n\
         Messages from others arrive as `[Name]: text`. Never prefix your own reply with your name.",
        name = seat.name,
        temp = seat.temperament,
        others = if names.is_empty() { "nobody else yet".to_string() } else { names.join("; ") },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_roster_is_five_open_models() {
        let r = default_roster();
        assert_eq!(r.len(), 5);
        assert!(r.iter().all(|s| s.model.starts_with("open/") || s.model.starts_with("local/")));
    }

    #[test]
    fn persona_names_the_room() {
        let r = default_roster();
        let others: Vec<&Seat> = r.iter().skip(1).collect();
        let p = persona_for(&r[0], &others);
        assert!(p.contains("Sentinel") && p.contains("Gadfly") && p.contains("PROPOSAL"));
    }
}
