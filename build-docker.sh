#!/bin/bash

# Configuration
IMAGE_NAME="bookmarktorain"
REGISTRY="ghcr.io/xiaochou164" # Optional: Change to your registry or Docker Hub username
TAG="latest"

echo "Setting up docker buildx builder for multi-platform..."
docker buildx create --use --name multi-platform-builder 2>/dev/null || true
docker buildx inspect --bootstrap

echo "Building Docker image for linux/amd64 and linux/arm64..."

# To load locally, you can only build one platform at a time unless you push it to a registry.
# Therefore, we just use `--push` if we want to build both and push directly to a registry.
# However, this script will show how to build multi-arch and load to local environment 
# just by exporting tarball or pushing. So we add a choice here:

if [ "$1" == "--push" ]; then
    echo "Building and Pushing to registry..."
    docker buildx build \
        --platform linux/amd64,linux/arm64 \
        -t $REGISTRY/$IMAGE_NAME:$TAG \
        --push .
    echo "Multi-arch image built and pushed to $REGISTRY/$IMAGE_NAME:$TAG!"
else
    echo "Building multi-arch images but NOT pushing."
    echo "Note: Multi-arch builds must either be pushed (--push) or output as tarballs."
    echo "Use './build-docker.sh --push' to push to registry."
    echo ""
    echo "Building for local environment only (amd64 and arm64 individually to load locally)..."
    
    # Building for the current local architecture by default (to be able to run it locally)
    docker build --load -t $IMAGE_NAME:latest .
    echo "Local image built and loaded: $IMAGE_NAME:latest"
fi
