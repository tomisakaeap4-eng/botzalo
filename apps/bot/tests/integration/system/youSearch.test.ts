/**
 * Integration Test: You.com Search API
 * Test các chức năng tìm kiếm web qua You.com
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { youSearch } from '../../../src/modules/search/services/youClient.js';
import { hasApiKey, isHttpFetchDisabled, TEST_CONFIG } from '../setup.js';

const SKIP_REMOTE = isHttpFetchDisabled();
const SKIP = SKIP_REMOTE || !hasApiKey('youSearch');

describe.skipIf(SKIP)('You.com Search API Integration', () => {
  beforeAll(() => {
    if (SKIP) console.log('⏭️  Skipping You Search tests: YOU_API_KEY not configured');
  });

  test('youSearch - tìm kiếm cơ bản', async () => {
    const result = await youSearch({
      query: 'TypeScript tutorial',
      count: 5,
    });

    expect(result).toBeDefined();
    expect(result.results).toBeDefined();
    expect(result.results.web).toBeArray();
    expect(result.results.web.length).toBeGreaterThan(0);
    expect(result.results.web.length).toBeLessThanOrEqual(5);

    const hit = result.results.web[0];
    expect(hit.url).toContain('http');
    expect(hit.title).toBeDefined();
    expect(hit.title.length).toBeGreaterThan(0);
  }, TEST_CONFIG.timeout);

  test('youSearch - country filter VN', async () => {
    const result = await youSearch({
      query: 'thời tiết Hà Nội',
      count: 3,
      country: 'VN',
    });

    expect(result.results.web).toBeArray();
    expect(result.results.web.length).toBeGreaterThan(0);
  }, TEST_CONFIG.timeout);

  test('youSearch - language filter en', async () => {
    const result = await youSearch({
      query: 'react hooks',
      count: 3,
      language: 'en',
    });

    expect(result.results.web).toBeArray();
    expect(result.results.web.length).toBeGreaterThan(0);
  }, TEST_CONFIG.timeout);

  test('youSearch - safeSearch on', async () => {
    const result = await youSearch({
      query: 'programming tutorial',
      count: 3,
      safeSearch: 'on',
    });

    expect(result.results.web).toBeArray();
    expect(result.results.web.length).toBeGreaterThan(0);
  }, TEST_CONFIG.timeout);

  test('youSearch - max count 20', async () => {
    const result = await youSearch({
      query: 'JavaScript',
      count: 20,
    });

    expect(result.results.web.length).toBeLessThanOrEqual(20);
  }, TEST_CONFIG.timeout);
});
