#!/bin/bash
# ==============================================================================
# GitHub Actions Self-Hosted Runner Setup for Linus
# ==============================================================================
# Run this script on the deployment server (Linus) to set up the
# self-hosted GitHub Actions runner.
#
# Prerequisites:
#   - Node.js 20+ installed
#   - PM2 installed globally
#   - A GitHub runner registration token (get from repo Settings > Actions > Runners)
#
# Usage:
#   chmod +x scripts/setup-runner.sh
#   ./scripts/setup-runner.sh
#   # (You will be prompted for the registration token securely)
#
# Alternatively, pass the short-lived registration token via env var:
#   RUNNER_TOKEN=<REGISTRATION_TOKEN> ./scripts/setup-runner.sh
#
# WARNING: Do NOT run this script as root. The runner should be installed
# under a regular user account.
#
# This script is idempotent — re-running it on an already-configured
# runner will skip configuration and service install steps.
# ==============================================================================

set -euo pipefail

# Refuse to run as root — $HOME would be /root and the runner would be
# configured under the wrong account.
if [ "$(id -u)" -eq 0 ]; then
  echo "❌ Do not run this script as root."
  echo "   Run as a regular non-root deploy user (e.g., your deploy account)."
  exit 1
fi

# Validate prerequisites — fail fast with helpful messages.
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is not installed. Install Node.js 20+ before running this script."
  exit 1
fi
NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "❌ Node.js $NODE_MAJOR detected — version 20+ is required."
  exit 1
fi
if ! command -v pm2 >/dev/null 2>&1; then
  echo "❌ PM2 is not installed. Install it with: npm install -g pm2"
  exit 1
fi
echo "✅ Prerequisites OK: Node.js $(node -v), PM2 $(pm2 -v 2>/dev/null || echo 'installed')"

RUNNER_DIR="${RUNNER_INSTALL_DIR:-$HOME/actions-runner}"
REPO_URL="https://github.com/Cartyx/cartyx-app"
RUNNER_VERSION="2.322.0"
RUNNER_ARCH="linux-x64"

echo "📦 Setting up GitHub Actions runner in ${RUNNER_DIR}..."

# Create runner directory
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

# Download runner if not already present
if [ ! -f "./run.sh" ]; then
  RUNNER_TARBALL="actions-runner-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
  RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_TARBALL}"

  echo "⬇️  Downloading GitHub Actions runner v${RUNNER_VERSION}..."
  curl -fL --retry 3 --retry-delay 5 -o "${RUNNER_TARBALL}" "${RUNNER_URL}"

  # Verify checksum if available
  CHECKSUM_URL="${RUNNER_URL}.sha256"
  if curl -fL --retry 3 --retry-delay 5 -o "${RUNNER_TARBALL}.sha256" "${CHECKSUM_URL}" 2>/dev/null; then
    echo "🔒 Verifying SHA256 checksum..."
    sha256sum -c "${RUNNER_TARBALL}.sha256"
    rm "${RUNNER_TARBALL}.sha256"
  else
    echo "⚠️  Checksum file not available — skipping verification"
  fi

  tar xzf "${RUNNER_TARBALL}"
  rm "${RUNNER_TARBALL}"
fi

# Configure the runner (idempotent — skip if already configured).
# Only prompt for a token when we actually need to configure.
if [ -f ".runner" ]; then
  echo "ℹ️  Runner already configured in ${RUNNER_DIR}; skipping configuration."
else
  TOKEN="${RUNNER_TOKEN:-}"
  if [ -z "$TOKEN" ]; then
    echo "Get a registration token from:"
    echo "  ${REPO_URL}/settings/actions/runners/new"
    echo ""
    read -rsp "Paste registration token (hidden): " TOKEN
    echo ""
    if [ -z "$TOKEN" ]; then
      echo "❌ No token provided."
      exit 1
    fi
  fi
  echo "⚙️  Configuring runner..."
  ./config.sh --url "$REPO_URL" --token "$TOKEN" --unattended --name "linus" --labels "self-hosted,linux,x64,linus"
fi

# Install as a service (idempotent — skip if already installed).
# Use sudo -n first to avoid blocking on a password prompt when the script
# is run non-interactively (e.g., via RUNNER_TOKEN env var).
echo "🔧 Ensuring runner is installed as a system service..."
if sudo -n ./svc.sh status >/dev/null 2>&1; then
  echo "ℹ️  Runner service already installed and running; skipping installation."
elif sudo -n true 2>/dev/null; then
  sudo -n ./svc.sh install
  sudo -n ./svc.sh start
else
  echo "⚠️  Passwordless sudo not available — installing service requires sudo."
  echo "   Run these commands manually:"
  echo "     cd ${RUNNER_DIR} && sudo ./svc.sh install && sudo ./svc.sh start"
  exit 1
fi

echo ""
echo "✅ GitHub Actions runner installed and running!"
echo "   Runner name: linus"
echo "   Labels: self-hosted, linux, x64, linus"
echo "   Service: enabled and started"
echo ""
echo "Verify at: ${REPO_URL}/settings/actions/runners"
