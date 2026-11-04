pub mod agent;
pub mod embedding;
pub mod mcp;
pub mod roster;
pub mod shell;
pub mod skills;
pub mod supabase;
pub mod tools;

pub use agent::{
    AgentConfig, AgentEvent, ConversationMessage, run_agent_turn, model_label,
    ALL_MODELS, MODEL_SHORT_NAMES, MODEL_REFLECT,
    MODEL_LOCAL_FAST, MODEL_LOCAL_DEEP, MODEL_LOCAL_OSS, MODEL_LOCAL_GEMMA,
    MODEL_DEEPSEEK, MODEL_GLM, MODEL_KIMI, MODEL_MISTRAL, MODEL_MIMO, MODEL_QWEN_OPEN, MODEL_NEMOTRON,
};
pub use roster::{Seat, load_roster, persona_for};
pub use embedding::{EmbeddingClient, SemanticResult, EMBEDDING_MODEL};
pub use mcp::McpClient;
pub use shell::{ShellPolicy, PermissionPrompter, TelegramPrompter};
pub use skills::{SkillsClient, NewSkill};
pub use supabase::{SupabaseClient, DiscourseRecord};
pub use tools::{MemoryBackend, MemoryRecord};
