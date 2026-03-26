use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{
    api::AppState,
    compliance::Jurisdiction,
    errors::{AppError, AppResult},
    middleware::auth::AuthUser,
    services::auth as auth_svc,
};

#[derive(Deserialize)]
pub struct MagicLinkRequest {
    pub email:  String,
    /// Optional — client can pass locale to derive jurisdiction
    pub locale: Option<String>,
}

#[derive(Serialize)]
pub struct MessageResponse {
    pub message: String,
}

pub async fn request_magic_link(
    State(state): State<AppState>,
    Json(body):   Json<MagicLinkRequest>,
) -> AppResult<Json<MessageResponse>> {
    if body.email.is_empty() || !body.email.contains('@') {
        return Err(AppError::Validation("Invalid email".into()));
    }

    let locale      = body.locale.as_deref().unwrap_or("en-IN");
    let jurisdiction = Jurisdiction::from_locale(locale).as_str().to_string();

    // Always returns the same message — don't reveal account existence
    auth_svc::request_magic_link(&state.pool, &state.cfg, &body.email, &jurisdiction).await?;

    Ok(Json(MessageResponse {
        message: "If this email is registered, a sign-in link has been sent.".into(),
    }))
}

#[derive(Deserialize)]
pub struct VerifyQuery {
    pub token: String,
    pub uid:   i32,
}

#[derive(Serialize)]
pub struct TokenResponse {
    pub access_token:  String,
    pub refresh_token: String,
}

pub async fn verify_magic_link(
    State(state): State<AppState>,
    Query(q):     Query<VerifyQuery>,
) -> AppResult<Json<TokenResponse>> {
    let pair = auth_svc::verify_magic_link(&state.pool, &state.cfg, &q.token, q.uid).await?;
    Ok(Json(TokenResponse {
        access_token:  pair.access_token,
        refresh_token: pair.refresh_token,
    }))
}

#[derive(Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

pub async fn refresh(
    State(state): State<AppState>,
    Json(body):   Json<RefreshRequest>,
) -> AppResult<Json<TokenResponse>> {
    let pair = auth_svc::refresh(&state.pool, &state.cfg, &body.refresh_token).await?;
    Ok(Json(TokenResponse {
        access_token:  pair.access_token,
        refresh_token: pair.refresh_token,
    }))
}

pub async fn logout(
    State(state): State<AppState>,
    auth:         AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    // Revoke all refresh tokens for this user
    sqlx::query!(
        "UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1",
        auth.user_id
    )
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
