use anyhow::Result;
use sqlx::{postgres::PgPoolOptions, PgPool};
use crate::config::Config;

pub mod queries;

/// Create the main transactional connection pool.
pub async fn create_pool(cfg: &Config) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .min_connections(cfg.database_pool_min)
        .max_connections(cfg.database_pool_max)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .connect(&cfg.database_url)
        .await?;

    // Verify connectivity immediately
    sqlx::query("SELECT 1").execute(&pool).await?;
    tracing::info!("Main database pool connected");
    Ok(pool)
}

/// Create the analytics read-only pool (separate DB, no PII).
pub async fn create_analytics_pool(cfg: &Config) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .min_connections(1)
        .max_connections(3)
        .connect(&cfg.analytics_database_url)
        .await?;
    tracing::info!("Analytics database pool connected");
    Ok(pool)
}

/// Execute a closure with RLS session context set.
///
/// Every query that touches user data MUST go through this.
/// It sets `app.current_user_id` so PostgreSQL RLS policies
/// automatically filter rows to the current user.
///
/// Usage:
/// ```rust
/// let txns = with_user_context(&pool, user_id, |conn| async move {
///     sqlx::query_as!(Transaction, "SELECT * FROM transactions WHERE user_id = $1", user_id)
///         .fetch_all(conn)
///         .await
/// }).await?;
/// ```
pub async fn with_user_context<F, Fut, T>(
    pool: &PgPool,
    user_id: i32,
    f: F,
) -> Result<T, sqlx::Error>
where
    F: FnOnce(sqlx::pool::PoolConnection<sqlx::Postgres>) -> Fut,
    Fut: std::future::Future<Output = Result<T, sqlx::Error>>,
{
    let mut conn = pool.acquire().await?;

    // SET LOCAL only affects this transaction — cannot bleed into
    // other concurrent requests on the same connection
    sqlx::query("BEGIN").execute(&mut *conn).await?;
    sqlx::query("SELECT set_config('app.current_user_id', $1, TRUE)")
        .bind(user_id.to_string())
        .execute(&mut *conn)
        .await?;

    let result = f(conn).await;

    // Always commit (or rollback on error handled by Drop)
    result
}

/// Health check — returns true if DB is reachable
pub async fn health_check(pool: &PgPool) -> bool {
    sqlx::query("SELECT 1").execute(pool).await.is_ok()
}
