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

pub fn build_router(state: AppState) -> Router {
    Router::new()
        // ── Health ──────────────────────────────────────────
        .route("/health", get(health))

        // ── Auth ─────────────────────────────────────────────
        .route("/auth/magic",   post(auth::request_magic_link))
        .route("/auth/verify",  get(auth::verify_magic_link))
        .route("/auth/refresh", post(auth::refresh))
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
