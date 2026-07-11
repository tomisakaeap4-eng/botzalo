/**
 * Tool: youSearch - Tìm kiếm web bằng You.com API
 * Thay thế cho Tavily. You.com có $100 free credits, không cần CC.
 *
 * Lưu ý: You.com không có image search tách riêng (chỉ /search + /news + /images)
 * — dùng tool `imagen` để tạo ảnh AI khi cần.
 */

import { debugLog } from '../../../core/logger/logger.js';
import {
  YouSearchSchema,
  validateParamsWithExample,
} from '../../../shared/schemas/tools.schema.js';
import type { ToolDefinition, ToolResult } from '../../../shared/types/tools.types.js';
import { youSearch } from '../services/youClient.js';

export const youSearchTool: ToolDefinition = {
  name: 'youSearch',
  description:
    'Tìm kiếm thông tin trên web bằng You.com ($100 free credits, không cần thẻ tín dụng). ' +
    'Trả về danh sách kết quả (title, url, snippet) cùng AI answer (nếu có). ' +
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
      description: 'Yêu cầu AI answer tổng hợp (tốn thêm credits)',
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

      const items = (result.hits ?? []).map((h) => ({
        title: h.name,
        link: h.url,
        snippet: h.snippet,
        description: h.description ?? null,
        age: h.age ?? null,
      }));

      debugLog('YOU', `Found ${items.length} results for "${data.q}"`);

      return {
        success: true,
        data: {
          query: data.q,
          answer: result.answer || null,
          items,
          itemCount: items.length,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Lỗi You.com Search: ${error.message}` };
    }
  },
};
