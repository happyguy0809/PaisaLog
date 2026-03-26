use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use crate::{
    api::AppState,
    compliance::{rules_for, Jurisdiction},
    db::queries,
    errors::{AppError, AppResult},
    middleware::auth::AuthUser,
    services::fingerprint,
};

#[derive(Serialize)]
pub struct MeResponse {
    pub id:                          i32,
    pub name:                        String,
    pub plan:                        String,
    pub sync_mode:                   String,
    pub jurisdiction:                String,
    pub analytics_consent:           bool,
    pub marketing_consent:           bool,
    pub locale:                      String,
    pub timezone:                    String,
    pub home_currency:               String,
    pub income_visible_to_family:    bool,
    pub created_at:                  String,
}

pub async fn get_me(
    State(state): State<AppState>,
    auth:         AuthUser,
) -> AppResult<Json<MeResponse>> {
    let user = queries::get_user_by_id(&state.pool, auth.user_id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(MeResponse {
        id:                user.id,
        name:              user.name.unwrap_or_default(),
        plan:              user.plan,
        sync_mode:         user.sync_mode,
        jurisdiction:      user.jurisdiction,
        analytics_consent: user.analytics_consent,
        marketing_consent: user.marketing_consent,
        locale:                   user.locale,
        timezone:                 user.timezone,
        home_currency:            user.home_currency.clone().unwrap_or_else(|| "INR".into()),
        income_visible_to_family: user.income_visible_to_family.unwrap_or(false),
        created_at:               user.created_at.to_rfc3339(),
    }))
}

#[derive(Deserialize)]
pub struct UpdateMeRequest {
    pub name:                     Option<String>,
    pub locale:                   Option<String>,
    pub timezone:                 Option<String>,
    pub home_currency:            Option<String>,
    pub income_visible_to_family: Option<bool>,
}

pub async fn update_me(
    State(state): State<AppState>,
    auth:         AuthUser,
    Json(body):   Json<UpdateMeRequest>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query!(
        r#"
        UPDATE users SET
            name                     = COALESCE($2, name),
            locale                   = COALESCE($3, locale),
            timezone                 = COALESCE($4, timezone),
            home_currency            = COALESCE($5, home_currency),
            income_visible_to_family = COALESCE($6, income_visible_to_family)
        WHERE id = $1
        "#,
        auth.user_id,
        body.name,
        body.locale,
        body.timezone,
        body.home_currency,
        body.income_visible_to_family,
    )
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Consent update — PDPB-compliant ──────────────────────────
#[derive(Deserialize)]
pub struct ConsentRequest {
    pub analytics_consent:  bool,
    pub marketing_consent:  bool,
    /// IP address of user at consent time — required for GDPR
    /// Never stored raw — hashed before writing
    pub ip_address:         Option<String>,
}

pub async fn update_consent(
    State(state): State<AppState>,
    auth:         AuthUser,
    Json(body):   Json<ConsentRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let juris = Jurisdiction::from_locale(&auth.jurisdiction);
    let rules = rules_for(&juris);

    // Check if IP hash is required for this jurisdiction (GDPR)
    let ip_hash = if rules.consent_fields_required().contains(&"consent_ip_hash") {
        let ip = body.ip_address.as_deref().ok_or_else(||
            AppError::Validation("IP address required for consent in this jurisdiction".into())
        )?;
        Some(fingerprint::hash_token(ip)) // SHA-256 of IP — not raw IP
    } else {
        None
    };

    queries::update_user_consent(
        &state.pool,
        auth.user_id,
        body.analytics_consent,
        body.marketing_consent,
        &state.cfg.privacy_policy_version,
        ip_hash.as_deref(),
    )
    .await?;

    Ok(Json(serde_json::json!({
        "ok": true,
        "analytics_consent": body.analytics_consent,
        "marketing_consent": body.marketing_consent,
        "policy_version": state.cfg.privacy_policy_version,
    })))
}

// ── Soft delete — DSAR right to erasure ───────────────────────
pub async fn delete_me(
    State(state): State<AppState>,
    auth:         AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let juris = Jurisdiction::from_locale(&auth.jurisdiction);
    let rules = rules_for(&juris);
    let delay = rules.hard_delete_delay();

    queries::soft_delete_user(&state.pool, auth.user_id).await?;

    // Revoke all tokens immediately
    sqlx::query!(
        "UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1",
        auth.user_id
    )
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({
        "message": format!(
            "Account scheduled for permanent deletion in {} days.",
            delay.num_days()
        ),
        "hard_delete_after_days": delay.num_days(),
    })))
}
