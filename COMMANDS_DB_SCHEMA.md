# Commands Database Schema

Create this database in Notion to enable the ArchonRI Brain service.

## Required Properties

| Property | Type | Options | Description |
|----------|------|---------|-------------|
| **Name** | Title | - | Command name/description |
| **Status** | Select | Deploy, Processing, Completed, Failed, Cancelled | Workflow trigger status |
| **Entity ID** | Rich Text | - | Related entity identifier |
| **Payload** | Rich Text | - | JSON payload for the workflow |
| **Notes** | Rich Text | - | Execution notes/errors |
| **Created** | Created Time | - | Auto-generated timestamp |

## Status Flow

```
[New Entry] → Deploy → Processing → Completed
                  ↘              ↗
                    Failed ←───┘
```

## How It Works

1. Create a new entry with **Status = Deploy**
2. ArchonRI Brain detects it within 5 seconds
3. Status changes to **Processing**
4. n8n workflow is triggered with the payload
5. Status changes to **Completed** or **Failed**

## Example Payload

```json
{
  "company_name": "GoldTrust Bullion Ltd",
  "jurisdiction": "UAE (DMCC)",
  "license_type": "Broker",
  "license_number": "DMCC-12345",
  "balance_band": "Large (>$10M)",
  "inventory_backing": "Yes",
  "hedging_purpose": "Inventory hedge",
  "contact_email": "compliance@goldtrust.com"
}
```

## Quick Test

1. Create a command entry:
   - Name: "Test Deploy"
   - Status: Deploy
   - Payload: `{"test": true}`

2. Watch the status change within 5 seconds

3. Check Railway logs for execution details
