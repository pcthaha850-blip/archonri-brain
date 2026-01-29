# ArchonRI Brain - Deployment Script
# Run this in PowerShell after installing Railway CLI

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ArchonRI Brain - Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Railway CLI
$railway = Get-Command railway -ErrorAction SilentlyContinue
if (-not $railway) {
    Write-Host "[ERROR] Railway CLI not found. Install with:" -ForegroundColor Red
    Write-Host "  npm install -g @railway/cli" -ForegroundColor Yellow
    Write-Host "  OR" -ForegroundColor Gray
    Write-Host "  iwr https://railway.app/install.ps1 -useb | iex" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Railway CLI found" -ForegroundColor Green

# Check if logged in
Write-Host ""
Write-Host "Step 1: Checking Railway login..." -ForegroundColor Cyan
railway whoami
if ($LASTEXITCODE -ne 0) {
    Write-Host "[INFO] Please login to Railway:" -ForegroundColor Yellow
    railway login
}

# Initialize project
Write-Host ""
Write-Host "Step 2: Initializing Railway project..." -ForegroundColor Cyan
railway init

# Link to service
Write-Host ""
Write-Host "Step 3: Creating/linking service..." -ForegroundColor Cyan
Write-Host "[INFO] Select or create 'ArchonRI-Brain' service when prompted" -ForegroundColor Yellow
railway link

# Set environment variables
Write-Host ""
Write-Host "Step 4: Setting environment variables..." -ForegroundColor Cyan
Write-Host "[INFO] You'll need to set these variables:" -ForegroundColor Yellow
Write-Host "  - NOTION_API_KEY" -ForegroundColor Gray
Write-Host "  - COMMANDS_DB_ID" -ForegroundColor Gray
Write-Host "  - ENTITIES_DB_ID" -ForegroundColor Gray
Write-Host "  - N8N_WEBHOOK_URL" -ForegroundColor Gray
Write-Host ""

$setVars = Read-Host "Do you want to set variables now? (y/n)"
if ($setVars -eq "y") {
    $notionKey = Read-Host "Enter NOTION_API_KEY"
    railway variables set NOTION_API_KEY=$notionKey

    $commandsDb = Read-Host "Enter COMMANDS_DB_ID (32 chars, no hyphens)"
    railway variables set COMMANDS_DB_ID=$commandsDb

    $entitiesDb = Read-Host "Enter ENTITIES_DB_ID (32 chars, no hyphens)"
    railway variables set ENTITIES_DB_ID=$entitiesDb

    $n8nWebhook = Read-Host "Enter N8N_WEBHOOK_URL"
    railway variables set N8N_WEBHOOK_URL=$n8nWebhook

    railway variables set POLL_INTERVAL=5000
}

# Deploy
Write-Host ""
Write-Host "Step 5: Deploying to Railway..." -ForegroundColor Cyan
railway up

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Check deployment: railway logs" -ForegroundColor Gray
Write-Host "  2. View dashboard:   railway open" -ForegroundColor Gray
Write-Host "  3. Get domain:       railway domain" -ForegroundColor Gray
Write-Host ""
