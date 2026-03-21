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
if ! command -v curl >/dev/null 2>&1; then
  echo "❌ curl is not installed. Install it with your package manager (e.g., apt-get install curl)."
  exit 1
fi
if ! command -v tar >/dev/null 2>&1; then
  echo "❌ tar is not installed. Install it with your package manager (e.g., apt-get install tar)."
  exit 1
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  echo "⚠️  sha256sum not found — checksum verification will be skipped."
fi
echo "✅ Prerequisites OK: Node.js $(node -v), PM2 $(pm2 -v 2>/dev/null || echo 'installed')"

RUNNER_DIR="${RUNNER_INSTALL_DIR:-$HOME/actions-runner}"
RUNNER_NAME="linus"
REPO_URL="https://github.com/Cartyx/cartyx-app"
# Pin the runner version for reproducibility. Find the latest at:
# https://github.com/actions/runner/releases
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

  # Verify checksum if sha256sum is available and checksum file can be fetched
  if command -v sha256sum >/dev/null 2>&1; then
    CHECKSUM_URL="${RUNNER_URL}.sha256"
    if curl -fL --retry 3 --retry-delay 5 -o "${RUNNER_TARBALL}.sha256" "${CHECKSUM_URL}" 2>/dev/null; then
      echo "🔒 Verifying SHA256 checksum..."
      sha256sum -c "${RUNNER_TARBALL}.sha256"
      rm "${RUNNER_TARBALL}.sha256"
    else
      echo "⚠️  Checksum file not available — skipping verification"
    fi
  else
    echo "⚠️  sha256sum not available — skipping checksum verification"
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
    if [ ! -t 0 ]; then
      echo "❌ No RUNNER_TOKEN set and stdin is not a terminal — cannot prompt."
      echo "   Pass the token via: RUNNER_TOKEN=<token> $0"
      exit 1
    fi
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
  ./config.sh --url "$REPO_URL" --token "$TOKEN" --unattended --name "$RUNNER_NAME" --labels "self-hosted,linux,x64,$RUNNER_NAME"
fi

# Install as a service (idempotent — handles installed+running, installed+stopped,
# and not-installed states). Uses sudo -n to avoid blocking on password prompts.
echo "🔧 Ensuring runner is installed as a system service..."
if ! sudo -n true 2>/dev/null; then
  echo "⚠️  Passwordless sudo not available — installing service requires sudo."
  echo "   Run these commands manually:"
  echo "     cd ${RUNNER_DIR} && sudo ./svc.sh install && sudo ./svc.sh start"
  exit 1
fi

# Derive the expected systemd service name for this specific runner.
# GitHub runner service names follow: actions.runner.<owner>-<repo>.<runner-name>.service
OWNER_REPO="${REPO_URL#https://github.com/}"
OWNER_REPO="${OWNER_REPO%.git}"
SERVICE_OWNER="${OWNER_REPO%%/*}"
SERVICE_REPO="${OWNER_REPO#*/}"
SERVICE_NAME="actions.runner.${SERVICE_OWNER}-${SERVICE_REPO}.${RUNNER_NAME}.service"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"

if [ -f "$SERVICE_FILE" ]; then
  echo "ℹ️  Runner service already installed (${SERVICE_NAME})."
  # Ensure it's running (handles installed-but-stopped case)
  if ! sudo -n systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "🔄 Service is installed but not running — starting it..."
    sudo -n ./svc.sh start
  else
    echo "ℹ️  Service is running."
  fi
else
  echo "📦 Installing runner as system service (${SERVICE_NAME})..."
  sudo -n ./svc.sh install
  sudo -n ./svc.sh start
fi

echo ""
echo "✅ GitHub Actions runner installed and running!"
echo "   Runner name: $RUNNER_NAME"
echo "   Labels: self-hosted, linux, x64, $RUNNER_NAME"
echo "   Service: enabled and started"
echo ""
echo "Verify at: ${REPO_URL}/settings/actions/runners"
