// src/api/accounts.rs
// Account auto-discovery and management (Belief 14)
// Tracks user's bank accounts/cards discovered from SMS parsing

use axum::{extract::{Path, State}, Json};
use serde::{Deserialize, Serialize};
use crate::api::AppState;
use crate::middleware::auth::AuthUser;

#[derive(Serialize)]
pub struct Account {
    pub id:             i32,
    pub bank_name:      String,
    pub account_suffix: String,
    pub account_type:   String,
    pub display_name:   Option<String>,
    pub is_confirmed:   bool,
    pub is_primary:     bool,
    pub discovered_at:  chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
pub struct UpdateAccount {
    pub display_name: Option<String>,
    pub is_confirmed: Option<bool>,
    pub is_primary:   Option<bool>,
}

#[derive(Deserialize)]
pub struct DiscoverAccount {
    pub bank_name:      String,
    pub account_suffix: String,
    pub account_type:   Option<String>,
}

// GET /accounts — list all discovered accounts for user
pub async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<Account>>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let rows = sqlx::query!(
        r#"SELECT
            ua.id, uad.bank_name, uad.account_suffix,
            COALESCE(uad.account_type, 'savings') as "account_type!",
            uad.display_name, ua.is_confirmed, ua.is_primary,
            ua.discovered_at
           FROM user_accounts ua
           JOIN user_account_details uad ON uad.account_id = ua.id
           WHERE ua.user_id = $1
           ORDER BY ua.is_primary DESC, ua.discovered_at ASC"#,
        auth.user_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({"error": e.to_string()}))
    ))?;

    Ok(Json(rows.iter().map(|r| Account {
        id:             r.id,
        bank_name:      r.bank_name.clone(),
        account_suffix: r.account_suffix.clone(),
        account_type:   r.account_type.clone(),
        display_name:   r.display_name.clone(),
        is_confirmed:   r.is_confirmed.unwrap_or(false),
        is_primary:     r.is_primary.unwrap_or(false),
        discovered_at:  r.discovered_at.unwrap_or_else(chrono::Utc::now),
    }).collect()))
}

// POST /accounts/discover — auto-discover account from SMS parse result
pub async fn discover(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<DiscoverAccount>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    if body.bank_name.is_empty() || body.account_suffix.is_empty() {
        return Ok(Json(serde_json::json!({"ok": false, "reason": "missing fields"})));
    }

    // Check if already exists
    let existing = sqlx::query!(
        r#"SELECT ua.id FROM user_accounts ua
           JOIN user_account_details uad ON uad.account_id = ua.id
           WHERE ua.user_id = $1
           AND uad.bank_name = $2
           AND uad.account_suffix = $3"#,
        auth.user_id, body.bank_name, body.account_suffix
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({"error": e.to_string()}))
    ))?;

    if let Some(row) = existing {
        return Ok(Json(serde_json::json!({
            "ok": true,
            "account_id": row.id,
            "created": false
        })));
    }

    // Create new account record
    let account = sqlx::query!(
        "INSERT INTO user_accounts (user_id, is_confirmed, is_primary)
         VALUES ($1, false, false)
         RETURNING id",
        auth.user_id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({"error": e.to_string()}))
    ))?;

    // Insert details
    sqlx::query!(
        "INSERT INTO user_account_details
           (account_id, bank_name, account_suffix, account_type)
         VALUES ($1, $2, $3, $4)",
        account.id,
        body.bank_name,
        body.account_suffix,
        body.account_type.unwrap_or_else(|| "savings".to_string())
    )
    .execute(&state.pool)
    .await
    .map_err(|e| (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({"error": e.to_string()}))
    ))?;

    Ok(Json(serde_json::json!({
        "ok": true,
        "account_id": account.id,
        "created": true,
        "message": "New account discovered — please confirm in app"
    })))
}

// PATCH /accounts/:id — update display name, confirm, set primary
pub async fn update(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
    Json(body): Json<UpdateAccount>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    // Verify ownership
    let owns = sqlx::query!(
        "SELECT id FROM user_accounts WHERE id = $1 AND user_id = $2",
        id, auth.user_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({"error": e.to_string()}))
    ))?;

    if owns.is_none() {
        return Err((
            axum::http::StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Account not found"}))
        ));
    }

    // If setting as primary, unset others first
    if body.is_primary == Some(true) {
        sqlx::query!(
            "UPDATE user_accounts SET is_primary = false WHERE user_id = $1",
            auth.user_id
        )
        .execute(&state.pool)
        .await
        .map_err(|e| (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()}))
        ))?;
    }

    // Update main record
    if let Some(confirmed) = body.is_confirmed {
        sqlx::query!(
            "UPDATE user_accounts SET is_confirmed = $1 WHERE id = $2",
            confirmed, id
        ).execute(&state.pool).await.ok();
    }
    if let Some(primary) = body.is_primary {
        sqlx::query!(
            "UPDATE user_accounts SET is_primary = $1 WHERE id = $2",
            primary, id
        ).execute(&state.pool).await.ok();
    }

    // Update details
    if let Some(name) = &body.display_name {
        sqlx::query!(
            "UPDATE user_account_details SET display_name = $1 WHERE account_id = $2",
            name, id
        ).execute(&state.pool).await.ok();
    }

    Ok(Json(serde_json::json!({"ok": true})))
}

// DELETE /accounts/:id — remove unconfirmed account
pub async fn remove(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i32>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let result = sqlx::query!(
        "DELETE FROM user_accounts WHERE id = $1 AND user_id = $2 AND is_confirmed = false",
        id, auth.user_id
    )
    .execute(&state.pool)
    .await
    .map_err(|e| (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({"error": e.to_string()}))
    ))?;

    if result.rows_affected() == 0 {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Cannot remove confirmed account"}))
        ));
    }

    Ok(Json(serde_json::json!({"ok": true})))
}
