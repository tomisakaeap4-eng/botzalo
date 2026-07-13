/**
 * Integration Test Setup
 * Cấu hình và utilities cho integration tests
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { debugLog } from '../../src/core/logger/logger.js';

// Load .env.test explicitly for test environment
const envTestPath = resolve(process.cwd(), '.env.test');
if (existsSync(envTestPath)) {
  const envContent = readFileSync(envTestPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
}

// Test configuration
export const TEST_CONFIG = {
  timeout: 60000, // 60s cho các API calls chậm
  retries: 2,
  verbose: process.env.TEST_VERBOSE === 'true',
};

// API Keys validation
export const API_KEYS = {
  gemini: process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_1,
  edgeTts: true, // Không cần API key, dùng Microsoft Edge TTS service
  zaloCredentials: process.env.ZALO_CREDENTIALS_BASE64,
};

/**
 * Heuristic: is this env value a placeholder/stub, not a real key?
 * Used so tests can preload keyManager.ts (which calls `process.exit(1)` when no
 * key is set) without triggering live API calls.
 *
 * Recognized stubs:
 *   - empty string
 *   - starts with 'stub' / 'your_' / 'placeholder' / '<your'
 */
export function isStubKey(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  if (!v) return true;
  return /^(stub|your_|placeholder|<your|change-?me\b|change-?me-)/i.test(v);
}

/**
 * Check if API key is available (real, non-stub value).
 *
 * Special-case for `zaloCredentials`: the env value is base64-encoded JSON.
 * A "real" base64 string can still represent stub-shaped credentials; we
 * decode and inspect `uid` to detect that pattern so live Zalo service test
 * suites correctly skip without bypassing decode-only credential tests.
 */
export function hasApiKey(key: keyof typeof API_KEYS): boolean {
  const value = API_KEYS[key];
  if (typeof value === 'boolean') return value; // edgeTts = true

  if (
    key === 'zaloCredentials' &&
    typeof value === 'string' &&
    !isStubKey(value)
  ) {
    try {
      const decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf-8'));
      const uidStr = String(decoded.uid ?? '');
      if (!uidStr || isStubKey(uidStr)) return false;
    } catch (err) {
      // Decode/parse fail — treat as no real credentials so live Zalo suite skips.
      debugLog('SETUP', `ZALO_CREDENTIALS_BASE64 decode failed (${err}); treating as stub`);
      return false;
    }
  }

  return !isStubKey(value as string | undefined);
}

/**
 * Skip test if API key is missing
 */
export function skipIfNoKey(key: keyof typeof API_KEYS): void {
  if (!hasApiKey(key)) {
    console.log(`⏭️  Skipping: ${key} API key not configured`);
  }
}

/**
 * Log test result
 */
export function logResult(testName: string, success: boolean, data?: any): void {
  if (success) {
    console.log(`✅ ${testName}`);
    if (TEST_CONFIG.verbose && data) {
      console.log('   Data:', JSON.stringify(data, null, 2).slice(0, 500));
    }
  } else {
    console.log(`❌ ${testName}`);
    if (data) {
      console.log('   Error:', data);
    }
  }
}

/**
 * Assert helper
 */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Test runner wrapper with timeout
 */
export async function runTest<T>(
  name: string,
  fn: () => Promise<T>,
  timeout = TEST_CONFIG.timeout,
): Promise<{ success: boolean; data?: T; error?: string }> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
  });

  try {
    const data = await Promise.race([fn(), timeoutPromise]);
    logResult(name, true, data);
    return { success: true, data };
  } catch (error: any) {
    logResult(name, false, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Mock ToolContext for testing tools
 */
export const mockToolContext = {
  api: null,
  threadId: 'test-thread-' + Date.now(),
  senderId: 'test-sender-' + Date.now(),
  senderName: 'Test User',
};
