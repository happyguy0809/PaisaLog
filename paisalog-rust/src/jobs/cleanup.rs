// src/jobs/cleanup.rs
// Automated cleanup jobs — Belief 21: data retention policy

use sqlx::PgPool;
use tracing::{info, error};

pub async fn run_daily_cleanup(pool: &PgPool) {
    info!("Starting daily cleanup job");

    match sqlx::query!(
        "DELETE FROM transactions WHERE deleted_at IS NOT NULL
         AND deleted_at < NOW() - INTERVAL '30 days'"
    ).execute(pool).await {
        Ok(r)  => info!("Purged {} soft-deleted transactions", r.rows_affected()),
        Err(e) => error!("Failed to purge deleted transactions: {}", e),
    }

    match sqlx::query!(
        "DELETE FROM spend_contributions WHERE created_at < NOW() - INTERVAL '7 days'"
    ).execute(pool).await {
        Ok(r)  => info!("Purged {} spend contributions", r.rows_affected()),
        Err(e) => error!("Failed to purge spend contributions: {}", e),
    }

    match sqlx::query!(
        "DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '90 days'"
    ).execute(pool).await {
        Ok(r)  => info!("Purged {} audit log rows", r.rows_affected()),
        Err(e) => error!("Failed to purge audit log: {}", e),
    }

    info!("Daily cleanup complete");
}

pub async fn run_monthly_cleanup(pool: &PgPool) {
    info!("Starting monthly cleanup job");

    match sqlx::query!(
        "DELETE FROM spend_benchmarks
         WHERE computed_at < NOW() - INTERVAL '2 years'
         AND LENGTH(week) = 8"
    ).execute(pool).await {
        Ok(r)  => info!("Deleted {} old weekly benchmarks", r.rows_affected()),
        Err(e) => error!("Failed to delete old benchmarks: {}", e),
    }

    match sqlx::query!(
        "DELETE FROM audit_log_summary WHERE date < CURRENT_DATE - INTERVAL '1 year'"
    ).execute(pool).await {
        Ok(r)  => info!("Purged {} audit summary rows", r.rows_affected()),
        Err(e) => error!("Failed to purge audit summary: {}", e),
    }

    info!("Monthly cleanup complete");
}
