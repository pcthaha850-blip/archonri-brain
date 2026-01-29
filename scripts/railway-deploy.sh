#!/bin/bash
# scripts/railway-deploy.sh
#
# Deploy ArchonRI Brain to Railway
#
# Prerequisites:
#   - Railway CLI installed: npm install -g @railway/cli
#   - Logged in: railway login
#   - Project linked: railway link
#
# Usage:
#   ./scripts/railway-deploy.sh [staging|production]

set -euo pipefail

ENV="${1:-staging}"
SERVICE_NAME="archonri-brain"

echo "========================================="
echo "Deploying $SERVICE_NAME to $ENV"
echo "========================================="

# Verify Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Install with: npm install -g @railway/cli"
    exit 1
fi

# Verify logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway. Run: railway login"
    exit 1
fi

# Set environment variables (only if not already set)
echo "Setting environment variables..."

# Core variables (these should be set in Railway dashboard for security)
# railway variables set NOTION_TOKEN "$NOTION_TOKEN" --service "$SERVICE_NAME" || true
# railway variables set HMAC_KEY "$HMAC_KEY" --service "$SERVICE_NAME" || true

# Non-secret variables can be set here
railway variables set POLL_INTERVAL "5000" --service "$SERVICE_NAME" 2>/dev/null || true
railway variables set PORT "3000" --service "$SERVICE_NAME" 2>/dev/null || true

echo "Deploying..."
railway up --service "$SERVICE_NAME" --detach

echo ""
echo "========================================="
echo "✅ Deployment initiated"
echo "========================================="
echo ""
echo "Check status: railway status --service $SERVICE_NAME"
echo "View logs:    railway logs --service $SERVICE_NAME"
echo "Open dashboard: railway open"
echo ""
echo "Remember to set secrets in Railway dashboard:"
echo "  - NOTION_TOKEN (from new Notion integration)"
echo "  - HMAC_KEY"
echo "  - COMMANDS_DB_ID"
echo "  - N8N_WEBHOOK_URL"
echo ""
