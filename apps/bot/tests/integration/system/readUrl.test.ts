/**
 * Integration Test: Diffbot URL Extraction (readUrl tool)
 * Thay thế Gemini URL Context - free tier 10k credits/tháng
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { diffbotExtractArticle } from '../../../src/modules/search/services/diffbotClient.js';
import { hasApiKey, isHttpFetchDisabled, TEST_CONFIG } from '../setup.js';

const SKIP_REMOTE = isHttpFetchDisabled();
const SKIP = SKIP_REMOTE || !hasApiKey('diffbot');

describe.skipIf(SKIP)('Diffbot URL Extraction (readUrl tool)', () => {
  beforeAll(() => {
    if (SKIP) console.log('⏭️  Skipping Diffbot tests: DIFFBOT_TOKEN not configured');
  });

  test('diffbotExtractArticle - Wikipedia article', async () => {
    const article = await diffbotExtractArticle({
      url: 'https://en.wikipedia.org/wiki/TypeScript',
      fields: 'title,text,author,date,siteName',
    });

    expect(article).not.toBeNull();
    expect(article!.title).toContain('TypeScript');
    expect(article!.text).toBeDefined();
    expect(article!.text!.length).toBeGreaterThan(500);
    expect(article!.siteName).toBeDefined();
  }, TEST_CONFIG.timeout);

  test('diffbotExtractArticle - với fields filter (chỉ title+text)', async () => {
    const article = await diffbotExtractArticle({
      url: 'https://en.wikipedia.org/wiki/JavaScript',
      fields: 'title,text',
    });

    expect(article).not.toBeNull();
    expect(article!.title).toBeDefined();
    expect(article!.text).toBeDefined();
    // Khi request fields=title,text thì các field khác không nên có
    expect(article!.author).toBeUndefined();
  }, TEST_CONFIG.timeout);

  test('diffbotExtractArticle - URL totally invalid phải throw với message rõ ràng', async () => {
    // Diffbot trả error response với errorCode khi invalid token/URL
    // Expect: throw Error với message chứa "Diffbot"
    await expect(
      diffbotExtractArticle({ url: 'https://this-domain-does-not-exist-12345xyz.example/article' }),
    ).rejects.toThrow(/Diffbot/);
  }, TEST_CONFIG.timeout);
});
