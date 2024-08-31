# Stage 1: Download and extract lego binary
FROM debian:bullseye-slim AS builder

# Install wget and tar
RUN apt-get update && apt-get install -y wget tar && rm -rf /var/lib/apt/lists/*

# Download and extract lego binary
WORKDIR /tmp
RUN wget https://github.com/go-acme/lego/releases/download/v4.17.4/lego_v4.17.4_linux_amd64.tar.gz && \
    tar -xzf lego_v4.17.4_linux_amd64.tar.gz

# Stage 2: Setup bun environment and copy lego binary
FROM oven/bun:slim

WORKDIR /app

# Copy lego binary from builder stage
COPY --from=builder /tmp/lego /usr/local/bin/lego

# Install openssl and ca-certificates
RUN apt update && apt install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/* && rm -rf /var/cache/apt/*

# Copy package files and install dependencies
COPY package.json bun.lockb ./
RUN bun install

# Copy application code
COPY . .

ENTRYPOINT ["bun", "src/app.ts"]
