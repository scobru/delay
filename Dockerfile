# Delay Full Stack Container
# Includes: IPFS, Relay Server

FROM node:20-slim
# delete cache

# =============================================================================
# BUILD ARGUMENTS (passed by CapRover or docker build)
# =============================================================================

# --- Build/Deploy ---
ARG CAPROVER_GIT_COMMIT_SHA
ARG IPFS_VERSION=0.29.0

ARG RELAY_HOST
ARG RELAY_PORT
ARG RELAY_NAME
ARG RELAY_ENDPOINT
ARG RELAY_PROTECTED
ARG WELCOME_MESSAGE
ARG RELAY_PATH 
ARG WORMHOLE_ENABLED
ARG RELAY_STORE 

ARG NODE_ENV
ARG LOG_LEVEL
ARG DEBUG

# --- Authentication ---
ARG ADMIN_PASSWORD
ARG RELAY_SEA_KEYPAIR
ARG RELAY_SEA_KEYPAIR_PATH
ARG GENERATE_RELAY_KEYS=false

# --- GunDB/Storage ---
ARG GUN_PEERS
ARG RELAY_PEERS
ARG DISABLE_RADISK
ARG CLEANUP_CORRUPTED_DATA
ARG DATA_DIR

# --- IPFS ---
ARG IPFS_ENABLED 
ARG IPFS_API_URL
ARG IPFS_API_KEY
ARG IPFS_API_TOKEN
ARG IPFS_GATEWAY_URL
ARG IPFS_PIN_TIMEOUT_MS
ARG IPFS_PATH
ARG IPFS_DATA_DIR 



# --- Drive ---

# --- MinIO/S3 Storage ---
ARG MINIO_ENDPOINT
ARG MINIO_ACCESS_KEY
ARG MINIO_SECRET_KEY
ARG MINIO_BUCKET
ARG MINIO_USE_SSL
ARG MINIO_REGION

# --- Network/Security ---
ARG AUTO_REPLICATION
ARG CORS_ORIGINS
ARG CORS_CREDENTIALS
ARG STRICT_SESSION_IP

ARG LEGACY_RADATA_DIR

# --- Zen Sync Engine ---
ARG ZEN_ENABLED
ARG ZEN_PATH
ARG ZEN_DATA_DIR

# =============================================================================
# ENVIRONMENT VARIABLES (Persist ARGs to Runtime)
# =============================================================================

ENV IPFS_ENABLED=${IPFS_ENABLED} \
    WORMHOLE_ENABLED=${WORMHOLE_ENABLED}

ENV RELAY_HOST=${RELAY_HOST} \
    RELAY_PORT=${RELAY_PORT} \
    RELAY_NAME=${RELAY_NAME} \
    RELAY_ENDPOINT=${RELAY_ENDPOINT} \
    RELAY_PROTECTED=${RELAY_PROTECTED} \
    WELCOME_MESSAGE=${WELCOME_MESSAGE} \
    NODE_ENV=${NODE_ENV} \
    LOG_LEVEL=${LOG_LEVEL} \
    DEBUG=${DEBUG}

ENV ADMIN_PASSWORD=${ADMIN_PASSWORD}

ENV RELAY_SEA_KEYPAIR=${RELAY_SEA_KEYPAIR} \
    RELAY_SEA_KEYPAIR_PATH=${RELAY_SEA_KEYPAIR_PATH}

ENV RELAY_PEERS=${RELAY_PEERS} \
    GUN_PEERS=${GUN_PEERS} \
    DISABLE_RADISK=${DISABLE_RADISK} \
    CLEANUP_CORRUPTED_DATA=${CLEANUP_CORRUPTED_DATA} \
    DATA_DIR=${DATA_DIR}

ENV IPFS_API_URL=${IPFS_API_URL} \
    IPFS_API_KEY=${IPFS_API_KEY} \
    IPFS_API_TOKEN=${IPFS_API_TOKEN} \
    IPFS_GATEWAY_URL=${IPFS_GATEWAY_URL} \
    IPFS_PIN_TIMEOUT_MS=${IPFS_PIN_TIMEOUT_MS}

# Global RPC
ENV BASE_SEPOLIA_RPC=${BASE_SEPOLIA_RPC} \
    BASE_RPC=${BASE_RPC} \
    SEPOLIA_RPC=${SEPOLIA_RPC} \
    MAINNET_RPC=${MAINNET_RPC} \
    ARBITRUM_RPC=${ARBITRUM_RPC} \
    ARBITRUM_SEPOLIA_RPC=${ARBITRUM_SEPOLIA_RPC} \
    OPTIMISM_RPC=${OPTIMISM_RPC} \
    OPTIMISM_SEPOLIA_RPC=${OPTIMISM_SEPOLIA_RPC} \
    POLYGON_RPC=${POLYGON_RPC} \
    POLYGON_AMOY_RPC=${POLYGON_AMOY_RPC}

ENV WORMHOLE_CLEANUP_ENABLED=${WORMHOLE_CLEANUP_ENABLED} \
    WORMHOLE_CLEANUP_INTERVAL_MS=${WORMHOLE_CLEANUP_INTERVAL_MS} \
    WORMHOLE_MAX_AGE_SECS=${WORMHOLE_MAX_AGE_SECS} \
    RELAY_MAX_STORAGE_GB=${RELAY_MAX_STORAGE_GB} \
    RELAY_STORAGE_WARNING_THRESHOLD=${RELAY_STORAGE_WARNING_THRESHOLD} \
    AUTO_REPLICATION=${AUTO_REPLICATION} \
    CORS_ORIGINS=${CORS_ORIGINS} \
    CORS_CREDENTIALS=${CORS_CREDENTIALS} \
    STRICT_SESSION_IP=${STRICT_SESSION_IP} \
    ZEN_ENABLED=${ZEN_ENABLED} \
    ZEN_PATH=${ZEN_PATH} \
    ZEN_DATA_DIR=${ZEN_DATA_DIR}




# Install required system packages
# Using apt-get for Debian-based image
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    dos2unix \
    supervisor \
    build-essential \
    python3 \
    cmake \
    libssl-dev \
    openssh-client \
    && rm -rf /var/lib/apt/lists/* 

# Download and install IPFS Kubo (separate step for better caching and retry)
# Note: Debian-based image uses glibc, so IPFS binary works natively
RUN set -ex \
    && ARCH=$(uname -m) \
    && case $ARCH in \
    x86_64) ARCH_NAME="amd64" ;; \
    aarch64) ARCH_NAME="arm64" ;; \
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;; \
    esac \
    && IPFS_URL="https://dist.ipfs.tech/kubo/v${IPFS_VERSION}/kubo_v${IPFS_VERSION}_linux-${ARCH_NAME}.tar.gz" \
    && echo "Downloading IPFS Kubo v${IPFS_VERSION} for ${ARCH_NAME}..." \
    && echo "URL: ${IPFS_URL}" \
    && mkdir -p /tmp/ipfs-install \
    && cd /tmp/ipfs-install \
    # Use curl with retry and better error handling
    && for i in 1 2 3 4 5; do \
    echo "Download attempt $i..." && \
    curl -fsSL --retry 3 --retry-delay 5 -o kubo.tar.gz "${IPFS_URL}" && break || \
    (echo "Attempt $i failed, waiting..." && sleep 10); \
    done \
    && test -f kubo.tar.gz || (echo "ERROR: Failed to download IPFS after 5 attempts" && exit 1) \
    && ls -lh kubo.tar.gz \
    && echo "Extracting IPFS..." \
    && tar -xzf kubo.tar.gz \
    && test -d kubo && test -f kubo/ipfs || (echo "ERROR: Extraction failed" && ls -la && exit 1) \
    && chmod +x kubo/ipfs \
    && install -m 755 kubo/ipfs /usr/local/bin/ipfs \
    && echo "Testing IPFS binary..." \
    && /usr/local/bin/ipfs version \
    && cd / \
    && rm -rf /tmp/ipfs-install \
    && echo "IPFS installation successful!"

# Create symlink for Node.js (supervisord expects it in /usr/bin)
RUN ln -sf /usr/local/bin/node /usr/bin/node

# Create users and set up directories (Debian syntax)
# Note: These directories will be preserved if volumes are mounted
RUN useradd -m -s /bin/bash ipfs \
    && mkdir -p /data/ipfs \
    && mkdir -p /app/relay \
    && mkdir -p /app/relay/data \
    && mkdir -p /app/keys \
    && mkdir -p /var/log/supervisor \
    && mkdir -p /home/ipfs/.config/ipfs/denylists \
    && mkdir -p /root/.config/ipfs/denylists \
    && chown -R ipfs:ipfs /data/ipfs /home/ipfs/.config || true \
    && chmod -R 755 /home/ipfs/.config /root/.config || true

# Set up relay application
WORKDIR /app

# Copy configuration files first
COPY docker/ /app/docker/

# Convert line endings and set permissions in single layer (better cache)
RUN dos2unix /app/docker/init-ipfs.sh \
    && dos2unix /app/docker/entrypoint.sh \
    && dos2unix /app/docker/verify-volumes.sh || true \
    && chmod +x /app/docker/init-ipfs.sh \
    && chmod +x /app/docker/entrypoint.sh \
    && chmod +x /app/docker/verify-volumes.sh || true \
    && cp /app/docker/entrypoint.sh /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/entrypoint.sh \
    && cp /app/docker/relay.env /app/relay/.env


# Copy ALL relay source files first (before npm install)
# This ensures node_modules won't be overwritten by a subsequent COPY
COPY relay/ /app/relay/
WORKDIR /app/relay

# Remove package-lock.json to avoid cross-platform issues with native binaries (rollup, esbuild)
# The lock file from Windows includes Windows-specific optional deps that break Linux builds
# Also remove any local node_modules that might have been copied (despite .dockerignore)
RUN rm -f package-lock.json && rm -rf node_modules && \
    echo "Cleaned up: node_modules and package-lock.json removed"


# Install ALL dependencies (including devDependencies for dashboard build)
# Force include dev dependencies even if NODE_ENV=production is set
RUN NODE_ENV=development npm install --include=dev

# Restore the missing script/ folder of the zen package.
# We use the local zen workspace copy (../zen/script) instead of cloning from GitHub
# to ensure the latest server.js with /status and /.well-known/peers.json HTTP routes is used.
COPY zen-script/ node_modules/zen/script/

# Build shogun-contracts SDK if needed (for local installations)
# This ensures the SDK is compiled even if shogun-contracts is installed locally
RUN if [ -d "node_modules/shogun-contracts/sdk" ] && [ ! -f "node_modules/shogun-contracts/sdk/dist/index.js" ]; then \
    echo "🔨 Building shogun-contracts SDK..." && \
    cd node_modules/shogun-contracts && \
    npm run build:sdk 2>/dev/null || echo "⚠️  SDK build skipped (may already be compiled)"; \
    fi

# Build React Dashboard (SPA) using relay's package.json
# Vite and TypeScript are in devDependencies, so we need them installed
# Run vite directly from node_modules to avoid npx version conflicts
RUN echo "🔨 Building React Dashboard..." && \
    cd src/public/dashboard && \
    ../../../node_modules/.bin/vite build && \
    echo "✅ Dashboard built successfully" && \
    ls -la dist/ && \
    test -f dist/index.html || (echo "❌ Dashboard build verification failed - dist/index.html not found" && exit 1)

# Prune devDependencies to reduce image size
RUN npm prune --omit=dev

# Verify dashboard still exists after prune (debugging)
RUN echo "🔍 Verifying dashboard after prune..." && \
    ls -la src/public/dashboard/ && \
    ls -la src/public/dashboard/dist/ && \
    test -f src/public/dashboard/dist/index.html && \
    echo "✅ Dashboard verified at /app/relay/src/public/dashboard/dist/" && \
    echo "📍 Full path: $(pwd)/src/public/dashboard/dist/index.html"

# Optionally generate relay SEA keypair if requested
# This creates the keypair during build time
RUN if [ "$GENERATE_RELAY_KEYS" = "true" ] && [ -z "$RELAY_SEA_KEYPAIR" ] && [ -z "$RELAY_SEA_KEYPAIR_PATH" ]; then \
    echo "🔑 Generating relay SEA keypair..." && \
    mkdir -p /app/keys && \
    node /app/relay/scripts/generate-relay-keys-standalone.cjs /app/keys/relay-keypair.json && \
    echo "✅ Keypair generated at /app/keys/relay-keypair.json" && \
    echo "⚠️  IMPORTANT: Mount this file or copy it to a secure location!"; \
    else \
    echo "⏭️  Skipping keypair generation (use GENERATE_RELAY_KEYS=true to enable)"; \
    fi

# Set proper permissions
# Note: Volumes will override these permissions, but we set them here for initial setup
# Use || true to avoid failures if directories don't exist or are already mounted as volumes
RUN chown -R node:node /app || true \
    && chown -R node:node /app/relay/data || true \
    && chown -R node:node /app/keys || true \
    && chown -R ipfs:ipfs /data/ipfs || true \
    && chmod -R 755 /app/relay/src/public || true \
    && chmod 755 /app/relay/data || true \
    && chmod 755 /app/keys || true

# Final verification - ensure dashboard is accessible
RUN echo "🔍 Final dashboard verification..." && \
    ls -la /app/relay/src/public/dashboard/dist/ && \
    cat /app/relay/src/public/dashboard/dist/index.html | head -5 && \
    echo "✅ Dashboard files verified and readable"

# Expose ports
# 8420 = Relay server, 5001 = IPFS API, 8080 = IPFS Gateway, 4001 = IPFS Swarm
EXPOSE 8420 5001 8080 4001

# Health check (dynamically uses RELAY_PORT or PORT, falls back to 8420)
HEALTHCHECK --interval=30s --timeout=30s --start-period=180s --retries=5 \
    CMD curl -f http://127.0.0.1:${RELAY_PORT:-${PORT:-8420}}/health || exit 1

# Use supervisor to manage multiple services
RUN mkdir -p /etc/supervisor/conf.d
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Set environment variables
ENV NODE_ENV=production
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Start all services with supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
