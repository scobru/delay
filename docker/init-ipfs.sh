#!/bin/sh

# IPFS Initialization Script for Docker Container
set -e  # Exit on error

# Allow script to continue even if some non-critical operations fail
set +e  # Temporarily disable exit on error for permission checks

export IPFS_PATH=/data/ipfs

# Clean up any previous lock files
rm -f "$IPFS_PATH/repo.lock"

# Enhanced debugging information
echo "🔍 Environment Information:"
echo "- IPFS_PATH: $IPFS_PATH"
echo "- Current user: $(whoami)"
echo "- User ID: $(id)"
echo "- Working directory: $(pwd)"
echo "- System architecture: $(uname -m)"
echo "- IPFS binary location: $(which ipfs 2>/dev/null || echo 'not found')"
echo "- IPFS binary permissions: $(ls -l $(which ipfs 2>/dev/null) 2>/dev/null || echo 'not accessible')"
echo "- Library dependencies: $(ldd $(which ipfs 2>/dev/null) 2>/dev/null || echo 'unable to check')"

# Re-enable exit on error for critical operations
set -e

# Create and set proper permissions for IPFS directory
echo "📁 Setting up IPFS directory..."
if [ -d "$IPFS_PATH" ] && [ -f "$IPFS_PATH/config" ]; then
    echo "✅ IPFS repository already exists, preserving existing data"
    echo "   Repository path: $IPFS_PATH"
    echo "   Config file: $IPFS_PATH/config"
    # Only update permissions, preserve all existing data
    set +e
    chown -R ipfs:ipfs "$IPFS_PATH" 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "⚠️ Warning: Could not set IPFS directory ownership (may be running as ipfs user)"
    fi
    set -e
    # Preserve existing files and subdirectories
    chmod -R 755 "$IPFS_PATH" 2>/dev/null || {
        echo "⚠️ Warning: Could not set all IPFS directory permissions"
    }
    # Ensure config file is readable
    chmod 644 "$IPFS_PATH/config" 2>/dev/null || true
else
    echo "📁 Creating new IPFS directory..."
    if ! mkdir -p "$IPFS_PATH"; then
        echo "❌ Failed to create IPFS directory at $IPFS_PATH"
        exit 1
    fi
    
    # Try to set ownership, but don't fail if we don't have permission (running as ipfs user)
    set +e
    chown -R ipfs:ipfs "$IPFS_PATH" 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "⚠️ Warning: Could not set IPFS directory ownership (may be running as ipfs user)"
    fi
    set -e
    
    # Set permissions (this should work even as ipfs user)
    chmod -R 755 "$IPFS_PATH" 2>/dev/null || {
        echo "⚠️ Warning: Could not set all IPFS directory permissions"
    }
fi

# Verify IPFS binary
echo "🔍 Verifying IPFS binary..."
if [ ! -x "/usr/local/bin/ipfs" ]; then
    echo "❌ IPFS binary not found or not executable at /usr/local/bin/ipfs"
    ls -la /usr/local/bin/ipfs 2>/dev/null || echo "IPFS binary does not exist"
    exit 1
fi

# Test IPFS binary
echo "🧪 Testing IPFS binary..."
if ! /usr/local/bin/ipfs version; then
    echo "❌ IPFS binary test failed"
    ldd /usr/local/bin/ipfs 2>/dev/null || echo "Unable to check dependencies"
    exit 1
fi

# Create denylists directories for the ipfs user
echo "📁 Creating denylists directories..."
if ! mkdir -p /home/ipfs/.config/ipfs/denylists; then
    echo "⚠️ Warning: Failed to create denylist directory for ipfs user"
fi

if ! chown -R ipfs:ipfs /home/ipfs/.config 2>/dev/null; then
    echo "⚠️ Warning: Could not set config directory ownership for ipfs user"
fi

# Check if IPFS is already initialized
if [ ! -f "$IPFS_PATH/config" ]; then
    echo "📦 IPFS not initialized. Initializing now..."
    
    # CRITICAL: Check if this is a volume mount issue
    # If the directory exists but config is missing, warn about potential data loss
    if [ -d "$IPFS_PATH" ] && [ "$(ls -A $IPFS_PATH 2>/dev/null)" ]; then
        echo "⚠️ WARNING: IPFS directory exists but config is missing!"
        echo "⚠️ This might indicate a volume mount issue or data corruption."
        echo "⚠️ If you have existing pins, they may be lost!"
        echo "⚠️ Directory contents:"
        ls -la "$IPFS_PATH" 2>/dev/null | head -20 || echo "   (cannot list contents)"
        echo ""
        echo "⚠️ To preserve existing data, ensure the volume is mounted correctly."
        echo "⚠️ Waiting 5 seconds before proceeding with initialization..."
        sleep 5
    fi
    
    # Wait for lock file to be released if it exists
    if [ -f "$IPFS_PATH/repo.lock" ]; then
        echo "⏳ Waiting for IPFS lock to be released..."
        i=1
        while [ $i -le 10 ]; do
            if [ ! -f "$IPFS_PATH/repo.lock" ]; then
                break
            fi
            sleep 1
            i=$((i + 1))
        done
        # Force remove lock if still exists (daemon might have crashed)
        if [ -f "$IPFS_PATH/repo.lock" ]; then
            echo "⚠️ Removing stale lock file..."
            rm -f "$IPFS_PATH/repo.lock"
        fi
    fi
    
    # Initialize IPFS with minimal profile for containers
    set +e  # Temporarily disable exit on error
    /usr/local/bin/ipfs init --profile=server,lowpower 2>&1
    INIT_RESULT=$?
    set -e  # Re-enable exit on error
    
    if [ $INIT_RESULT -ne 0 ]; then
        # Check if error is about lock
        if /usr/local/bin/ipfs init --profile=server,lowpower 2>&1 | grep -q "lock"; then
            echo "⚠️ IPFS lock detected, waiting and retrying..."
            sleep 2
            rm -f "$IPFS_PATH/repo.lock"
            if ! /usr/local/bin/ipfs init --profile=server,lowpower; then
                echo "❌ IPFS initialization failed after retry"
                exit 1
            fi
        else
            echo "❌ IPFS initialization failed"
            exit 1
        fi
    fi
    
    echo "⚙️ Configuring IPFS..."
    
    # Wait a moment to ensure no daemon is running
    sleep 1
    
    # Remove lock if exists before configuring
    rm -f "$IPFS_PATH/repo.lock"
    
    # Configure IPFS settings with error checking
    set +e  # Temporarily disable exit on error for config commands
    /usr/local/bin/ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001 2>/dev/null
    /usr/local/bin/ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080 2>/dev/null
    /usr/local/bin/ipfs config --json Addresses.Swarm '[
        "/ip4/0.0.0.0/tcp/4001",
        "/ip6/::/tcp/4001",
        "/ip4/0.0.0.0/udp/4001/quic",
        "/ip6/::/udp/4001/quic"
    ]' 2>/dev/null
    /usr/local/bin/ipfs config --json Routing.AcceleratedDHTClient false 2>/dev/null
    /usr/local/bin/ipfs config --json Routing.OptimisticProvide true 2>/dev/null
    /usr/local/bin/ipfs config --json ConnMgr.HighWater 100 2>/dev/null
    /usr/local/bin/ipfs config --json ConnMgr.LowWater 20 2>/dev/null
    /usr/local/bin/ipfs config --json ConnMgr.GracePeriod '"1m"' 2>/dev/null
    /usr/local/bin/ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]' 2>/dev/null
    /usr/local/bin/ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]' 2>/dev/null
    /usr/local/bin/ipfs config --json API.HTTPHeaders.Access-Control-Allow-Headers '["Authorization"]' 2>/dev/null
    /usr/local/bin/ipfs config Datastore.GCPeriod '"1h"' 2>/dev/null
    /usr/local/bin/ipfs config Datastore.StorageMax '"10GB"' 2>/dev/null
    set -e  # Re-enable exit on error
    
    # Configure API authentication using custom token
    echo "🔐 Configuring IPFS API authentication..."
    if [ -n "$IPFS_API_TOKEN" ]; then
        echo "🔐 Setting up custom authentication for IPFS API..."
        # Store the token for the relay to use
        echo "$IPFS_API_TOKEN" > /tmp/ipfs-api-token
        chmod 600 /tmp/ipfs-api-token
        echo "🔐 API token stored for relay authentication"
    else
        echo "⚠️ No IPFS_API_TOKEN provided, API will be publicly accessible"
    fi
    
    # Ensure proper permissions after initialization
    echo "🔐 Setting proper permissions for IPFS repository..."
    set +e
    chown -R ipfs:ipfs "$IPFS_PATH" 2>/dev/null || {
        echo "⚠️ Warning: Could not set IPFS directory ownership (may be running as ipfs user)"
    }
    chmod 755 "$IPFS_PATH" 2>/dev/null || true
    if [ -f "$IPFS_PATH/config" ]; then
        chmod 644 "$IPFS_PATH/config" 2>/dev/null || true
        chown ipfs:ipfs "$IPFS_PATH/config" 2>/dev/null || true
    fi
    find "$IPFS_PATH" -type d -exec chmod 755 {} \; 2>/dev/null || true
    find "$IPFS_PATH" -type f -exec chmod 644 {} \; 2>/dev/null || true
    set -e
    
    echo "✅ IPFS initialization completed"
else
    echo "✅ IPFS already initialized"
    
    # Ensure proper permissions for existing repository
    echo "🔐 Ensuring proper permissions for IPFS repository..."
    set +e
    chown -R ipfs:ipfs "$IPFS_PATH" 2>/dev/null || {
        echo "⚠️ Warning: Could not set IPFS directory ownership (may be running as ipfs user)"
    }
    if [ -f "$IPFS_PATH/config" ]; then
        chmod 644 "$IPFS_PATH/config" 2>/dev/null || true
        chown ipfs:ipfs "$IPFS_PATH/config" 2>/dev/null || true
        echo "✅ IPFS config file permissions verified"
    fi
    set -e
    
    # Verify that the repository is valid and not corrupted
    echo "🔍 Verifying IPFS repository integrity..."
    set +e
    if [ ! -f "$IPFS_PATH/config" ]; then
        echo "❌ ERROR: IPFS config file is missing even though repository should exist!"
        echo "❌ This indicates a serious problem with the volume mount."
        echo "❌ Your pins may be lost. Check your Docker volume configuration."
        exit 1
    fi
    
    # Check for critical IPFS directories
    if [ ! -d "$IPFS_PATH/blocks" ] && [ ! -d "$IPFS_PATH/datastore" ]; then
        echo "⚠️ WARNING: IPFS repository structure appears incomplete"
        echo "⚠️ Blocks or datastore directory missing. Repository may be corrupted."
    fi
    
    # Try to read the config to verify it's valid
    if ! /usr/local/bin/ipfs config show >/dev/null 2>&1; then
        echo "⚠️ WARNING: Could not read IPFS config. Repository may be corrupted."
    else
        echo "✅ IPFS repository structure verified"
    fi
    set -e
    
    # Check if IPFS daemon is running and has the lock
    if [ -f "$IPFS_PATH/repo.lock" ]; then
        echo "⚠️ IPFS daemon is running, skipping configuration update"
        echo "✅ IPFS is ready for use"
        
        # Still create the API token file if it doesn't exist
        if [ -n "$IPFS_API_TOKEN" ] && [ ! -f "/tmp/ipfs-api-token" ]; then
            echo "🔑 Creating API token file for relay authentication..."
            echo "$IPFS_API_TOKEN" > /tmp/ipfs-api-token
            chmod 600 /tmp/ipfs-api-token
        fi
    else
        # Update critical configuration only if no lock exists
        echo "🔄 Updating critical configuration..."
        set +e  # Temporarily disable exit on error
        /usr/local/bin/ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001 2>/dev/null
        /usr/local/bin/ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080 2>/dev/null
        /usr/local/bin/ipfs config --json Routing.AcceleratedDHTClient false 2>/dev/null
        /usr/local/bin/ipfs config --json ConnMgr.HighWater 100 2>/dev/null
        /usr/local/bin/ipfs config --json ConnMgr.LowWater 20 2>/dev/null
        /usr/local/bin/ipfs config --json ConnMgr.GracePeriod '"1m"' 2>/dev/null
        set -e  # Re-enable exit on error
        
        # Update API authentication headers
        echo "🔐 Updating API authentication configuration..."
        /usr/local/bin/ipfs config --json API.HTTPHeaders.Access-Control-Allow-Headers '["Authorization", "Content-Type"]'
        /usr/local/bin/ipfs config --json API.HTTPHeaders.Access-Control-Expose-Headers '["Authorization"]'
        
        # Store API token if provided
        if [ -n "$IPFS_API_TOKEN" ]; then
            echo "🔑 Storing API token for relay authentication..."
            echo "$IPFS_API_TOKEN" > /tmp/ipfs-api-token
            chmod 600 /tmp/ipfs-api-token
        fi
    fi
fi

# Verify configuration (only if no lock exists)
if [ ! -f "$IPFS_PATH/repo.lock" ]; then
    echo "🔍 Verifying IPFS configuration..."
    set +e  # Temporarily disable exit on error for verification
    /usr/local/bin/ipfs config show >/dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "⚠️ Warning: Could not verify IPFS configuration (may be normal if daemon is starting)"
    else
        echo "✅ IPFS configuration verified"
    fi
    set -e  # Re-enable exit on error
fi

# Final permission check - ensure everything is owned by ipfs user
echo "🔐 Final permission check..."
set +e
chown -R ipfs:ipfs "$IPFS_PATH" 2>/dev/null || {
    echo "⚠️ Warning: Could not set final IPFS directory ownership"
}
# Ensure config is readable
if [ -f "$IPFS_PATH/config" ]; then
    chmod 644 "$IPFS_PATH/config" 2>/dev/null || true
    chown ipfs:ipfs "$IPFS_PATH/config" 2>/dev/null || true
    # Verify we can read it
    if [ -r "$IPFS_PATH/config" ]; then
        echo "✅ IPFS config file is readable"
    else
        echo "❌ ERROR: IPFS config file is not readable!"
        echo "   File: $IPFS_PATH/config"
        echo "   Permissions: $(ls -l "$IPFS_PATH/config" 2>/dev/null || echo 'cannot check')"
        exit 1
    fi
fi
set -e

echo "🚀 IPFS initialization successful"
if [ -n "$IPFS_API_TOKEN" ]; then
    echo "🔐 API authentication configured with custom token"
    echo "🔑 API token available at: /tmp/ipfs-api-token"
else
    echo "⚠️ API authentication not configured - API is publicly accessible"
fi
exit 0 