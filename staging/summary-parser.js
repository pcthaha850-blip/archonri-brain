#!/usr/bin/env node
/**
 * staging/summary-parser.js
 *
 * Parses summary.json and fails CI if promotion gates are not met.
 *
 * Usage:
 *   node staging/summary-parser.js
 *
 * Exit codes:
 *   0 - All gates passed
 *   1 - Gates failed
 *   2 - summary.json not found or parse error
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUMMARY_PATH = path.join(__dirname, 'summary.json');

// Gate thresholds (configurable via env)
const GATES = {
  AUDIT_WRITE_SUCCESS_MIN: parseFloat(process.env.GATE_AUDIT_WRITE || '1.0'),      // 100%
  PROMPT_HASH_MATCH_MIN: parseFloat(process.env.GATE_PROMPT_HASH || '1.0'),        // 100%
  SIGNATURE_VERIFIED_MIN: parseFloat(process.env.GATE_SIGNATURE || '1.0'),         // 100%
  SCHEMA_ERROR_MAX: parseFloat(process.env.GATE_SCHEMA_ERRORS || '0.0'),           // 0%
  SUCCESS_RATE_MIN: parseFloat(process.env.GATE_SUCCESS_RATE || '0.98'),           // 98%
};

async function parseSummary() {
  try {
    const content = await fs.readFile(SUMMARY_PATH, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('❌ summary.json not found. Run the harness first.');
    } else {
      console.error('❌ Failed to parse summary.json:', err.message);
    }
    process.exit(2);
  }
}

function checkGates(data) {
  const { summary, results } = data;
  const total = summary.total || results?.length || 0;

  if (total === 0) {
    console.error('❌ No test results found in summary.');
    return false;
  }

  const gates = [];

  // Calculate rates
  const auditWriteRate = (summary.auditWriteSuccess ?? summary.successCount ?? 0) / total;
  const promptHashRate = (summary.promptHashMatches ?? 0) / total;
  const signatureRate = (summary.signatureVerified ?? 0) / total;
  const schemaErrorRate = (summary.schemaErrors ?? 0) / total;
  const successRate = (summary.successCount ?? 0) / total;

  // Check each gate
  gates.push({
    name: 'Audit Write Success',
    value: auditWriteRate,
    threshold: GATES.AUDIT_WRITE_SUCCESS_MIN,
    operator: '>=',
    pass: auditWriteRate >= GATES.AUDIT_WRITE_SUCCESS_MIN
  });

  gates.push({
    name: 'Prompt Hash Match',
    value: promptHashRate,
    threshold: GATES.PROMPT_HASH_MATCH_MIN,
    operator: '>=',
    pass: promptHashRate >= GATES.PROMPT_HASH_MATCH_MIN
  });

  gates.push({
    name: 'Signature Verified',
    value: signatureRate,
    threshold: GATES.SIGNATURE_VERIFIED_MIN,
    operator: '>=',
    pass: signatureRate >= GATES.SIGNATURE_VERIFIED_MIN
  });

  gates.push({
    name: 'Schema Errors',
    value: schemaErrorRate,
    threshold: GATES.SCHEMA_ERROR_MAX,
    operator: '<=',
    pass: schemaErrorRate <= GATES.SCHEMA_ERROR_MAX
  });

  gates.push({
    name: 'Overall Success Rate',
    value: successRate,
    threshold: GATES.SUCCESS_RATE_MIN,
    operator: '>=',
    pass: successRate >= GATES.SUCCESS_RATE_MIN
  });

  // Print results
  console.log('========================================');
  console.log('PROMOTION GATE CHECK');
  console.log('========================================');
  console.log(`Total tests: ${total}`);
  console.log();

  let allPassed = true;
  for (const gate of gates) {
    const status = gate.pass ? '✅ PASS' : '❌ FAIL';
    const pct = (gate.value * 100).toFixed(1) + '%';
    const thresholdPct = (gate.threshold * 100).toFixed(1) + '%';
    console.log(`${status} ${gate.name}: ${pct} (${gate.operator} ${thresholdPct})`);
    if (!gate.pass) allPassed = false;
  }

  console.log();
  console.log('========================================');

  if (allPassed) {
    console.log('✅ ALL GATES PASSED - Ready for promotion');
  } else {
    console.log('❌ GATES FAILED - Fix issues before promotion');

    // Show first few errors if available
    if (results && results.length > 0) {
      const errors = results.filter(r => !r.success || r.schemaErrors?.length > 0);
      if (errors.length > 0) {
        console.log();
        console.log('Sample failures:');
        errors.slice(0, 3).forEach(e => {
          console.log(`  - ${e.correlationId}: ${e.reason || e.schemaErrors?.join(', ') || 'unknown'}`);
        });
      }
    }
  }
  console.log('========================================');

  return allPassed;
}

async function main() {
  const data = await parseSummary();
  const passed = checkGates(data);
  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
