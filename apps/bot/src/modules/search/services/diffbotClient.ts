/**
 * Diffbot Article API Client
 * Docs: https://docs.diffbot.com/reference/introduction
 *
 * Thay thế cho Gemini URL Context để đọc nội dung bất kỳ URL nào user gửi.
 * Free tier: 10,000 credits/tháng (1 credit / 1 article).
 */

import { debugLog } from '../../../core/logger/logger.js';
import { http } from '../../../shared/utils/httpClient.js';

const DIFFBOT_API_URL = 'https://api.diffbot.com/v3/article';
const DIFFBOT_TOKEN = process.env.DIFFBOT_TOKEN || '';

// ═══════════════════════════════════════════════════
// REQUEST PARAMS
// ═══════════════════════════════════════════════════

export interface DiffbotArticleParams {
  url: string;
  // Các field muốn include (mặc định trả tất cả). Dùng `fields` để tiết kiệm credits/transfer.
  fields?: string;
  // Timeout ms (mặc định 30000)
  timeout?: number;
}

// ═══════════════════════════════════════════════════
// RESPONSE SHAPE
// ═══════════════════════════════════════════════════

export interface DiffbotArticleImage {
  url: string;
  title?: string;
  height?: number;
  width?: number;
}

export interface DiffbotArticle {
  type: 'article';
  title?: string;
  text?: string; // plain text chính — quan trọng nhất cho AI
  html?: string;
  date?: string; // ISO 8601
  author?: string;
  images?: DiffbotArticleImage[];
  videos?: DiffbotArticleImage[];
  tags?: Array<{ label: string; score?: number }>;
  url: string;
  humanLanguage?: string;
  siteName?: string;
}

export interface DiffbotArticleResponse {
  objects: DiffbotArticle[];
  // Lỗi trả trong cùng response nếu có:
  // { error: "...", errorCode: ... }
  error?: string;
  errorCode?: number;
}

// ═══════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════

/**
 * Gọi Diffbot Article API để extract clean text từ URL.
 *
 * @throws nếu DIFFBOT_TOKEN chưa cấu hình
 * @throws với message gốc nếu API trả lỗi (401/429/...)
 */
export async function diffbotExtractArticle(
  params: DiffbotArticleParams,
): Promise<DiffbotArticle | null> {
  if (!DIFFBOT_TOKEN) {
    throw new Error('DIFFBOT_TOKEN chưa được cấu hình trong .env');
  }

  const queryParams: Record<string, string> = {
    token: DIFFBOT_TOKEN,
    url: params.url,
  };
  if (params.fields) queryParams.fields = params.fields;
  if (params.timeout) queryParams.timeout = String(params.timeout);

  const url = `${DIFFBOT_API_URL}?${new URLSearchParams(queryParams).toString()}`;

  debugLog('DIFFBOT', `Extract: "${params.url.substring(0, 80)}..."`);

  const response = await http
    .get(url, {
      headers: { Accept: 'application/json' },
      retry: { statusCodes: [429, 500, 502, 503, 504] },
    })
    .json<DiffbotArticleResponse>();

  if (response.error) {
    debugLog('DIFFBOT', `✗ Error: ${response.error} (${response.errorCode})`);
    throw new Error(`Diffbot: ${response.error} (code=${response.errorCode})`);
  }

  const article = response.objects?.[0] ?? null;
  if (!article) {
    debugLog('DIFFBOT', `✗ No article found for ${params.url}`);
    return null;
  }

  debugLog(
    'DIFFBOT',
    `✓ Got article "${article.title?.substring(0, 40)}..." ` +
      `(${article.text?.length ?? 0} chars)`,
  );

  return article;
}
