use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

/// Every error in PaisaLog maps to one of these.
/// The Display impl is what gets logged.
/// The client never sees internal details — only the code + message below.
#[derive(Debug, Error)]
pub enum AppError {
    // ── Auth ──────────────────────────────────────────────────
    #[error("Invalid or expired token")]
    InvalidToken,

    #[error("Session expired — please sign in again")]
    SessionExpired,

    #[error("Unauthorised")]
    Unauthorised,

    // ── Plan / entitlement ────────────────────────────────────
    #[error("Family plan required")]
    FamilyPlanRequired,

    #[error("Free plan transaction limit reached")]
    FreePlanLimitReached,

    #[error("Household is full (max 5 members)")]
    HouseholdFull,

    // ── Input validation ──────────────────────────────────────
    #[error("Invalid input: {0}")]
    Validation(String),

    #[error("Invite code invalid or expired")]
    InvalidInviteCode,

    #[error("Already a member of this household")]
    AlreadyMember,

    // ── Data ─────────────────────────────────────────────────
    #[error("Not found")]
    NotFound,

    #[error("Duplicate transaction — already recorded")]
    DuplicateTransaction,

    // ── Compliance ────────────────────────────────────────────
    #[error("Consent required before data can be processed")]
    ConsentRequired,

    #[error("Data processing not permitted in this jurisdiction")]
    JurisdictionBlocked,

    // ── Infrastructure ────────────────────────────────────────
    /// Database errors — logged in full server-side, never exposed
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    /// Unexpected errors — logged, generic message to client
    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AppError::InvalidToken      => (StatusCode::UNAUTHORIZED,  "INVALID_TOKEN",         self.to_string()),
            AppError::SessionExpired    => (StatusCode::UNAUTHORIZED,  "SESSION_EXPIRED",        self.to_string()),
            AppError::Unauthorised      => (StatusCode::FORBIDDEN,     "UNAUTHORISED",           self.to_string()),

            AppError::FamilyPlanRequired  => (StatusCode::PAYMENT_REQUIRED, "UPGRADE_REQUIRED",  self.to_string()),
            AppError::FreePlanLimitReached=> (StatusCode::PAYMENT_REQUIRED, "PLAN_LIMIT",        self.to_string()),
            AppError::HouseholdFull       => (StatusCode::CONFLICT,         "HOUSEHOLD_FULL",    self.to_string()),

            AppError::Validation(msg)   => (StatusCode::BAD_REQUEST,  "VALIDATION_ERROR",       msg.clone()),
            AppError::InvalidInviteCode => (StatusCode::NOT_FOUND,    "INVALID_INVITE",          self.to_string()),
            AppError::AlreadyMember     => (StatusCode::CONFLICT,     "ALREADY_MEMBER",          self.to_string()),

            AppError::NotFound          => (StatusCode::NOT_FOUND,    "NOT_FOUND",               self.to_string()),
            AppError::DuplicateTransaction => (StatusCode::OK,        "DUPLICATE",               self.to_string()),

            AppError::ConsentRequired   => (StatusCode::FORBIDDEN,    "CONSENT_REQUIRED",        self.to_string()),
            AppError::JurisdictionBlocked => (StatusCode::FORBIDDEN,  "JURISDICTION_BLOCKED",    self.to_string()),

            // Never expose DB or internal error details to client
            AppError::Database(e) => {
                tracing::error!(error = %e, "Database error");
                (StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "A database error occurred".to_string())
            }
            AppError::Internal(e) => {
                tracing::error!(error = %e, "Internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "An internal error occurred".to_string())
            }
        };

        let body = Json(json!({
            "error":   code,
            "message": message,
        }));

        (status, body).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
