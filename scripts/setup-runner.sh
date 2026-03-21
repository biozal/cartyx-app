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
#   ./scripts/setup-runner.sh <REGISTRATION_TOKEN>
#
# WARNING: Do NOT run this script as root. The runner should be installed
# under a regular user account.
# ==============================================================================

set -euo pipefail

# Refuse to run as root — $HOME would be /root and the runner would be
# configured under the wrong account.
if [ "$(id -u)" -eq 0 ]; then
  echo "❌ Do not run this script as root."
  echo "   Run as the regular deploy user (e.g., labeaaa)."
  exit 1
fi

RUNNER_DIR="${RUNNER_INSTALL_DIR:-$HOME/actions-runner}"
REPO_URL="https://github.com/Cartyx/cartyx-app"
RUNNER_VERSION="2.322.0"
RUNNER_ARCH="linux-x64"

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <GITHUB_RUNNER_REGISTRATION_TOKEN>"
  echo ""
  echo "Get a token from:"
  echo "  ${REPO_URL}/settings/actions/runners/new"
  exit 1
fi

TOKEN="$1"

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

# Configure the runner
echo "⚙️  Configuring runner..."
./config.sh --url "$REPO_URL" --token "$TOKEN" --unattended --name "linus" --labels "self-hosted,linux,x64,linus"

# Install as a service
echo "🔧 Installing runner as a system service..."
sudo ./svc.sh install
sudo ./svc.sh start

echo ""
echo "✅ GitHub Actions runner installed and running!"
echo "   Runner name: linus"
echo "   Labels: self-hosted, linux, x64, linus"
echo "   Service: enabled and started"
echo ""
echo "Verify at: ${REPO_URL}/settings/actions/runners"
