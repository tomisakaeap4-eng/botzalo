/**
 * You.com Search API Client
 * Docs: https://you.com/docs/api-reference/search/v1-search
 * Portal: https://you.com/platform
 *
 * Migration từ Tavily vì:
 * - Free tier: $100 credits ban đầu (lâu hết hơn Tavily 1k/tháng)
 * - Không cần thẻ tín dụng
 * - X-API-Key auth đơn giản
 *
 * Endpoint cũ `https://api.you.com/search` đã deprecated — chuyển sang
 * `https://ydc-index.io/v1/search` (auth: `X-API-Key` header).
 *
 * Response shape (v1): { results: { web: [...], news?: [...] }, metadata }
 * — chú ý khác hoàn toàn so với API cũ (`hits[]`).
 */

import { debugLog } from '../../../core/logger/logger.js';
import { http } from '../../../shared/utils/httpClient.js';

const YOU_API_URL = 'https://ydc-index.io/v1/search';
const YOU_API_KEY = process.env.YOU_API_KEY || '';

// ═══════════════════════════════════════════════════
// REQUEST PARAMS
// ═══════════════════════════════════════════════════

export interface YouSearchParams {
  query: string;
  count?: number; // 1-20, default 10
  country?: string; // ISO 3166-1 alpha-2, vd "VN"
  language?: string; // ISO 639-1, vd "vi"
  safeSearch?: 'on' | 'off';
  // Một số plan hỗ trợ AI summary — disable mặc định để tiết kiệm credits
  includeAnswer?: boolean;
}

// ═══════════════════════════════════════════════════
// RESPONSE SHAPE (v1 API)
// ═══════════════════════════════════════════════════

export interface YouSearchHit {
  url: string;
  title: string;
  description?: string;
  // ISO 8601 timestamp, vd: "2024-08-24T08:08:38"
  page_age?: string;
  // Nhiều snippet trích từ page (có thể rỗng)
  snippets?: string[];
}

export interface YouSearchResponse {
  results: {
    web: YouSearchHit[];
    news?: YouSearchHit[];
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention
  metadata?: {
    query?: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    search_uuid?: string;
    latency?: number;
  };
}

// ═══════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════

/**
 * Gọi You.com v1 search.
 * @throws nếu YOU_API_KEY chưa cấu hình
 * @throws với message gốc nếu API trả lỗi (401/429/...).
 */
export async function youSearch(
  params: YouSearchParams,
): Promise<YouSearchResponse> {
  if (!YOU_API_KEY) {
    throw new Error('YOU_API_KEY chưa được cấu hình trong .env');
  }

  const queryParams: Record<string, string> = {
    query: params.query,
    count: String(params.count ?? 10),
  };
  if (params.country) queryParams.country = params.country;
  if (params.language) queryParams.language = params.language;
  if (params.safeSearch) queryParams.safeSearch = params.safeSearch;
  if (params.includeAnswer) queryParams.include_answer = 'true';

  const url = `${YOU_API_URL}?${new URLSearchParams(queryParams).toString()}`;

  debugLog('YOU', `Searching: "${params.query}" (count=${queryParams.count})`);

  const response = await http
    .get(url, {
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'X-API-Key': YOU_API_KEY,
        Accept: 'application/json',
      },
      retry: { statusCodes: [429, 500, 502, 503, 504] },
    })
    .json<YouSearchResponse>();

  const webCount = response.results?.web?.length ?? 0;
  const newsCount = response.results?.news?.length ?? 0;
  debugLog('YOU', `✓ Got ${webCount} web hits, ${newsCount} news hits`);

  return response;
}
