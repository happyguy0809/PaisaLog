// src/api/customer.rs
// Customer profile management (Belief 15 — PII kept separate)

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use crate::api::AppState;
use crate::middleware::auth::AuthUser;

#[derive(Serialize)]
pub struct CustomerProfile {
    pub full_name:      Option<String>,
    pub age_bracket:    Option<String>,
    pub gender:         Option<String>,
    pub city:           Option<String>,
    pub pin_code:       Option<String>,
    pub income_bracket: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateCustomerProfile {
    pub full_name:   Option<String>,
    pub gender:      Option<String>,
    pub city:        Option<String>,
    pub pin_code:    Option<String>,
    pub date_of_birth: Option<String>,  // YYYY-MM-DD — stored as age_bracket only
}

// GET /me/profile
pub async fn get_profile(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<CustomerProfile>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let row = sqlx::query!(
        r#"SELECT full_name, age_bracket, gender, city, pin_code, income_bracket
           FROM customer_details WHERE user_id = $1"#,
        auth.user_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({"error": e.to_string()}))
    ))?;

    Ok(Json(match row {
        Some(r) => CustomerProfile {
            full_name:      r.full_name,
            age_bracket:    r.age_bracket,
            gender:         r.gender,
            city:           r.city,
            pin_code:       r.pin_code,
            income_bracket: r.income_bracket,
        },
        None => CustomerProfile {
            full_name: None, age_bracket: None, gender: None,
            city: None, pin_code: None, income_bracket: None,
        }
    }))
}

// PATCH /me/profile
pub async fn update_profile(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<UpdateCustomerProfile>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    // Compute age bracket from DOB if provided — never store raw DOB
    let age_bracket = body.date_of_birth.as_ref().and_then(|dob| {
        let birth_year: i32 = dob.split('-').next()?.parse().ok()?;
        let current_year = chrono::Utc::now().format("%Y").to_string().parse::<i32>().ok()?;
        let age = current_year - birth_year;
        Some(match age {
            0..=18  => "under-18",
            19..=25 => "19-25",
            26..=30 => "26-30",
            31..=35 => "31-35",
            36..=40 => "36-40",
            41..=45 => "41-45",
            46..=50 => "46-50",
            51..=60 => "51-60",
            _       => "60+",
        }.to_string())
    });

    sqlx::query!(
        r#"INSERT INTO customer_details
             (user_id, full_name, gender, city, pin_code, age_bracket, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             full_name   = COALESCE($2, customer_details.full_name),
             gender      = COALESCE($3, customer_details.gender),
             city        = COALESCE($4, customer_details.city),
             pin_code    = COALESCE($5, customer_details.pin_code),
             age_bracket = COALESCE($6, customer_details.age_bracket),
             updated_at  = NOW()"#,
        auth.user_id,
        body.full_name,
        body.gender,
        body.city,
        body.pin_code,
        age_bracket,
    )
    .execute(&state.pool)
    .await
    .map_err(|e| (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({"error": e.to_string()}))
    ))?;

    Ok(Json(serde_json::json!({"ok": true})))
}
