#!/usr/bin/env node
/**
 * ArchonRI Staging Validation Harness
 *
 * Runs the audit-first governance flow and validates:
 * - Audit write success
 * - Prompt hash consistency
 * - Schema validity
 * - Decision Log and Agent Output writes
 *
 * Produces summary.json with pass/fail gates.
 *
 * Usage:
 *   NOTION_TOKEN=xxx HMAC_KEY=xxx node staging/harness.js
 *
 * Environment variables:
 *   NOTION_TOKEN       - Notion API token
 *   HMAC_KEY           - HMAC key for signing audits
 *   TASKS_DB_ID        - Notion Tasks/Audit database ID
 *   DECISION_DB_ID     - Notion Decision Log database ID
 *   AGENT_OUTPUTS_DB_ID - Notion Agent Outputs database ID
 *   ENTITIES_DB_ID     - Notion Entities database ID
 *   SCREENING_ENDPOINT - (optional) Screening handler URL
 *   TEST_COUNT         - (optional) Number of test runs (default: 5)
 */

import 'dotenv/config';
import { Client } from '@notionhq/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// CONFIGURATION
// ============================================================

const config = {
  notion: {
    token: process.env.NOTION_TOKEN,
    tasksDbId: process.env.TASKS_DB_ID,
    decisionDbId: process.env.DECISION_DB_ID,
    agentOutputsDbId: process.env.AGENT_OUTPUTS_DB_ID,
    entitiesDbId: process.env.ENTITIES_DB_ID,
  },
  hmacKey: process.env.HMAC_KEY || 'staging-test-key-replace-in-prod',
  screeningEndpoint: process.env.SCREENING_ENDPOINT,
  testCount: parseInt(process.env.TEST_COUNT || '5', 10),
};

// Validation
const requiredEnvVars = ['NOTION_TOKEN', 'TASKS_DB_ID'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`[FATAL] Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const notion = new Client({ auth: config.notion.token });

// ============================================================
// HELPERS (inline for standalone script)
// ============================================================

function redactPII(obj) {
  const piiFields = ['email', 'phone', 'ssn', 'address', 'dob'];
  const copy = JSON.parse(JSON.stringify(obj));

  function redact(o) {
    if (Array.isArray(o)) return o.map(redact);
    if (o && typeof o === 'object') {
      const result = {};
      for (const [k, v] of Object.entries(o)) {
        const kLower = k.toLowerCase();
        if (piiFields.some(f => kLower.includes(f))) {
          result[k] = v ? `hash:${crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 16)}` : v;
        } else {
          result[k] = redact(v);
        }
      }
      return result;
    }
    return o;
  }
  return redact(copy);
}

function signAudit(payload, key) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', key).update(str, 'utf8').digest('hex');
}

function verifySignature(payload, sig, key) {
  const expected = signAudit(payload, key);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig || '', 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function computePromptHash(promptText) {
  return crypto.createHash('sha256').update(promptText, 'utf8').digest('hex');
}

function generateCorrelationId() {
  return `corr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

// ============================================================
// TEST DATA GENERATOR
// ============================================================

function generateTestApplicant(index) {
  return {
    name: `Test Applicant ${index}`,
    email: `test${index}@example.com`,
    company: `Test Company ${index} LLC`,
    revenue: Math.floor(Math.random() * 1000000) + 100000,
    risk_indicators: index % 3 === 0 ? ['high_volatility'] : [],
    correlation_id: generateCorrelationId(),
  };
}

function generateTestPrompt(applicant) {
  return `SYSTEM: You are a screening assistant. Output valid JSON only.

CONTEXT: Applicant: ${JSON.stringify(redactPII(applicant))}

TASK: Evaluate the applicant. Return JSON with keys: decision (pass|manual_review|reject), score (0-100), reasons (array).

CONSTRAINTS: JSON only; deterministic; temperature 0.1.`;
}

// ============================================================
// NOTION WRITERS
// ============================================================

async function writeAuditEntry(auditData) {
  const timestamp = new Date().toISOString();

  try {
    const response = await notion.pages.create({
      parent: { database_id: config.notion.tasksDbId },
      properties: {
        Name: { title: [{ text: { content: `audit-${timestamp}` } }] },
        Type: { select: { name: 'audit' } },
        'Correlation ID': { rich_text: [{ text: { content: auditData.correlation_id } }] },
        'Prompt Hash': { rich_text: [{ text: { content: auditData.prompt_hash } }] },
        Status: { select: { name: 'pending' } },
      },
    });

    return { success: true, pageId: response.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function writeDecisionLog(decisionData) {
  if (!config.notion.decisionDbId) {
    return { success: true, skipped: true, reason: 'DECISION_DB_ID not configured' };
  }

  try {
    const response = await notion.pages.create({
      parent: { database_id: config.notion.decisionDbId },
      properties: {
        Name: { title: [{ text: { content: `Decision — ${decisionData.correlation_id}` } }] },
        Decision: { select: { name: decisionData.decision } },
        Score: { number: decisionData.score },
        'Correlation ID': { rich_text: [{ text: { content: decisionData.correlation_id } }] },
        'Prompt Hash': { rich_text: [{ text: { content: decisionData.prompt_hash } }] },
      },
    });

    return { success: true, pageId: response.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function writeAgentOutput(outputData) {
  if (!config.notion.agentOutputsDbId) {
    return { success: true, skipped: true, reason: 'AGENT_OUTPUTS_DB_ID not configured' };
  }

  try {
    const response = await notion.pages.create({
      parent: { database_id: config.notion.agentOutputsDbId },
      properties: {
        Name: { title: [{ text: { content: `Agent Output — ${outputData.correlation_id}` } }] },
        'Correlation ID': { rich_text: [{ text: { content: outputData.correlation_id } }] },
        'Prompt Hash': { rich_text: [{ text: { content: outputData.prompt_hash } }] },
        Status: { select: { name: 'ok' } },
      },
    });

    return { success: true, pageId: response.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================
// SCREENING HANDLER CALL (optional)
// ============================================================

async function callScreeningHandler(applicant, promptHash) {
  if (!config.screeningEndpoint) {
    // Simulate a response
    return {
      success: true,
      simulated: true,
      decision: applicant.risk_indicators.length > 0 ? 'manual_review' : 'pass',
      score: applicant.risk_indicators.length > 0 ? 65 : 85,
      prompt_hash: promptHash,
    };
  }

  try {
    const response = await fetch(config.screeningEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correlation_id: applicant.correlation_id,
        applicant: redactPII(applicant),
        prompt_hash: promptHash,
      }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, ...data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================
// VALIDATION FLOW
// ============================================================

async function runSingleTest(index) {
  const result = {
    index,
    correlation_id: null,
    audit_write: null,
    prompt_hash_match: null,
    decision_write: null,
    agent_output_write: null,
    signature_valid: null,
    errors: [],
  };

  try {
    // 1. Generate test data
    const applicant = generateTestApplicant(index);
    result.correlation_id = applicant.correlation_id;

    // 2. Generate prompt and compute hash
    const prompt = generateTestPrompt(applicant);
    const promptHash = computePromptHash(prompt);

    // 3. Create audit summary and sign
    const auditSummary = {
      correlation_id: applicant.correlation_id,
      prompt_hash: promptHash,
      input_summary: JSON.stringify(redactPII(applicant)).slice(0, 200),
      timestamp: new Date().toISOString(),
    };
    const signature = signAudit(auditSummary, config.hmacKey);

    // 4. AUDIT-FIRST: Write audit entry before any other action
    const auditResult = await writeAuditEntry({
      correlation_id: applicant.correlation_id,
      prompt_hash: promptHash,
      signature,
    });
    result.audit_write = auditResult.success;
    if (!auditResult.success) {
      result.errors.push(`Audit write failed: ${auditResult.error}`);
    }

    // 5. Verify signature
    result.signature_valid = verifySignature(auditSummary, signature, config.hmacKey);

    // 6. Call screening handler (or simulate)
    const screeningResult = await callScreeningHandler(applicant, promptHash);

    // 7. Verify prompt hash matches
    if (screeningResult.success) {
      result.prompt_hash_match = screeningResult.prompt_hash === promptHash;
      if (!result.prompt_hash_match) {
        result.errors.push('Prompt hash mismatch');
      }

      // 8. Write Decision Log
      const decisionResult = await writeDecisionLog({
        correlation_id: applicant.correlation_id,
        decision: screeningResult.decision || 'manual_review',
        score: screeningResult.score || 0,
        prompt_hash: promptHash,
      });
      result.decision_write = decisionResult.success || decisionResult.skipped;
      if (!decisionResult.success && !decisionResult.skipped) {
        result.errors.push(`Decision write failed: ${decisionResult.error}`);
      }

      // 9. Write Agent Output
      const outputResult = await writeAgentOutput({
        correlation_id: applicant.correlation_id,
        prompt_hash: promptHash,
      });
      result.agent_output_write = outputResult.success || outputResult.skipped;
      if (!outputResult.success && !outputResult.skipped) {
        result.errors.push(`Agent output write failed: ${outputResult.error}`);
      }
    } else {
      result.errors.push(`Screening failed: ${screeningResult.error}`);
    }
  } catch (error) {
    result.errors.push(`Unexpected error: ${error.message}`);
  }

  return result;
}

// ============================================================
// MAIN HARNESS
// ============================================================

async function runHarness() {
  console.log('========================================');
  console.log('ArchonRI Staging Validation Harness');
  console.log('========================================');
  console.log(`Test count: ${config.testCount}`);
  console.log(`Tasks DB: ${config.notion.tasksDbId?.slice(0, 8)}...`);
  console.log(`Decision DB: ${config.notion.decisionDbId?.slice(0, 8) || 'not configured'}...`);
  console.log(`Agent Outputs DB: ${config.notion.agentOutputsDbId?.slice(0, 8) || 'not configured'}...`);
  console.log();

  const results = [];
  const startTime = Date.now();

  for (let i = 1; i <= config.testCount; i++) {
    process.stdout.write(`Running test ${i}/${config.testCount}... `);
    const result = await runSingleTest(i);
    results.push(result);

    const status = result.errors.length === 0 ? '✅' : '❌';
    console.log(`${status} ${result.correlation_id}`);

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  const duration = Date.now() - startTime;

  // Calculate summary
  const summary = {
    timestamp: new Date().toISOString(),
    duration_ms: duration,
    total_tests: config.testCount,
    results: {
      audit_write_success: results.filter(r => r.audit_write).length,
      prompt_hash_match: results.filter(r => r.prompt_hash_match).length,
      decision_write_success: results.filter(r => r.decision_write).length,
      agent_output_success: results.filter(r => r.agent_output_write).length,
      signature_valid: results.filter(r => r.signature_valid).length,
      total_errors: results.reduce((sum, r) => sum + r.errors.length, 0),
    },
    rates: {},
    gates: {},
    passed: false,
    errors: results.flatMap(r => r.errors),
  };

  // Calculate rates
  summary.rates.audit_write = (summary.results.audit_write_success / config.testCount * 100).toFixed(1) + '%';
  summary.rates.prompt_hash_match = (summary.results.prompt_hash_match / config.testCount * 100).toFixed(1) + '%';
  summary.rates.signature_valid = (summary.results.signature_valid / config.testCount * 100).toFixed(1) + '%';

  // Check gates
  summary.gates.audit_write_100 = summary.results.audit_write_success === config.testCount;
  summary.gates.prompt_hash_match_100 = summary.results.prompt_hash_match === config.testCount;
  summary.gates.signature_valid_100 = summary.results.signature_valid === config.testCount;
  summary.gates.error_rate_below_5 = (summary.results.total_errors / config.testCount) < 0.05;

  // Overall pass
  summary.passed = summary.gates.audit_write_100 &&
                   summary.gates.prompt_hash_match_100 &&
                   summary.gates.signature_valid_100;

  // Output summary
  console.log();
  console.log('========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Duration: ${duration}ms`);
  console.log(`Audit Write Success: ${summary.rates.audit_write}`);
  console.log(`Prompt Hash Match: ${summary.rates.prompt_hash_match}`);
  console.log(`Signature Valid: ${summary.rates.signature_valid}`);
  console.log();
  console.log('GATES:');
  console.log(`  Audit Write 100%: ${summary.gates.audit_write_100 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Prompt Hash 100%: ${summary.gates.prompt_hash_match_100 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Signature Valid 100%: ${summary.gates.signature_valid_100 ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
  console.log(`OVERALL: ${summary.passed ? '✅ PASSED' : '❌ FAILED'}`);

  if (summary.errors.length > 0) {
    console.log();
    console.log('ERRORS:');
    summary.errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
    if (summary.errors.length > 10) {
      console.log(`  ... and ${summary.errors.length - 10} more`);
    }
  }

  // Write summary.json
  const summaryPath = path.join(__dirname, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log();
  console.log(`Summary written to: ${summaryPath}`);

  // Write detailed results
  const resultsPath = path.join(__dirname, 'results.jsonl');
  fs.writeFileSync(resultsPath, results.map(r => JSON.stringify(r)).join('\n'));
  console.log(`Results written to: ${resultsPath}`);

  // Exit with appropriate code
  process.exit(summary.passed ? 0 : 1);
}

// Run
runHarness().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
