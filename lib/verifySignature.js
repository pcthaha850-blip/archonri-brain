// lib/verifySignature.js
import crypto from 'crypto';

export function verifySignature(payload, signatureHex, hmacKey = process.env.HMAC_KEY) {
  const expected = crypto.createHmac('sha256', hmacKey).update(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8').digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signatureHex || '', 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
