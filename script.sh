#!/usr/bin/env bash

set -e

# simple logging
log() { echo "$1"; }
error() { echo "❌ $1" >&2; exit 1; }

# check deps
command -v bun >/dev/null || error "bun not found"

# init
mkdir -p dist
rm -rf dist/*
DIST=$(realpath dist)
WORKSPACE=$(realpath packages)

if [ "$1" == "build" ]; then
    log "Building apps..."
    (cd "$WORKSPACE/psytask" && bun docs && mv docs/* "$DIST")
    for app in benchmark playground tests; do
        (cd "$WORKSPACE/$app" && bun run build && mv dist "$DIST/$app")
    done

    log "Building packages..."
    mkdir -p "$DIST/public"
    for pkg in psytask core components jspsych; do
        (cd "$WORKSPACE/$pkg" && bun run build && mv dist "$DIST/public/$pkg")
    done
    
    log "✅ Build complete"

elif [ "$1" == "publish" ]; then
    if [ "$2" == "--dev" ]; then
        log "🔍 Checking publish status (dev mode)..."
    else
        log "Publishing packages..."
    fi
    
    for pkg in psytask core components jspsych create-psytask; do
        dir="$WORKSPACE/$pkg"

        name=$(cd "$dir" && bun pm pkg get name | tr -d '"')
        version=$(cd "$dir" && bun pm pkg get version | tr -d '"')
        published_version=$(bun pm view "$name" version 2>/dev/null || echo "none")
        
        if [ "$published_version" = "$version" ]; then
            log "⏭️ Skip $name (current: $version, published: $published_version)"
        else
            if [ "$2" == "--dev" ]; then
                log "📦 Would publish $name ($published_version → $version)"
            else
                log "🚀 Publishing $name ($published_version → $version)"
                (cd "$dir" && bun run build && bun publish -p --access public)
                log "✅ Published $name@$version"
            fi
        fi
    done

else
    error "Usage: $0 {build|publish} [--dev]"
fi