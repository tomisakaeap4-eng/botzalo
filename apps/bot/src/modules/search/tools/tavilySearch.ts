/**
 * Tool: tavilySearch - Tìm kiếm web bằng Tavily Search API
 * Thay thế cho Google Custom Search (đã đóng cửa cho khách hàng mới).
 *
 * Đặc biệt: trả về `answer` - LLM-synthesized answer từ Tavily - để AI
 * có ngay câu trả lời tóm tắt mà không cần đọc từng kết quả.
 */

import { debugLog } from '../../../core/logger/logger.js';
import {
  TavilySearchSchema,
  validateParamsWithExample,
} from '../../../shared/schemas/tools.schema.js';
import type { ToolDefinition, ToolResult } from '../../../shared/types/tools.types.js';
import { tavilySearch } from '../services/tavilyClient.js';

export const tavilySearchTool: ToolDefinition = {
  name: 'tavilySearch',
  description:
    'Tìm kiếm thông tin trên web bằng Tavily (1000 queries/tháng free). ' +
    'Trả về CÂU TRẢ LỜI TÓM TẮT (answer) cùng danh sách link chi tiết. ' +
    'Lưu ý: KHÔNG hỗ trợ tìm kiếm hình ảnh — dùng tool `imagen` để tạo ảnh AI. ' +
    'Ưu tiên dùng khi user hỏi tin tức, sự kiện, thông tin mới, kiến thức chung.',
  parameters: [
    {
      name: 'q',
      type: 'string',
      description: 'Từ khóa tìm kiếm (hoặc dùng `query`)',
      required: true,
    },
    {
      name: 'maxResults',
      type: 'number',
      description: 'Số kết quả trả về (1-20, mặc định 5)',
      required: false,
    },
    {
      name: 'topic',
      type: 'string',
      description: 'general | news (mặc định general)',
      required: false,
    },
    {
      name: 'searchDepth',
      type: 'string',
      description: 'basic | advanced (mặc định basic)',
      required: false,
    },
    {
      name: 'includeDomains',
      type: 'object',
      description: 'Mảng domain ưu tiên (vd: ["github.com","stackoverflow.com"])',
      required: false,
    },
    {
      name: 'excludeDomains',
      type: 'object',
      description: 'Mảng domain loại bỏ (vd: ["pinterest.com"])',
      required: false,
    },
    {
      name: 'includeAnswer',
      type: 'boolean',
      description: 'Trả LLM-synthesized answer (mặc định true; đặt false để chỉ lấy raw results)',
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const validation = validateParamsWithExample(TavilySearchSchema, params, 'tavilySearch');
    if (!validation.success) return { success: false, error: validation.error };
    const data = validation.data;

    try {
      const result = await tavilySearch({
        query: data.q,
        maxResults: data.maxResults,
        topic: data.topic,
        searchDepth: data.searchDepth,
        includeDomains: data.includeDomains,
        excludeDomains: data.excludeDomains,
        includeAnswer: data.includeAnswer,
      });

      // Map response → format gọn cho AI đọc
      const items = result.results.map((r) => ({
        title: r.title,
        link: r.url,
        snippet: r.content,
        score: r.score,
      }));

      debugLog('TAVILY', `Found ${items.length} results for "${data.q}"`);

      return {
        success: true,
        data: {
          query: data.q,
          answer: result.answer || null, // LLM-synthesized answer (nếu có)
          followUpQuestions: result.followUpQuestions || null,
          items,
          itemCount: items.length,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Lỗi Tavily Search: ${error.message}` };
    }
  },
};
