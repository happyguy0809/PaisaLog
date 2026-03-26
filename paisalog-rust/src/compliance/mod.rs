//! Compliance module — jurisdiction-aware data rules
//!
//! Every user belongs to a jurisdiction. All data retention,
//! consent requirements, localisation constraints, and PII
//! handling rules are derived from this jurisdiction at runtime.
//!
//! Adding a new country = add a variant to `Jurisdiction` and
//! implement `JurisdictionRules` for it. No changes elsewhere.

use chrono::Duration;
use serde::{Deserialize, Serialize};

// ── Jurisdiction enum ─────────────────────────────────────────
/// Legal jurisdiction governing a user's data.
/// Stored as TEXT in Postgres — string form: "IN", "EU", "US" etc.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum Jurisdiction {
    /// India — PDPB 2023, RBI data localisation
    #[serde(rename = "IN")]
    India,
    /// European Union — GDPR
    #[serde(rename = "EU")]
    Eu,
    /// United States — CCPA (California) / no federal law yet
    #[serde(rename = "US")]
    Us,
    /// Generic fallback — most restrictive rules apply
    #[serde(rename = "UNKNOWN")]
    Unknown,
}

impl Jurisdiction {
    pub fn from_locale(locale: &str) -> Self {
        match locale.get(3..5).unwrap_or("") {
            "IN" => Self::India,
            "EU" | "DE" | "FR" | "IT" | "ES" | "NL" | "PL" => Self::Eu,
            "US" => Self::Us,
            _ => Self::Unknown,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::India   => "IN",
            Self::Eu      => "EU",
            Self::Us      => "US",
            Self::Unknown => "UNKNOWN",
        }
    }
}

// ── Rules trait ───────────────────────────────────────────────
/// All data-handling rules derived from jurisdiction.
/// Returns concrete values — no ambiguity, no runtime config files.
pub trait JurisdictionRules {
    /// How long raw signal logs are retained before auto-deletion
    fn signal_log_retention(&self) -> Duration;

    /// How long after soft-delete before hard deletion (right to erasure)
    fn hard_delete_delay(&self) -> Duration;

    /// Whether analytics export is permitted at all (needs consent regardless)
    fn analytics_permitted(&self) -> bool;

    /// Whether financial data must be stored only within the country
    /// True = data must not leave the country's borders
    fn data_localisation_required(&self) -> bool;

    /// Minimum fields required in consent record
    fn consent_fields_required(&self) -> &'static [&'static str];

    /// Whether email addresses may be stored (even hashed) or only
    /// a one-way identifier must be used
    fn may_store_email_hash(&self) -> bool;

    /// Maximum transaction history retained per user (None = unlimited)
    fn max_transaction_retention_days(&self) -> Option<i64>;

    /// Whether explicit consent is required before any analytics processing
    fn analytics_requires_explicit_consent(&self) -> bool;
}

// ── India — PDPB 2023 implementation ─────────────────────────
pub struct IndiaRules;

impl JurisdictionRules for IndiaRules {
    fn signal_log_retention(&self) -> Duration {
        Duration::days(90)
    }
    fn hard_delete_delay(&self) -> Duration {
        // PDPB: data principal can request erasure, processor must comply
        // 30 days gives time to handle disputes/billing
        Duration::days(30)
    }
    fn analytics_permitted(&self) -> bool {
        true
    }
    fn data_localisation_required(&self) -> bool {
        // RBI mandates financial data localisation for payment systems
        // PaisaLog stores derived data (not raw payment data) but we
        // comply conservatively — all data stays in India
        true
    }
    fn consent_fields_required(&self) -> &'static [&'static str] {
        &["analytics_consent", "marketing_consent", "consent_recorded_at", "consent_version"]
    }
    fn may_store_email_hash(&self) -> bool {
        // Hashed email is pseudonymous, not anonymous — still PII under PDPB
        // We store it but treat it as PII (included in erasure, not in analytics)
        true
    }
    fn max_transaction_retention_days(&self) -> Option<i64> {
        // No statutory limit for personal finance apps, but we apply
        // 7 years conservatively (income tax audit period)
        Some(365 * 7)
    }
    fn analytics_requires_explicit_consent(&self) -> bool {
        true
    }
}

// ── EU — GDPR implementation ──────────────────────────────────
pub struct EuRules;

impl JurisdictionRules for EuRules {
    fn signal_log_retention(&self) -> Duration {
        Duration::days(30) // GDPR: minimise retention
    }
    fn hard_delete_delay(&self) -> Duration {
        Duration::days(30) // GDPR Art. 17: without undue delay
    }
    fn analytics_permitted(&self) -> bool {
        true
    }
    fn data_localisation_required(&self) -> bool {
        false // GDPR allows EU-wide transfers freely
    }
    fn consent_fields_required(&self) -> &'static [&'static str] {
        &[
            "analytics_consent", "marketing_consent",
            "consent_recorded_at", "consent_version",
            "consent_ip_hash", // GDPR: must be able to prove consent
        ]
    }
    fn may_store_email_hash(&self) -> bool {
        true // pseudonymised data permitted
    }
    fn max_transaction_retention_days(&self) -> Option<i64> {
        Some(365 * 5) // 5 years (EU accounting standards)
    }
    fn analytics_requires_explicit_consent(&self) -> bool {
        true // GDPR: legitimate interest does not apply to profiling
    }
}

// ── US — CCPA implementation ──────────────────────────────────
pub struct UsRules;

impl JurisdictionRules for UsRules {
    fn signal_log_retention(&self) -> Duration {
        Duration::days(90)
    }
    fn hard_delete_delay(&self) -> Duration {
        Duration::days(45) // CCPA: within 45 days
    }
    fn analytics_permitted(&self) -> bool {
        true
    }
    fn data_localisation_required(&self) -> bool {
        false
    }
    fn consent_fields_required(&self) -> &'static [&'static str] {
        &["analytics_consent", "marketing_consent", "consent_recorded_at"]
    }
    fn may_store_email_hash(&self) -> bool {
        true
    }
    fn max_transaction_retention_days(&self) -> Option<i64> {
        None // No statutory limit in US for personal finance apps
    }
    fn analytics_requires_explicit_consent(&self) -> bool {
        false // CCPA: opt-out model (not opt-in) for analytics
    }
}

// ── Unknown / fallback — most restrictive ─────────────────────
pub struct UnknownRules;

impl JurisdictionRules for UnknownRules {
    fn signal_log_retention(&self) -> Duration { Duration::days(30) }
    fn hard_delete_delay(&self)     -> Duration { Duration::days(7)  }
    fn analytics_permitted(&self)   -> bool     { false }
    fn data_localisation_required(&self) -> bool { true }
    fn consent_fields_required(&self) -> &'static [&'static str] {
        &["analytics_consent", "marketing_consent", "consent_recorded_at", "consent_version"]
    }
    fn may_store_email_hash(&self)  -> bool     { true }
    fn max_transaction_retention_days(&self) -> Option<i64> { Some(365) }
    fn analytics_requires_explicit_consent(&self) -> bool { true }
}

// ── Factory — get rules for a jurisdiction ────────────────────
pub fn rules_for(jurisdiction: &Jurisdiction) -> Box<dyn JurisdictionRules + Send + Sync> {
    match jurisdiction {
        Jurisdiction::India   => Box::new(IndiaRules),
        Jurisdiction::Eu      => Box::new(EuRules),
        Jurisdiction::Us      => Box::new(UsRules),
        Jurisdiction::Unknown => Box::new(UnknownRules),
    }
}

// ── Consent record ────────────────────────────────────────────
/// Stored per-user. Validated against jurisdiction rules at write time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentRecord {
    pub analytics_consent:   bool,
    pub marketing_consent:   bool,
    pub consent_recorded_at: chrono::DateTime<chrono::Utc>,
    pub consent_version:     String,  // semver of our privacy policy
    pub consent_ip_hash:     Option<String>, // SHA-256 of IP, for GDPR
}

impl ConsentRecord {
    pub fn validate_for(&self, jurisdiction: &Jurisdiction) -> Result<(), String> {
        let rules = rules_for(jurisdiction);
        let required = rules.consent_fields_required();

        if required.contains(&"consent_ip_hash") && self.consent_ip_hash.is_none() {
            return Err("consent_ip_hash required for this jurisdiction".to_string());
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn india_requires_explicit_consent() {
        assert!(IndiaRules.analytics_requires_explicit_consent());
    }

    #[test]
    fn india_requires_localisation() {
        assert!(IndiaRules.data_localisation_required());
    }

    #[test]
    fn unknown_blocks_analytics() {
        assert!(!UnknownRules.analytics_permitted());
    }

    #[test]
    fn jurisdiction_from_locale() {
        assert_eq!(Jurisdiction::from_locale("en-IN"), Jurisdiction::India);
        assert_eq!(Jurisdiction::from_locale("en-DE"), Jurisdiction::Eu);
        assert_eq!(Jurisdiction::from_locale("en-US"), Jurisdiction::Us);
        assert_eq!(Jurisdiction::from_locale("en-JP"), Jurisdiction::Unknown);
    }
}
