#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${DYNAMAC_ISLAND_DIR:-$HOME/projects/dynamac-island}"
REPO_URL="${DYNAMAC_ISLAND_REPO:-https://github.com/HSUNEH/dynamac-island.git}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required. Install Xcode Command Line Tools or Git first." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required. Recommended: install Node LTS from https://nodejs.org/" >&2
  exit 1
fi

# nowplaying-cli exposes macOS MediaRemote, which is how Dynamac reads the
# actually-playing track/video (title, progress, play/pause) for Spotify,
# Music, and browser media like Arc/Chrome YouTube. Without it the Now Playing
# island falls back to title-only tab probes and cannot tell what is playing.
if ! command -v nowplaying-cli >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "Installing nowplaying-cli (macOS MediaRemote bridge)..."
    brew install nowplaying-cli
  else
    echo "nowplaying-cli not found and Homebrew is unavailable." >&2
    echo "Install Homebrew from https://brew.sh then run: brew install nowplaying-cli" >&2
  fi
fi

mkdir -p "$(dirname "$PROJECT_DIR")"

if [ -d "$PROJECT_DIR/.git" ]; then
  echo "Updating existing Dynamac Island checkout at $PROJECT_DIR"
  git -C "$PROJECT_DIR" pull --ff-only
else
  if [ -e "$PROJECT_DIR" ] && [ "$(ls -A "$PROJECT_DIR" 2>/dev/null || true)" ]; then
    echo "$PROJECT_DIR exists and is not an empty git checkout." >&2
    echo "Move it aside or set DYNAMAC_ISLAND_DIR to another path." >&2
    exit 1
  fi
  echo "Cloning Dynamac Island into $PROJECT_DIR"
  git clone "$REPO_URL" "$PROJECT_DIR"
fi

cd "$PROJECT_DIR"
echo "Installing npm dependencies..."
npm install

echo "Running verification..."
npm run check
npm run smoke:launch

echo
echo "Dynamac Island is ready. Launch it with:"
echo "  cd $PROJECT_DIR && npm start"
