/**
 * You.com Search API Client
 * Docs: https://api.you.com/
 *
 * Migration từ Tavily vì:
 * - Free tier: $100 credits ban đầu (lâu hết hơn Tavily 1k/tháng)
 * - Không cần thẻ tín dụng
 * - Bearer auth đơn giản
 *
 * Lưu ý: response shape dựa trên best-effort docs — verify lại với portal
 * chính thức của You.com.
 */

import { debugLog } from '../../../core/logger/logger.js';
import { http } from '../../../shared/utils/httpClient.js';

const YOU_API_URL = 'https://api.you.com/search';
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
  // AI answer tổng hợp (chỉ có ở một số plan)
  includeAnswer?: boolean;
}

// ═══════════════════════════════════════════════════
// RESPONSE SHAPE
// ═══════════════════════════════════════════════════

export interface YouSearchHit {
  url: string;
  name: string; // title
  snippet: string;
  description?: string;
  age?: string; // tuổi của kết quả, vd: "2 hours ago"
}

export interface YouSearchResponse {
  hits: YouSearchHit[];
  // Một số endpoint You.com còn thêm:
  answer?: string | null; // LLM answer nếu có
  // eslint-disable-next-line @typescript-eslint/naming-convention
  $meta?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════

/**
 * Gọi You.com /search.
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
        Authorization: `Bearer ${YOU_API_KEY}`,
        Accept: 'application/json',
      },
      retry: { statusCodes: [429, 500, 502, 503, 504] },
    })
    .json<YouSearchResponse>();

  debugLog(
    'YOU',
    `✓ Got ${response.hits?.length ?? 0} hits` +
      (response.answer ? ' (with AI answer)' : ''),
  );

  return response;
}
