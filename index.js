/**
 * ArchonRI Brain - 24/7 Intelligence Service
 *
 * Watches Notion Commands database for status changes
 * Triggers n8n workflows when 'Deploy' status is detected
 *
 * @version 1.0.0
 * @author ArchonRI Platform
 */

import 'dotenv/config';
import { Client } from '@notionhq/client';
import http from 'http';

// ============================================================
// CONFIGURATION
// ============================================================

const config = {
  notion: {
    apiKey: process.env.NOTION_API_KEY,
    commandsDbId: process.env.COMMANDS_DB_ID,
    entitiesDbId: process.env.ENTITIES_DB_ID,
  },
  n8n: {
    webhookUrl: process.env.N8N_WEBHOOK_URL,
  },
  pollInterval: parseInt(process.env.POLL_INTERVAL || '5000', 10),
  port: parseInt(process.env.PORT || '3000', 10),
};

// Validate required environment variables
const requiredEnvVars = ['NOTION_API_KEY', 'COMMANDS_DB_ID', 'N8N_WEBHOOK_URL'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`[FATAL] Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// ============================================================
// NOTION CLIENT
// ============================================================

const notion = new Client({ auth: config.notion.apiKey });

// Track processed command IDs to avoid duplicate triggers
const processedCommands = new Set();

// ============================================================
// LOGGING
// ============================================================

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data,
  };
  console.log(JSON.stringify(logEntry));
}

// ============================================================
// NOTION WATCHER
// ============================================================

async function fetchPendingCommands() {
  try {
    const response = await notion.databases.query({
      database_id: config.notion.commandsDbId,
      filter: {
        property: 'Status',
        select: {
          equals: 'Deploy',
        },
      },
      sorts: [
        {
          timestamp: 'created_time',
          direction: 'ascending',
        },
      ],
    });

    return response.results;
  } catch (error) {
    log('error', 'Failed to fetch commands from Notion', {
      error: error.message,
      code: error.code,
    });
    return [];
  }
}

async function extractCommandData(page) {
  const properties = page.properties;

  // Extract common properties - adjust based on your Commands DB schema
  const data = {
    id: page.id,
    command: properties.Name?.title?.[0]?.plain_text || 'Unknown',
    status: properties.Status?.select?.name || 'Unknown',
    entityId: properties['Entity ID']?.rich_text?.[0]?.plain_text || null,
    payload: properties.Payload?.rich_text?.[0]?.plain_text || '{}',
    createdTime: page.created_time,
  };

  // Try to parse payload as JSON
  try {
    data.parsedPayload = JSON.parse(data.payload);
  } catch {
    data.parsedPayload = {};
  }

  return data;
}

async function updateCommandStatus(pageId, newStatus, notes = '') {
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        Status: {
          select: { name: newStatus },
        },
        ...(notes && {
          Notes: {
            rich_text: [{ text: { content: notes } }],
          },
        }),
      },
    });
    log('info', 'Updated command status', { pageId, newStatus });
  } catch (error) {
    log('error', 'Failed to update command status', {
      pageId,
      error: error.message,
    });
  }
}

// ============================================================
// N8N WORKFLOW TRIGGER
// ============================================================

async function triggerN8nWorkflow(commandData) {
  try {
    const payload = {
      source: 'archonri-brain',
      command: commandData.command,
      entity_id: commandData.entityId,
      timestamp: new Date().toISOString(),
      ...commandData.parsedPayload,
    };

    log('info', 'Triggering n8n workflow', {
      command: commandData.command,
      webhookUrl: config.n8n.webhookUrl,
    });

    const response = await fetch(config.n8n.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json().catch(() => ({}));

    log('info', 'n8n workflow triggered successfully', {
      commandId: commandData.id,
      responseStatus: response.status,
    });

    return { success: true, result };
  } catch (error) {
    log('error', 'Failed to trigger n8n workflow', {
      commandId: commandData.id,
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

// ============================================================
// MAIN POLLING LOOP
// ============================================================

async function processCommands() {
  const commands = await fetchPendingCommands();

  for (const page of commands) {
    // Skip if already processed in this session
    if (processedCommands.has(page.id)) {
      continue;
    }

    const commandData = await extractCommandData(page);

    log('info', 'Processing command', {
      id: commandData.id,
      command: commandData.command,
    });

    // Mark as processing
    await updateCommandStatus(page.id, 'Processing');
    processedCommands.add(page.id);

    // Trigger the n8n workflow
    const result = await triggerN8nWorkflow(commandData);

    // Update status based on result
    if (result.success) {
      await updateCommandStatus(
        page.id,
        'Completed',
        `Executed at ${new Date().toISOString()}`
      );
    } else {
      await updateCommandStatus(
        page.id,
        'Failed',
        `Error: ${result.error}`
      );
    }
  }
}

let pollCount = 0;

async function startPolling() {
  log('info', 'Starting Notion watcher', {
    commandsDbId: config.notion.commandsDbId,
    pollInterval: config.pollInterval,
  });

  const poll = async () => {
    pollCount++;

    try {
      await processCommands();
    } catch (error) {
      log('error', 'Polling error', { error: error.message });
    }

    // Log heartbeat every 100 polls (~8 min at 5s interval)
    if (pollCount % 100 === 0) {
      log('info', 'Heartbeat', {
        pollCount,
        processedCommands: processedCommands.size,
        uptime: process.uptime(),
      });
    }

    setTimeout(poll, config.pollInterval);
  };

  poll();
}

// ============================================================
// HEALTH CHECK SERVER
// ============================================================

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        service: 'archonri-brain',
        version: '1.0.0',
        uptime: process.uptime(),
        pollCount,
        processedCommands: processedCommands.size,
        timestamp: new Date().toISOString(),
      }));
    } else if (req.url === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        pollCount,
        processedCommands: Array.from(processedCommands),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        config: {
          pollInterval: config.pollInterval,
          commandsDbId: config.notion.commandsDbId?.slice(0, 8) + '...',
        },
      }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(config.port, () => {
    log('info', 'Health server started', { port: config.port });
  });

  return server;
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

function setupGracefulShutdown() {
  const shutdown = (signal) => {
    log('info', 'Shutdown signal received', { signal });
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (error) => {
    log('error', 'Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    log('error', 'Unhandled rejection', { reason: String(reason) });
  });
}

// ============================================================
// STARTUP
// ============================================================

async function main() {
  log('info', '========================================');
  log('info', 'ArchonRI Brain v1.0.0 Starting...');
  log('info', '========================================');

  setupGracefulShutdown();
  startHealthServer();

  // Test Notion connection
  try {
    const dbInfo = await notion.databases.retrieve({
      database_id: config.notion.commandsDbId,
    });
    log('info', 'Connected to Notion Commands database', {
      title: dbInfo.title?.[0]?.plain_text || 'Unknown',
    });
  } catch (error) {
    log('error', 'Failed to connect to Notion', { error: error.message });
    log('warn', 'Continuing anyway - will retry on poll');
  }

  startPolling();
}

main().catch((error) => {
  log('error', 'Fatal startup error', { error: error.message });
  process.exit(1);
});
