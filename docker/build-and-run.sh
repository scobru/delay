#!/bin/bash

# Shogun Relay Docker Build and Run Script

set -e

echo "🚀 Shogun Relay Docker Setup"
echo "============================="

print_status() {
    echo -e "\033[0;34m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[0;32m[SUCCESS]\033[0m $1"
}

print_warning() {
    echo -e "\033[1;33m[WARNING]\033[0m $1"
}

print_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Navigate to the project root
cd "$(dirname "$0")/.."

# Create logs directory if it doesn't exist
mkdir -p logs

# Set default admin password if not provided
export ADMIN_PASSWORD=${ADMIN_PASSWORD:-"shogun-admin-2024"}

print_status "Building Shogun Relay Docker image..."

# Build the Docker image
if docker build -t delay:latest .; then
    print_success "Docker image built successfully"
else
    print_error "Failed to build Docker image"
    exit 1
fi

# Check command line arguments
case "${1:-docker}" in
    "docker"|"run")
        print_status "Starting container with Docker..."
        
        # Stop and remove existing container if it exists
        docker stop delay-stack 2>/dev/null || true
        docker rm delay-stack 2>/dev/null || true
        
        # Run the container
        docker run -d \
            --name delay-stack \
            -p 8765:8765 \
            -p 5001:5001 \
            -p 8080:8080 \
            -p 4001:4001 \
            -v shogun-data:/data \
            -v "$(pwd)/logs:/var/log/supervisor" \
            -e "ADMIN_PASSWORD=\"$ADMIN_PASSWORD\"" \
            delay:latest
        
        if [ $? -eq 0 ]; then
            print_success "Container started successfully"
            
            print_status "Waiting for services to be ready..."
            sleep 30
            
            print_success "Shogun Relay Stack is running!"
            echo ""
            echo "🌐 Services available at:"
            echo "   • Relay Server:   http://localhost:8765"
            echo "   • IPFS API:      http://localhost:5001"
            echo "   • IPFS Gateway:  http://localhost:8080"
            echo ""
            echo "🔐 Admin Password: \"$ADMIN_PASSWORD\""
            echo ""
            echo "📋 Useful commands:"
            echo "   • View logs:     docker logs -f delay-stack"
            echo "   • Stop:          docker stop delay-stack"
            echo "   • Start:         docker start delay-stack"
            
        else
            print_error "Failed to start container"
            exit 1
        fi
        ;;
    "build")
        print_success "Image built successfully. Use './docker/build-and-run.sh run' to run."
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [docker|build|help]"
        echo ""
        echo "Commands:"
        echo "  docker   - Build and run with Docker (default)"
        echo "  build    - Build image only"
        echo "  help     - Show this help"
        echo ""
        echo "Environment Variables:"
        echo "  ADMIN_PASSWORD - Set admin password (default: shogun-admin-2024)"
        ;;
    *)
        print_error "Unknown command: $1"
        echo "Use '$0 help' for usage information."
        exit 1
        ;;
esac 