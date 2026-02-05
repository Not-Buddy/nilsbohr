FROM rust:1.80 as builder

WORKDIR /app

# Copy source files
COPY . .

# Build the application
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install dependencies needed at runtime
RUN apt-get update && apt-get install -y \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/target/release/backend ./backend

# Expose the port (Railway will set PORT environment variable)
EXPOSE 4000

# Use a startup script to handle Railway's PORT variable
CMD PORT=${PORT:-4000} exec ./backend