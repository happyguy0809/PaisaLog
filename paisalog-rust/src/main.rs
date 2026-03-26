mod api;
mod jobs;
mod compliance;
mod config;
mod db;
mod errors;
mod middleware;
mod parser;
mod services;

use std::sync::Arc;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
    compression::CompressionLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};


async fn security_headers(
    mut response: axum::response::Response,
) -> axum::response::Response {
    use axum::http::HeaderValue;
    let h = response.headers_mut();
    h.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    h.insert("x-frame-options",        HeaderValue::from_static("DENY"));
    h.insert("x-xss-protection",       HeaderValue::from_static("1; mode=block"));
    h.insert("referrer-policy",        HeaderValue::from_static("no-referrer"));
    response
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // ── Logging ───────────────────────────────────────────────
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "paisalog=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // ── Config ────────────────────────────────────────────────
    let cfg = config::Config::from_env()?;
    tracing::info!(env = ?cfg.environment, "PaisaLog starting");

    // ── Database ──────────────────────────────────────────────
    let pool = db::create_pool(&cfg).await?;

    // ── Scheduler ─────────────────────────────────────────────
    if cfg.is_production() {
        let pool_sched = pool.clone();
        tokio::spawn(async move {
            if let Err(e) = services::scheduler::start(pool_sched).await {
                tracing::error!(error = %e, "Scheduler failed to start");
            }
        });
    }

    // ── Router ────────────────────────────────────────────────
    let state = api::AppState {
        pool: pool.clone(),
        cfg:  Arc::new(cfg.clone()),
    };

    let cors = CorsLayer::new()
        .allow_origin(
            cfg.web_base_url.parse::<axum::http::HeaderValue>()
                .unwrap_or(axum::http::HeaderValue::from_static("*"))
        )
        .allow_methods(Any)
        .allow_headers(Any);

    let app = api::build_router(state)
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
        .layer(cors)
        .layer(axum::middleware::map_response(security_headers));

    // ── Listen ────────────────────────────────────────────────
    let addr = format!("{}:{}", cfg.host, cfg.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(%addr, "Listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c().await.expect("Failed to listen for SIGINT");
    tracing::info!("Shutdown signal received");
}
