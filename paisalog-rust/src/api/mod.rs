pub mod auth;
pub mod transactions;
pub mod accounts;
pub mod customer;
pub mod household;
pub mod refunds;
pub mod user;
pub mod cash;
pub mod investments;
pub mod children;
pub mod export;
pub mod sms_review;

use axum::{routing::{get, post, patch, delete}, Router};
use sqlx::PgPool;
use std::sync::Arc;
use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub pool:    PgPool,
    pub cfg:     Arc<Config>,
}


async fn assetlinks() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!([{
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {
            "namespace": "android_app",
            "package_name": "com.paisalogapp",
            "sha256_cert_fingerprints": [
                "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C"
            ]
        }
    }]))
}


// ── Magic link redirect ──────────────────────────────────────
// Converts https magic link to custom scheme so the app opens directly
// Email client clicks https://api.engineersindia.co.in/auth/verify?token=X&uid=Y
// This redirects to paisalog://auth/verify?token=X&uid=Y
async fn magic_link_redirect(
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl axum::response::IntoResponse {
    let token = params.get("token").cloned().unwrap_or_default();
    let uid   = params.get("uid").cloned().unwrap_or_default();
    let deep_link = format!("paisalog://auth/verify?token={}&uid={}", token, uid);
    // Return HTML that immediately redirects to the custom scheme
    // Falls back to a tap-to-open button if auto-redirect fails
    let html = format!(r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Opening PaisaLog...</title>
  <meta http-equiv="refresh" content="0;url={dl}">
  <style>
    body {{ font-family: sans-serif; text-align: center; padding: 40px; background: #F7F7F5; }}
    a {{ display: inline-block; margin-top: 20px; padding: 14px 28px;
         background: #2563EB; color: white; border-radius: 8px;
         text-decoration: none; font-size: 16px; }}
  </style>
</head>
<body>
  <h2>Opening PaisaLog...</h2>
  <p>If the app doesn't open automatically:</p>
  <a href="{dl}">Tap to open PaisaLog</a>
  <script>window.location.href = "{dl}";</script>
</body>
</html>"#, dl = deep_link);
    axum::response::Html(html)
}


// ── Transfer detection endpoint ──────────────────────────────
async fn detect_transfers_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    auth: crate::middleware::auth::AuthUser,
) -> Result<axum::Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let pairs = crate::services::transfer_detection::detect_transfers(&state.pool, auth.user_id)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(axum::Json(serde_json::json!({ "pairs_found": pairs })))
}

pub fn build_router(state: AppState) -> Router {
    Router::new()
        // ── Health ──────────────────────────────────────────
        .route("/health", get(health))

        // ── Auth ─────────────────────────────────────────────
        .route("/auth/magic",   post(auth::request_magic_link))
        .route("/auth/verify",  get(magic_link_redirect))
        .route("/auth/refresh", post(auth::refresh))
        .route("/auth/confirm",  get(auth::verify_magic_link))
        .route("/auth/logout",  post(auth::logout))

        // ── User ─────────────────────────────────────────────
        .route("/me",           get(user::get_me).patch(user::update_me).delete(user::delete_me))
        .route("/me/consent",   patch(user::update_consent))
        .route("/me/export",    get(export::export_my_data))

        // ── Transactions ──────────────────────────────────────
        .route("/transactions",          post(transactions::ingest_one))
        .route("/transactions/batch",    post(transactions::ingest_batch))
        .route("/transactions",          get(transactions::list))
        .route("/transactions/summary",  get(transactions::summary))
        .route("/transactions/apps",     get(transactions::apps))
        .route("/transactions/raw-log",  get(transactions::raw_log))
        .route("/transactions/:id/note", patch(transactions::add_note))
        .route("/transactions/:id",          delete(transactions::delete_transaction))
        .route("/transactions/:id/visibility", patch(transactions::set_visibility))
        .route("/transactions/deleted",        get(transactions::deleted_list))
        .route("/transactions/:id/restore",    post(transactions::restore))
        .route("/transactions/hidden",       get(transactions::hidden_list))
        .route("/transactions/:id/promote", post(transactions::promote))
        .route("/transactions/:id/correct", patch(transactions::correct))

        // ── Accounts (auto-discovery) ────────────────────────
        .route("/accounts",           get(accounts::list))
        .route("/accounts/discover",  post(accounts::discover))
        .route("/accounts/:id",       axum::routing::patch(accounts::update)
                                            .delete(accounts::remove))
        // ── Customer profile (PII) ────────────────────────────
        .route("/me/profile",         get(customer::get_profile)
                                            .patch(customer::update_profile))
        // ── Household ─────────────────────────────────────────
        .route("/household",                    post(household::create))
        .route("/household/join",               post(household::join))
        .route("/household/:id/members",        get(household::members))
        .route("/household/:id/summary",        get(household::summary))
        .route("/household/:id/splits",         post(household::add_split))
        .route("/household/:id/splits/unsettled", get(household::unsettled_splits))
        .route("/household/:id/invite/regenerate", post(household::regenerate_invite))
        .route("/household/:id/leave",            post(household::leave))
        .route("/household/:id/targets",          get(household::get_targets).post(household::set_target))
        .route("/targets",                        get(household::get_personal_targets).post(household::set_personal_target))
        .route("/households",                     get(household::my_households))
        .route("/household/:id/transactions",     get(household::household_transactions))

        // ── Children ────────────────────────────────────────────
        .route("/children",                   post(children::link).get(children::list))
        .route("/children/:id",               patch(children::update).delete(children::unlink))
        .route("/children/:id/transactions",  get(children::child_transactions))
        // ── Investments ─────────────────────────────────────────
        .route("/investments/summary",      get(investments::summary))
        .route("/investments/breakdown",    get(investments::breakdown))
        .route("/investments/transactions", get(investments::list))
        // ── Cash ────────────────────────────────────────────────
        .route("/cash",              post(cash::create).get(cash::list))
        .route("/cash/unaccounted",  get(cash::unaccounted))
        .route("/cash/:id",          axum::routing::delete(cash::delete))
        // ── Refunds ───────────────────────────────────────────
        .route("/refunds",        get(refunds::list).post(refunds::create))
        .route("/refunds/:id",    patch(refunds::update_status))


        // ── SMS Review queue ─────────────────────────────────
        .route("/sms/review",              post(sms_review::submit))
        .route("/sms/review",              get(sms_review::list))
        .route("/sms/review/:id/approve",  patch(sms_review::approve))
        .route("/sms/review/:id/reject",   patch(sms_review::reject))

        // ── Android App Links verification ──────────────────
        .route("/.well-known/assetlinks.json", get(assetlinks))
        .route("/transactions/detect-transfers", post(detect_transfers_handler))
        .with_state(state)
}

async fn health(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> axum::Json<serde_json::Value> {
    let db_ok = crate::db::health_check(&state.pool).await;
    axum::Json(serde_json::json!({
        "status": if db_ok { "ok" } else { "degraded" },
        "db":     if db_ok { "connected" } else { "error" },
        "ts":     chrono::Utc::now().to_rfc3339(),
    }))
}
// merchant enrichment endpoint added below in merchants module
