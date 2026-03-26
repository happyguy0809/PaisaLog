//! Simple in-memory rate limiter using a token bucket per IP.
//! Limits: 20 req/sec per IP for general endpoints.
//! Auth endpoints are limited more strictly: 5 req/min per IP.

use std::{
    collections::HashMap,
    net::IpAddr,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
    Json,
};
use std::net::SocketAddr;

#[derive(Clone)]
struct Bucket {
    tokens:     f64,
    last_refill: Instant,
}

impl Bucket {
    fn new(capacity: f64) -> Self {
        Self { tokens: capacity, last_refill: Instant::now() }
    }

    fn consume(&mut self, rate_per_sec: f64, capacity: f64) -> bool {
        let now     = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.tokens = (self.tokens + elapsed * rate_per_sec).min(capacity);
        self.last_refill = now;
        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

#[derive(Clone)]
pub struct RateLimiter {
    buckets:  Arc<Mutex<HashMap<IpAddr, Bucket>>>,
    rate:     f64,
    capacity: f64,
}

impl RateLimiter {
    pub fn new(rate_per_sec: f64, capacity: f64) -> Self {
        Self {
            buckets:  Arc::new(Mutex::new(HashMap::new())),
            rate:     rate_per_sec,
            capacity,
        }
    }

    pub fn check(&self, ip: IpAddr) -> bool {
        let mut map = self.buckets.lock().unwrap();
        let bucket  = map.entry(ip).or_insert_with(|| Bucket::new(self.capacity));
        bucket.consume(self.rate, self.capacity)
    }

    /// Purge stale entries older than 5 minutes (run periodically)
    pub fn purge_stale(&self) {
        let mut map = self.buckets.lock().unwrap();
        map.retain(|_, b| b.last_refill.elapsed() < Duration::from_secs(300));
    }
}

pub async fn rate_limit_middleware(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req:  Request<Body>,
    next: Next,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    // Rate limit: 20 req/sec, burst of 40
    static LIMITER: std::sync::OnceLock<RateLimiter> = std::sync::OnceLock::new();
    let limiter = LIMITER.get_or_init(|| RateLimiter::new(20.0, 40.0));

    if !limiter.check(addr.ip()) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({
                "error":   "RATE_LIMITED",
                "message": "Too many requests — please slow down"
            })),
        ));
    }

    Ok(next.run(req).await)
}

/// Stricter limiter for auth endpoints: 5 req/min per IP
pub async fn auth_rate_limit_middleware(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req:  Request<Body>,
    next: Next,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    static AUTH_LIMITER: std::sync::OnceLock<RateLimiter> = std::sync::OnceLock::new();
    let limiter = AUTH_LIMITER.get_or_init(|| RateLimiter::new(5.0 / 60.0, 5.0));

    if !limiter.check(addr.ip()) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({
                "error":   "RATE_LIMITED",
                "message": "Too many auth attempts — try again later"
            })),
        ));
    }

    Ok(next.run(req).await)
}
