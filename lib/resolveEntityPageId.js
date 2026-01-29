// lib/resolveEntityPageId.js
import { Client } from '@notionhq/client';
const notion = new Client({ auth: process.env.NOTION_TOKEN });

export async function resolveEntityPageId(correlationId, entitiesDbId = process.env.ENTITIES_DB_ID) {
  if (!correlationId) return null;
  const res = await notion.databases.query({
    database_id: entitiesDbId,
    filter: {
      property: 'Correlation ID',
      rich_text: { equals: correlationId }
    },
    page_size: 1
  });
  if (res.results && res.results.length) return res.results[0].id;
  return null;
}

/**
 * Resolve multiple correlation IDs to page IDs in batch
 * @param {string[]} correlationIds - Array of correlation IDs
 * @param {string} entitiesDbId - The Notion Entities database ID
 * @returns {Promise<Map<string, string>>} - Map of correlationId -> pageId
 */
export async function resolveEntityPageIds(correlationIds, entitiesDbId = process.env.ENTITIES_DB_ID) {
  const results = new Map();
  for (const corrId of correlationIds) {
    const pageId = await resolveEntityPageId(corrId, entitiesDbId);
    if (pageId) {
      results.set(corrId, pageId);
    }
  }
  return results;
}
