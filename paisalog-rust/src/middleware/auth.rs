use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, HeaderMap},
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use crate::{api::AppState, errors::AppError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub:       i32,
    pub plan:      String,
    pub sync_mode: String,
    pub juris:     String,
    pub exp:       usize,
    pub iat:       usize,
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id:      i32,
    pub plan:         String,
    pub sync_mode:    String,
    pub jurisdiction: String,
}

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let secret = &state.cfg.jwt_secret;

        let token = extract_bearer(&parts.headers)
            .ok_or(AppError::InvalidToken)?;

        let mut validation = Validation::default();
        validation.validate_aud = false;

        let token_data = decode::<Claims>(
            &token,
            &DecodingKey::from_secret(secret.as_bytes()),
            &validation,
        )
        .map_err(|e| {
            tracing::error!("JWT decode failed: {:?}", e);
            AppError::SessionExpired
        })?;

        Ok(AuthUser {
            user_id:      token_data.claims.sub,
            plan:         token_data.claims.plan,
            sync_mode:    token_data.claims.sync_mode,
            jurisdiction: token_data.claims.juris,
        })
    }
}

fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    let auth = headers.get("Authorization")?.to_str().ok()?;
    auth.strip_prefix("Bearer ").map(|s| s.to_string())
}

pub fn issue_access_token(
    claims:      &Claims,
    secret:      &str,
    expiry_secs: u64,
) -> Result<String, AppError> {
    use jsonwebtoken::{encode, EncodingKey, Header};
    let now = chrono::Utc::now().timestamp() as usize;
    let mut c = claims.clone();
    c.iat = now;
    c.exp = now + expiry_secs as usize;
    encode(&Header::default(), &c, &EncodingKey::from_secret(secret.as_bytes()))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("JWT encoding failed: {}", e)))
}
