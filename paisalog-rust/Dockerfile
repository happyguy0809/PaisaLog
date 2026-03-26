# ── Build stage ───────────────────────────────────────────────
FROM rust:1.78-slim-bookworm AS builder

WORKDIR /app

# Cache dependencies separately
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main(){}" > src/main.rs
RUN cargo build --release 2>/dev/null; rm -rf src

# Build the real source
COPY src ./src
COPY migrations ./migrations
RUN touch src/main.rs
RUN cargo build --release

# ── Runtime stage ─────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/paisalog  ./paisalog
COPY --from=builder /app/target/release/migrate   ./migrate
COPY --from=builder /app/migrations               ./migrations

# Run migrations then start server
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]
