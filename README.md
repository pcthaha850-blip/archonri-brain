# ArchonRI Brain

24/7 Intelligence Service that watches Notion and triggers n8n workflows.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Notion         │────▶│  ArchonRI       │────▶│  n8n            │
│  Commands DB    │     │  Brain          │     │  Workflow       │
│                 │     │  (Railway)      │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
     Status:                 Polls every          Triggers on
     "Deploy"                5 seconds            Deploy status
```

## Quick Start

### 1. Install Railway CLI

```powershell
npm install -g @railway/cli
# OR
iwr https://railway.app/install.ps1 -useb | iex
```

### 2. Create Commands Database in Notion

See `COMMANDS_DB_SCHEMA.md` for the required schema.

### 3. Deploy

```powershell
cd C:\Users\thaha\archonri-brain
.\deploy.ps1
```

Or manually:

```powershell
railway login
railway init
railway link
railway variables set NOTION_API_KEY=ntn_xxx
railway variables set COMMANDS_DB_ID=xxx
railway variables set ENTITIES_DB_ID=xxx
railway variables set N8N_WEBHOOK_URL=https://archonri.app.n8n.cloud/webhook/archonri-apply
railway variables set POLL_INTERVAL=5000
railway up
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NOTION_API_KEY` | Yes | Notion integration token |
| `COMMANDS_DB_ID` | Yes | Commands database ID (32 chars) |
| `ENTITIES_DB_ID` | No | Entities database ID |
| `N8N_WEBHOOK_URL` | Yes | n8n workflow webhook URL |
| `POLL_INTERVAL` | No | Polling interval in ms (default: 5000) |
| `PORT` | No | Health server port (default: 3000) |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check |
| `GET /health` | Health check (alias) |
| `GET /stats` | Detailed statistics |

## How It Works

1. **Polling**: Every 5 seconds, queries Notion for commands with `Status = Deploy`
2. **Processing**: When found, updates status to `Processing`
3. **Trigger**: Sends POST request to n8n webhook with command payload
4. **Complete**: Updates status to `Completed` or `Failed`

## Logs

View Railway logs:
```powershell
railway logs
```

Log format (JSON):
```json
{
  "timestamp": "2026-01-29T12:00:00.000Z",
  "level": "info",
  "message": "Processing command",
  "id": "xxx-xxx-xxx",
  "command": "Deploy Entity"
}
```

## Monitoring

- **Health endpoint**: `https://your-domain.railway.app/health`
- **Stats endpoint**: `https://your-domain.railway.app/stats`
- **Railway dashboard**: `railway open`

## Troubleshooting

### Service keeps restarting
- Check `railway logs` for errors
- Verify all environment variables are set
- Ensure Notion API key has database access

### Commands not being detected
- Verify `COMMANDS_DB_ID` is correct (32 chars, no hyphens)
- Check the Notion integration is shared with the database
- Ensure `Status` property is exactly named "Status"

### n8n workflow not triggering
- Verify `N8N_WEBHOOK_URL` is the production URL (not test URL)
- Check n8n workflow is active
- View Railway logs for HTTP errors

## Local Development

```powershell
# Install dependencies
npm install

# Create .env file
copy .env.example .env
# Edit .env with your values

# Run locally
npm run dev
```

## Files

```
archonri-brain/
├── index.js              # Main application
├── package.json          # Dependencies
├── railway.toml          # Railway configuration
├── .env.example          # Environment template
├── .gitignore            # Git ignore rules
├── deploy.ps1            # Deployment script
├── COMMANDS_DB_SCHEMA.md # Notion schema docs
└── README.md             # This file
```

---

**ArchonRI Brain v1.0.0** - Built for institutional excellence
