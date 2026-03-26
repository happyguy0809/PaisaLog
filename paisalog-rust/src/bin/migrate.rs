use std::{fs, path::Path};
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await?;

    // Create migrations tracking table
    sqlx::raw_sql(r#"
        CREATE TABLE IF NOT EXISTS _migrations (
            id         SERIAL PRIMARY KEY,
            filename   TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    "#)
    .execute(&pool)
    .await?;

    // Read applied migrations
    let applied: Vec<String> = sqlx::query_scalar("SELECT filename FROM _migrations ORDER BY id")
        .fetch_all(&pool)
        .await?;
    let applied_set: std::collections::HashSet<_> = applied.into_iter().collect();

    // Read migration files
    let migrations_dir = Path::new("migrations");
    let mut files: Vec<_> = fs::read_dir(migrations_dir)?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map(|x| x == "sql").unwrap_or(false))
        .map(|e| e.path())
        .collect();
    files.sort();

    for path in &files {
        let filename = path.file_name().unwrap().to_string_lossy().to_string();
        if applied_set.contains(&filename) {
            println!("  ✓ {} (already applied)", filename);
            continue;
        }
        println!("  ▶ Applying {}…", filename);
        let sql = fs::read_to_string(path)?;
        let mut tx = pool.begin().await?;
        sqlx::raw_sql(&sql).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO _migrations (filename) VALUES ($1)")
            .bind(&filename)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        println!("  ✓ {}", filename);
    }

    println!("\nAll migrations applied.");
    Ok(())
}
