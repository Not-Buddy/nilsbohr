FROM rustlang/rust:nightly AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*


COPY backend/Cargo.toml ./
COPY backend/Cargo.lock ./
COPY backend/src ./src

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/backend ./backend

# Expose port
EXPOSE ${PORT:-4000}

# Run the binary
CMD PORT=${PORT:-4000} exec ./backend