/**
 * Audit Signing Helper
 *
 * Creates HMAC-SHA256 signatures for audit entries to ensure
 * integrity and non-repudiation of governance decisions.
 */

import crypto from 'crypto';

/**
 * Sign an audit payload with HMAC-SHA256
 * @param {Object|string} auditPayload - The payload to sign
 * @param {string} [hmacKey] - The HMAC secret key (defaults to env)
 * @returns {string} - Hex-encoded signature
 */
export function signAudit(auditPayload, hmacKey = null) {
  const key = hmacKey || process.env.HMAC_KEY || process.env.AUDIT_HMAC_KEY;

  if (!key) {
    throw new Error('HMAC_KEY environment variable is required for signing');
  }

  const payload = typeof auditPayload === 'string'
    ? auditPayload
    : JSON.stringify(auditPayload, Object.keys(auditPayload).sort());

  return crypto
    .createHmac('sha256', key)
    .update(payload, 'utf8')
    .digest('hex');
}

/**
 * Verify an audit signature
 * @param {Object|string} payload - The original payload
 * @param {string} signatureHex - The signature to verify
 * @param {string} [hmacKey] - The HMAC secret key (defaults to env)
 * @returns {boolean} - True if signature is valid
 */
export function verifySignature(payload, signatureHex, hmacKey = null) {
  const key = hmacKey || process.env.HMAC_KEY || process.env.AUDIT_HMAC_KEY;

  if (!key) {
    throw new Error('HMAC_KEY environment variable is required for verification');
  }

  const payloadStr = typeof payload === 'string'
    ? payload
    : JSON.stringify(payload, Object.keys(payload).sort());

  const expected = crypto
    .createHmac('sha256', key)
    .update(payloadStr, 'utf8')
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signatureHex || '', 'hex');

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

/**
 * Create a signed audit entry object ready for Notion
 * @param {Object} auditData - The audit data
 * @param {string} [hmacKey] - The HMAC key
 * @returns {Object} - Audit data with signature added
 */
export function createSignedAudit(auditData, hmacKey = null) {
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
  return crypto
    .createHash('sha256')
    .update(promptText, 'utf8')
    .digest('hex');
}

export { signAudit as default, verifySignature, createSignedAudit, computePromptHash };
