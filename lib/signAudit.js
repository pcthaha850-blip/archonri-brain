// lib/signAudit.js
import crypto from 'crypto';

export function signAudit(auditPayload, hmacKey = process.env.HMAC_KEY) {
  const payload = typeof auditPayload === 'string' ? auditPayload : JSON.stringify(auditPayload);
  return crypto.createHmac('sha256', hmacKey).update(payload, 'utf8').digest('hex');
}

/**
 * Create a signed audit entry object ready for Notion
 * @param {Object} auditData - The audit data
 * @param {string} [hmacKey] - The HMAC key
 * @returns {Object} - Audit data with signature added
 */
export function createSignedAudit(auditData, hmacKey = process.env.HMAC_KEY) {
  const signature = signAudit(auditData, hmacKey);
  return {
    ...auditData,
    signature,
    signed_at: new Date().toISOString()
  };
}

/**
 * Compute prompt hash for deterministic prompt tracking
 * @param {string} promptText - The exact prompt text sent to the model
 * @returns {string} - SHA-256 hash of the prompt
 */
export function computePromptHash(promptText) {
  return crypto.createHash('sha256').update(promptText, 'utf8').digest('hex');
}
