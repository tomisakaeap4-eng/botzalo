/**
 * Integration Test: Tavily Search API
 * Test các chức năng tìm kiếm web qua Tavily
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { tavilySearch } from '../../../src/modules/search/services/tavilyClient.js';
import { hasApiKey, isHttpFetchDisabled, TEST_CONFIG } from '../setup.js';

const SKIP_REMOTE = isHttpFetchDisabled();
const SKIP = SKIP_REMOTE || !hasApiKey('tavilySearch');

describe.skipIf(SKIP)('Tavily Search API Integration', () => {
  beforeAll(() => {
    if (SKIP) console.log('⏭️  Skipping Tavily Search tests: TAVILY_API_KEY not configured');
  });

  test('tavilySearch - tìm kiếm cơ bản', async () => {
    const result = await tavilySearch({
      query: 'TypeScript tutorial',
      maxResults: 5,
    });

    expect(result).toBeDefined();
    expect(result.results).toBeArray();
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.length).toBeLessThanOrEqual(5);

    const item = result.results[0];
    expect(item.title).toBeDefined();
    expect(item.url).toContain('http');
    expect(item.content).toBeDefined();
    expect(item.score).toBeGreaterThan(0);
  }, TEST_CONFIG.timeout);

  test('tavilySearch - trả về AI-synthesized answer', async () => {
    const result = await tavilySearch({
      query: 'what is TypeScript in one sentence',
      maxResults: 3,
      includeAnswer: true,
    });

    expect(result.answer).toBeDefined();
    expect(result.answer).not.toBeNull();
    expect((result.answer ?? '').length).toBeGreaterThan(0);
  }, TEST_CONFIG.timeout);

  test('tavilySearch - topic: news', async () => {
    const result = await tavilySearch({
      query: 'AI news',
      maxResults: 3,
      topic: 'news',
    });

    expect(result.results).toBeArray();
    expect(result.results.length).toBeGreaterThan(0);
  }, TEST_CONFIG.timeout);

  test('tavilySearch - includeDomains filter (ưu tiên)', async () => {
    const result = await tavilySearch({
      query: 'react hooks',
      maxResults: 5,
      includeDomains: ['react.dev'],
    });

    expect(result.results).toBeArray();
    expect(result.results.length).toBeGreaterThan(0);
    // Tavily biases toward includeDomains; ít nhất phải có 1 kết quả thuộc domain được include.
    const matched = result.results.some((r) => r.url.includes('react.dev'));
    expect(matched).toBe(true);
  }, TEST_CONFIG.timeout);

  test('tavilySearch - excludeDomains filter (loại trừ)', async () => {
    const result = await tavilySearch({
      query: 'javascript tutorial',
      maxResults: 5,
      excludeDomains: ['pinterest.com'],
    });

    expect(result.results).toBeArray();
    expect(result.results.length).toBeGreaterThan(0);
    // Kết quả phải KHÔNG chứa domain bị loại trừ.
    const excluded = result.results.some((r) => r.url.includes('pinterest.com'));
    expect(excluded).toBe(false);
  }, TEST_CONFIG.timeout);

  test('tavilySearch - includeAnswer=false bỏ qua LLM answer', async () => {
    const result = await tavilySearch({
      query: 'TypeScript what is it',
      maxResults: 3,
      includeAnswer: false,
    });

    expect(result.results).toBeArray();
    expect(result.results.length).toBeGreaterThan(0);
    // Khi includeAnswer=false, answer nên null/undefined.
    expect(result.answer == null).toBe(true);
  }, TEST_CONFIG.timeout);
});
