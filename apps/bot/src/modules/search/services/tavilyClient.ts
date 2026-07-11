/**
 * Tavily Search API Client
 * Docs: https://docs.tavily.com/
 *
 * Note: Google Custom Search JSON API đã đóng cửa cho khách hàng mới
 * (đến 01/01/2027). Chuyển sang Tavily: 1000 requests/tháng free tier,
 * trả về LLM-synthesized answer + clean snippets tối ưu cho AI agent.
 */

import { debugLog } from '../../../core/logger/logger.js';
import { http } from '../../../shared/utils/httpClient.js';

const TAVILY_API_URL = 'https://api.tavily.com/search';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

// ═══════════════════════════════════════════════════
// REQUEST PARAMS
// ═══════════════════════════════════════════════════

export interface TavilySearchParams {
  query: string;
  maxResults?: number; // 1-20, default 5
  searchDepth?: 'basic' | 'advanced'; // default 'basic'
  topic?: 'general' | 'news'; // default 'general'
  includeAnswer?: boolean; // default true - trả LLM-synthesized answer
  includeRawContent?: boolean; // default false
  includeDomains?: string[];
  excludeDomains?: string[];
}

// ═══════════════════════════════════════════════════
// RESPONSE SHAPE
// ═══════════════════════════════════════════════════

export interface TavilySearchResultItem {
  title: string;
  url: string;
  content: string;
  score: number;
  rawContent?: string;
}

export interface TavilySearchResponse {
  query: string;
  followUpQuestions?: string[] | null;
  answer?: string | null;
  results: TavilySearchResultItem[];
}

// ═══════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════

/**
 * Call Tavily /search endpoint.
 *
 * @throws nếu TAVILY_API_KEY chưa cấu hình.
 * @throws với message gốc từ Tavily nếu API trả lỗi (401/429/...).
 */
export async function tavilySearch(
  params: TavilySearchParams,
): Promise<TavilySearchResponse> {
  if (!TAVILY_API_KEY) {
    throw new Error('TAVILY_API_KEY chưa được cấu hình trong .env');
  }

  const body = {
    query: params.query,
    max_results: params.maxResults ?? 5,
    search_depth: params.searchDepth ?? 'basic',
    topic: params.topic ?? 'general',
    include_answer: params.includeAnswer ?? true,
    include_raw_content: params.includeRawContent ?? false,
    ...(params.includeDomains?.length
      ? { include_domains: params.includeDomains }
      : {}),
    ...(params.excludeDomains?.length
      ? { exclude_domains: params.excludeDomains }
      : {}),
  };

  debugLog('TAVILY', `Searching: "${params.query}" (max=${body.max_results}, depth=${body.search_depth})`);

  const response = await http
    .post(TAVILY_API_URL, {
      headers: {
        'x-api-key': TAVILY_API_KEY,
        'Content-Type': 'application/json',
      },
      json: body,
      // Tavily không có image search; tránh retry cho 4xx (lỗi cú pháp/key)
      retry: { statusCodes: [429, 500, 502, 503, 504] },
    })
    .json<TavilySearchResponse>();

  debugLog('TAVILY', `✓ Got ${response.results?.length ?? 0} results, answer=${response.answer ? 'yes' : 'no'}`);

  return response;
}
