#!/usr/bin/env bash
# Idempotent environment bootstrap for the PDF Manager Tauri app.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

# System libraries required to compile the Tauri (Rust) shell on Linux.
# https://v2.tauri.app/start/prerequisites/
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libsoup-3.0-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libxdo-dev

# The pinned Tauri dependency tree needs a Rust toolchain that understands
# edition 2024 (Rust >= 1.85). Ensure a recent stable toolchain is the default.
if command -v rustup >/dev/null 2>&1; then
  rustup toolchain install stable --profile minimal
  rustup default stable
fi

# JavaScript dependencies and test fixtures.
npm install
npm run fixtures
