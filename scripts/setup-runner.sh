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
# ==============================================================================

set -euo pipefail

RUNNER_DIR="$HOME/actions-runner"
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
  echo "⬇️  Downloading GitHub Actions runner v${RUNNER_VERSION}..."
  curl -o actions-runner.tar.gz -L \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
  tar xzf actions-runner.tar.gz
  rm actions-runner.tar.gz
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
