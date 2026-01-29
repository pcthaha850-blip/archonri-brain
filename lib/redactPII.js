// lib/redactPII.js
import crypto from 'crypto';

export function redactPII(obj = {}, fieldsToHash = ['email','phone','ssn','name']) {
  const copy = JSON.parse(JSON.stringify(obj));
  fieldsToHash.forEach(f => {
    if (copy[f]) {
      const hash = crypto.createHash('sha256').update(String(copy[f])).digest('hex');
      copy[f] = `hash:${hash}`;
    }
  });
  // Remove large raw fields if present
  ['raw_document','full_payload','document_bytes'].forEach(f => { if (copy[f]) delete copy[f]; });
  return copy;
}

/**
 * Create a summary of an object suitable for audit logs
 * @param {Object} obj - The object to summarize
 * @param {number} [maxLength=500] - Maximum length of the summary
 * @returns {string} - A redacted, truncated summary
 */
export function createAuditSummary(obj, maxLength = 500) {
  const redacted = redactPII(obj);
  const json = JSON.stringify(redacted);
  if (json.length <= maxLength) return json;
  return json.substring(0, maxLength - 3) + '...';
}

/**
 * Hash a single value for consistent PII replacement
 * @param {string} value - The value to hash
 * @returns {string} - The hash prefix
 */
export function hashValue(value) {
  const hash = crypto.createHash('sha256').update(String(value)).digest('hex');
  return `hash:${hash}`;
}
