/**
 * Tool: youSearch - Tìm kiếm web bằng You.com API
 * Thay thế cho Tavily. You.com có $100 free credits, không cần CC.
 *
 * Lưu ý: You.com không có image search tách riêng (chỉ /search + /news + /images).
 */

import { debugLog } from '../../../core/logger/logger.js';
import {
  YouSearchSchema,
  validateParamsWithExample,
} from '../../../shared/schemas/tools.schema.js';
import type { ToolDefinition, ToolResult } from '../../../shared/types/tools.types.js';
import { youSearch, type YouSearchHit } from '../services/youClient.js';

export const youSearchTool: ToolDefinition = {
  name: 'youSearch',
  description:
    'Tìm kiếm thông tin trên web bằng You.com ($100 free credits, không cần thẻ tín dụng). ' +
    'Trả về danh sách kết quả web (`items`) + news (`news`) gồm title, link, snippet, pageAge. ' +
    'Lưu ý: KHÔNG hỗ trợ tìm kiếm hình ảnh. ' +
    'Ưu tiên dùng khi user hỏi tin tức, sự kiện, thông tin mới, kiến thức chung.',
  parameters: [
    {
      name: 'q',
      type: 'string',
      description: 'Từ khóa tìm kiếm (hoặc dùng `query`)',
      required: true,
    },
    {
      name: 'count',
      type: 'number',
      description: 'Số kết quả trả về (1-20, mặc định 10)',
      required: false,
    },
    {
      name: 'country',
      type: 'string',
      description: 'Mã quốc gia ISO 3166-1 alpha-2 (vd: "VN", "US")',
      required: false,
    },
    {
      name: 'language',
      type: 'string',
      description: 'Mã ngôn ngữ ISO 639-1 (vd: "vi", "en")',
      required: false,
    },
    {
      name: 'safeSearch',
      type: 'string',
      description: 'Bật/tắt safe search: on | off',
      required: false,
    },
    {
      name: 'includeAnswer',
      type: 'boolean',
      description: 'Bật `include_answer=true` (chỉ áp dụng nếu plan hỗ trợ)',
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const validation = validateParamsWithExample(YouSearchSchema, params, 'youSearch');
    if (!validation.success) return { success: false, error: validation.error };
    const data = validation.data;

    try {
      const result = await youSearch({
        query: data.q,
        count: data.count,
        country: data.country,
        language: data.language,
        safeSearch: data.safeSearch,
        includeAnswer: data.includeAnswer,
      });

      // You.com v1: results.web[]. Gộp snippets[] thành 1 chuỗi để LLM dễ đọc.
      const mapHit = (h: YouSearchHit) => ({
        title: h.title,
        link: h.url,
        snippet: (h.snippets ?? []).join('\n\n…\n\n'),
        description: h.description ?? null,
        pageAge: h.page_age ?? null,
      });

      const items = (result.results?.web ?? []).map(mapHit);
      // News (optional) — tách riêng để caller biết tổng số web / news
      const news = (result.results?.news ?? []).map(mapHit);

      debugLog('YOU', `Found ${items.length} web + ${news.length} news for "${data.q}"`);

      return {
        success: true,
        data: {
          query: data.q,
          items,
          news,
          webCount: items.length,
          newsCount: news.length,
          itemCount: items.length + news.length,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Lỗi You.com Search: ${error.message}` };
    }
  },
};
