use anyhow::{Context, Result};
use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    // Database
    pub database_url:            String,
    pub database_pool_min:       u32,
    pub database_pool_max:       u32,
    pub analytics_database_url:  String,

    // Server
    pub host:                    String,
    pub port:                    u16,
    pub environment:             Environment,

    // Auth
    pub jwt_secret:              String,
    pub jwt_access_expiry_secs:  u64,
    pub jwt_refresh_expiry_secs: u64,
    pub magic_link_expiry_mins:  u64,

    // Encryption (AES-256-GCM key as 64-char hex = 32 bytes)
    pub encryption_key_hex:      String,

    // Email
    pub smtp_host:               String,
    pub smtp_port:               u16,
    pub smtp_user:               String,
    pub smtp_pass:               String,
    pub from_email:              String,

    // Gmail OAuth
    pub gmail_client_id:         String,
    pub gmail_client_secret:     String,
    pub gmail_redirect_uri:      String,

    // URLs
    pub api_base_url:            String,
    pub web_base_url:            String,

    // Plan limits
    pub free_plan_txn_limit:     i64,
    pub family_plan_max_members: i64,

    // Rate limiting
    pub rate_limit_rps:          u32,

    // Data localisation
    /// If true, requests from outside India are rejected for Indian users.
    /// Enforced at middleware level.
    pub enforce_data_localisation: bool,

    /// Current privacy policy semver — stored in consent records
    pub privacy_policy_version:  String,
}

#[derive(Debug, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Environment {
    Development,
    Production,
    Test,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        let cfg = config::Config::builder()
            .add_source(config::Environment::default().separator("__"))
            .set_default("host", "0.0.0.0")?
            .set_default("port", 3001)?
            .set_default("environment", "development")?
            .set_default("database_pool_min", 2)?
            .set_default("database_pool_max", 10)?
            .set_default("jwt_access_expiry_secs",  900)?      // 15 min
            .set_default("jwt_refresh_expiry_secs", 2592000)?  // 30 days
            .set_default("magic_link_expiry_mins",  15)?
            .set_default("smtp_port", 465)?
            .set_default("free_plan_txn_limit", 500)?
            .set_default("family_plan_max_members", 5)?
            .set_default("rate_limit_rps", 20)?
            .set_default("enforce_data_localisation", true)?
            .set_default("privacy_policy_version", "1.0.0")?
            .build()
            .context("Failed to build config")?;

        let app: Config = cfg.try_deserialize().context("Failed to deserialise config")?;
        app.validate()?;
        Ok(app)
    }

    fn validate(&self) -> Result<()> {
        if self.jwt_secret.len() < 32 {
            anyhow::bail!("JWT_SECRET must be at least 32 characters");
        }
        if self.encryption_key_hex.len() != 64 {
            anyhow::bail!("ENCRYPTION_KEY_HEX must be exactly 64 hex chars (32 bytes)");
        }
        hex::decode(&self.encryption_key_hex)
            .context("ENCRYPTION_KEY_HEX must be valid hex")?;
        Ok(())
    }

    pub fn is_production(&self) -> bool {
        self.environment == Environment::Production
    }

    pub fn encryption_key_bytes(&self) -> [u8; 32] {
        let bytes = hex::decode(&self.encryption_key_hex).unwrap();
        let mut key = [0u8; 32];
        key.copy_from_slice(&bytes);
        key
    }
}
