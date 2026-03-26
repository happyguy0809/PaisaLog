use chrono::{Duration, Utc};
use sqlx::PgPool;

use crate::{
    config::Config,
    db::queries,
    errors::{AppError, AppResult},
    middleware::auth::{Claims, issue_access_token},
    services::{crypto, fingerprint},
};

pub struct TokenPair {
    pub access_token:  String,
    pub refresh_token: String,
}

// ── Request magic link ────────────────────────────────────────
pub async fn request_magic_link(
    pool:       &PgPool,
    cfg:        &Config,
    email:      &str,
    jurisdiction:&str,
) -> AppResult<()> {
    let email_hash = fingerprint::hash_email(email);

    // Upsert user — never reveals whether account existed
    let user = queries::upsert_user(pool, &email_hash, jurisdiction).await?;

    // Reject soft-deleted users silently
    if user.deleted_at.is_some() {
        return Ok(());
    }

    let token      = crypto::generate_token(32);
    let token_hash = fingerprint::hash_token(&token);
    let expires_at = Utc::now() + Duration::minutes(cfg.magic_link_expiry_mins as i64);

    queries::create_magic_token(pool, user.id, &token_hash, expires_at).await?;

    // Build sign-in link
    let link = format!("{}/auth/verify?token={}&uid={}", cfg.api_base_url, token, user.id);

    // Send email — fire and forget so the response is always the same time
    let cfg_clone  = cfg.clone();
    let email_str  = email.to_string();
    tokio::spawn(async move {
        if let Err(e) = send_magic_link_email(&cfg_clone, &email_str, &link).await {
            tracing::error!(error = %e, "Failed to send magic link email");
        }
    });

    Ok(())
}

// ── Verify magic link ─────────────────────────────────────────
pub async fn verify_magic_link(
    pool:    &PgPool,
    cfg:     &Config,
    token:   &str,
    user_id: i32,
) -> AppResult<TokenPair> {
    let token_hash = fingerprint::hash_token(token);
    let consumed   = queries::consume_magic_token(pool, &token_hash, user_id).await?;

    if !consumed {
        return Err(AppError::InvalidToken);
    }

    let user = queries::get_user_by_id(pool, user_id)
        .await?
        .ok_or(AppError::NotFound)?;

    issue_pair(pool, cfg, &user).await
}

// ── Refresh token ─────────────────────────────────────────────
pub async fn refresh(
    pool:          &PgPool,
    cfg:           &Config,
    refresh_token: &str,
) -> AppResult<TokenPair> {
    let token_hash = fingerprint::hash_token(refresh_token);
    let user_id    = queries::consume_refresh_token(pool, &token_hash)
        .await?
        .ok_or(AppError::SessionExpired)?;

    let user = queries::get_user_by_id(pool, user_id)
        .await?
        .ok_or(AppError::NotFound)?;

    issue_pair(pool, cfg, &user).await
}

// ── Issue token pair ──────────────────────────────────────────
async fn issue_pair(
    pool: &PgPool,
    cfg:  &Config,
    user: &queries::UserRow,
) -> AppResult<TokenPair> {
    let claims = Claims {
        sub:       user.id,
        plan:      user.plan.clone(),
        sync_mode: user.sync_mode.clone(),
        juris:     user.jurisdiction.clone(),
        exp:       0, // set by issue_access_token
        iat:       0,
    };

    tracing::debug!("JWT secret prefix in auth svc: {:?}", &cfg.jwt_secret[..8.min(cfg.jwt_secret.len())]);
    let access_token = issue_access_token(&claims, &cfg.jwt_secret, cfg.jwt_access_expiry_secs)?;

    // Refresh token — opaque random string stored as hash
    let refresh_raw  = crypto::generate_token(40);
    let refresh_hash = fingerprint::hash_token(&refresh_raw);
    let expires_at   = Utc::now() + Duration::seconds(cfg.jwt_refresh_expiry_secs as i64);

    queries::create_refresh_token(pool, user.id, &refresh_hash, expires_at).await?;

    Ok(TokenPair { access_token, refresh_token: refresh_raw })
}

// ── Email sender ──────────────────────────────────────────────
async fn send_magic_link_email(cfg: &Config, to: &str, link: &str) -> anyhow::Result<()> {
    use lettre::{
        message::header::ContentType,
        transport::smtp::authentication::Credentials,
        AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    };

    let html = format!(r#"
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;color:#0f1117;margin:0 0 8px">💳 PaisaLog</h1>
  <p style="color:#555;font-size:14px;margin:0 0 24px">
    Click below to sign in. Link expires in <strong>{} minutes</strong>.
  </p>
  <a href="{}" style="display:inline-block;background:#5b8def;color:#fff;
     text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px">
    Sign in to PaisaLog
  </a>
  <p style="color:#999;font-size:12px;margin:24px 0 0">
    If you didn't request this, ignore this email.
  </p>
</body></html>"#,
        cfg.magic_link_expiry_mins, link);

    let email = Message::builder()
        .from(cfg.from_email.parse()?)
        .to(to.parse()?)
        .subject("Your PaisaLog sign-in link")
        .header(ContentType::TEXT_HTML)
        .body(html)?;

    let creds = Credentials::new(cfg.smtp_user.clone(), cfg.smtp_pass.clone());
    let mailer = if cfg.smtp_port == 465 {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&cfg.smtp_host)?
            .port(cfg.smtp_port)
            .credentials(creds)
            .build()
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&cfg.smtp_host)?
            .port(cfg.smtp_port)
            .credentials(creds)
            .build()
    };

    mailer.send(email).await?;
    Ok(())
}
