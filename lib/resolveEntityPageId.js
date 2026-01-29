/**
 * Resolve Entity Page ID from Correlation ID
 *
 * Queries the Entities database to find the Notion page ID
 * for a given correlation ID. Used for populating relations.
 */

import { Client } from '@notionhq/client';

/**
 * @param {string} correlationId - The correlation ID to look up
 * @param {string} entitiesDbId - The Notion Entities database ID
 * @param {Client} [notionClient] - Optional Notion client (uses env if not provided)
 * @returns {Promise<string|null>} - The Notion page ID or null if not found
 */
export async function resolveEntityPageId(correlationId, entitiesDbId, notionClient = null) {
  const notion = notionClient || new Client({ auth: process.env.NOTION_TOKEN });

  try {
    const res = await notion.databases.query({
      database_id: entitiesDbId,
      filter: {
        property: 'Correlation ID',
        rich_text: { equals: correlationId }
      },
      page_size: 1
    });

    if (res.results && res.results.length > 0) {
      return res.results[0].id;
    }
    return null;
  } catch (error) {
    console.error(`[resolveEntityPageId] Failed to resolve ${correlationId}:`, error.message);
    return null;
  }
}

/**
 * Resolve multiple correlation IDs to page IDs in batch
 * @param {string[]} correlationIds - Array of correlation IDs
 * @param {string} entitiesDbId - The Notion Entities database ID
 * @param {Client} [notionClient] - Optional Notion client
 * @returns {Promise<Map<string, string>>} - Map of correlationId -> pageId
 */
export async function resolveEntityPageIds(correlationIds, entitiesDbId, notionClient = null) {
  const notion = notionClient || new Client({ auth: process.env.NOTION_TOKEN });
  const results = new Map();

  // Notion doesn't support OR filters well, so we query each
  // For large batches, consider caching or batch API
  for (const corrId of correlationIds) {
    const pageId = await resolveEntityPageId(corrId, entitiesDbId, notion);
    if (pageId) {
      results.set(corrId, pageId);
    }
  }

  return results;
}

export default resolveEntityPageId;
