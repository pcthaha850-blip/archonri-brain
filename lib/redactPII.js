/**
 * PII Redaction Helper
 *
 * Redacts personally identifiable information before storing
 * in Notion or logs. Replaces sensitive fields with SHA-256 hashes.
 */

import crypto from 'crypto';

// Default fields to hash (can be extended)
const DEFAULT_PII_FIELDS = [
  'email',
  'phone',
  'ssn',
  'social_security',
  'passport',
  'driver_license',
  'credit_card',
  'bank_account',
  'date_of_birth',
  'dob',
  'address',
  'ip_address'
];

// Fields to completely remove (too sensitive to even hash)
const FIELDS_TO_REMOVE = [
  'raw_document',
  'full_payload',
  'password',
  'secret',
  'private_key',
  'api_key',
  'token'
];

/**
 * Redact PII from an object
 * @param {Object} obj - The object containing potential PII
 * @param {string[]} [fieldsToHash] - Fields to hash (defaults to common PII fields)
 * @param {string[]} [fieldsToRemove] - Fields to completely remove
 * @returns {Object} - A new object with PII redacted
 */
export function redactPII(obj, fieldsToHash = DEFAULT_PII_FIELDS, fieldsToRemove = FIELDS_TO_REMOVE) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Deep clone to avoid mutating original
  const copy = JSON.parse(JSON.stringify(obj));

  // Recursively process the object
  return redactObject(copy, fieldsToHash, fieldsToRemove);
}

/**
 * Internal recursive redaction
 */
function redactObject(obj, fieldsToHash, fieldsToRemove) {
  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item, fieldsToHash, fieldsToRemove));
  }

  if (obj && typeof obj === 'object') {
    const result = {};

    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase();

      // Check if field should be removed entirely
      if (fieldsToRemove.some(f => keyLower.includes(f.toLowerCase()))) {
        result[key] = '[REDACTED]';
        continue;
      }

      // Check if field should be hashed
      if (fieldsToHash.some(f => keyLower.includes(f.toLowerCase()))) {
        if (value && typeof value === 'string') {
          const hash = crypto.createHash('sha256').update(value).digest('hex');
          result[key] = `hash:${hash.substring(0, 16)}...`;
        } else if (value) {
          result[key] = '[REDACTED_NON_STRING]';
        } else {
          result[key] = value;
        }
        continue;
      }

      // Recurse into nested objects
      result[key] = redactObject(value, fieldsToHash, fieldsToRemove);
    }

    return result;
  }

  return obj;
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

  if (json.length <= maxLength) {
    return json;
  }

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

export default redactPII;
