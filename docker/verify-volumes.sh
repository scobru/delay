#!/bin/sh
# Script to verify that Docker volumes are mounted correctly
# This helps prevent data loss during deploys

set -e

echo "🔍 Verifying Docker Volume Mounts"
echo "=================================="
echo ""

ERRORS=0
WARNINGS=0

# Check if /data is mounted as a volume
echo "📦 Checking unified data volume (/data)..."
if mountpoint -q /data 2>/dev/null; then
    echo "✅ /data is mounted as a volume (data will persist)"
else
    echo "⚠️  WARNING: /data is not a volume mount!"
    echo "   Data will be lost when container is removed!"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# Check IPFS directory under /data
echo "📦 Checking IPFS directory (/data/ipfs)..."
if [ ! -d "/data/ipfs" ]; then
    echo "ℹ️  IPFS directory does not exist yet (will be created on startup)"
elif [ ! -f "/data/ipfs/config" ]; then
    echo "⚠️  WARNING: IPFS not initialized (config file missing)"
    echo "   This is normal on first run, but if you had pins before, they may be lost!"
    WARNINGS=$((WARNINGS + 1))
else
    echo "✅ IPFS directory exists and is initialized"
    # Check for existing pins
    if [ -d "/data/ipfs/pins" ] || [ -f "/data/ipfs/pin-store" ]; then
        echo "✅ IPFS pin data found"
    fi
fi

echo ""

# Check GunDB data directory
echo "💾 Checking GunDB data directory (/data/relay-data)..."
if [ ! -d "/data/relay-data" ]; then
    echo "ℹ️  GunDB data directory does not exist yet (will be created on startup)"
else
    echo "✅ GunDB data directory exists"
fi

echo ""

# Check relay keys directory
echo "🔑 Checking relay keys directory..."
if [ -n "$RELAY_SEA_KEYPAIR" ]; then
    echo "✅ Relay keys configured via RELAY_SEA_KEYPAIR env var"
    echo "   Keys are provided via environment (no file needed)"
elif [ -n "$RELAY_SEA_KEYPAIR_PATH" ]; then
    echo "✅ Relay keys configured via RELAY_SEA_KEYPAIR_PATH env var"
    echo "   Keypair path: $RELAY_SEA_KEYPAIR_PATH"
    if [ -f "$RELAY_SEA_KEYPAIR_PATH" ]; then
        echo "✅ Relay keypair file found at configured path"
    else
        echo "ℹ️  Keypair file not found (will be auto-generated if needed)"
    fi
else
    # No env var configured, check for default file location
    if [ ! -d "/data/keys" ]; then
        echo "ℹ️  Relay keys directory does not exist yet (will be created on startup)"
    else
        echo "✅ Relay keys directory exists"
        if [ -f "/data/keys/relay-keypair.json" ]; then
            echo "✅ Relay keypair found"
        else
            echo "⚠️  WARNING: Relay keypair not found (will be auto-generated)"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
fi

echo ""

# Check Holster data volume removed (deprecated)

echo ""
echo "=================================="
echo "Summary:"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✅ All volumes are properly mounted!"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "⚠️  Found $WARNINGS warning(s) - check above for details"
    exit 0
else
    echo "❌ Found $ERRORS error(s) and $WARNINGS warning(s)"
    echo ""
    echo "🔧 To fix volume issues:"
    echo "   1. Ensure docker-compose.yml has volumes defined"
    echo "   2. Use 'docker-compose up' (NOT 'docker-compose down -v')"
    echo "   3. For CapRover, configure persistent volumes in the web UI"
    exit 1
fi
