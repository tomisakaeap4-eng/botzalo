/**
 * Tool: readUrl - Đọc nội dung từ URL bằng Diffbot Article API
 * Thay thế cho Gemini URL Context (đắt + không giới hạn được độ dài).
 *
 * ⚠️ Text bị cắt ở settings.readUrl.maxTextChars (mặc định 8000 chars ≈ 2k tokens)
 * để tránh Gemini context overflow với Wikipedia/StackOverflow (~50k+ chars).
 * Cắt tại paragraph boundary (\\n\\n) cuối — AI không nhận câu lửng.
 *
 * Free tier: 10,000 credits/tháng Diffbot (1 credit/article).
 */

import { CONFIG } from '../../../core/config/config.js';
import { debugLog } from '../../../core/logger/logger.js';
import {
  ReadUrlSchema,
  validateParamsWithExample,
} from '../../../shared/schemas/tools.schema.js';
import type { ToolDefinition, ToolResult } from '../../../shared/types/tools.types.js';
import { diffbotExtractArticle } from '../services/diffbotClient.js';

/**
 * Truncate text tại paragraph boundary (\\n\\n) gần nhất TRƯỚC maxChars.
 * Fallback về substring nếu không tìm được paragraph break.
 */
function truncateAtParagraph(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }

  const slice = text.slice(0, maxChars);
  // Tìm paragraph break (\\n\\n) cuối cùng trong slice
  const lastBreak = slice.lastIndexOf('\n\n');
  if (lastBreak > maxChars * 0.5) {
    // Chỉ cắt tại paragraph nếu nó ở > 50% maxChars (tránh cắt quá sớm)
    return { text: slice.slice(0, lastBreak), truncated: true };
  }
  // Fallback: cắt tại sentence boundary (dấu chấm + space) gần nhất
  const lastSentence = slice.lastIndexOf('. ');
  if (lastSentence > maxChars * 0.7) {
    return { text: slice.slice(0, lastSentence + 1), truncated: true };
  }
  // Cuối cùng: cứng cắt ở maxChars
  return { text: slice, truncated: true };
}

export const readUrlTool: ToolDefinition = {
  name: 'readUrl',
  description:
    'Đọc nội dung một URL bất kỳ (article, blog, docs...) và trả về clean text. ' +
    'Dùng khi user gửi link và muốn biết nội dung bên trong. ' +
    '⚠️ Text bị cắt ở maxTextChars (mặc định 8000 chars) tại paragraph boundary — ' +
    'đủ cho AI đọc mà không overflow Gemini context window. ' +
    'Free tier: 10,000 credits/tháng Diffbot.',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'URL đầy đủ cần đọc (vd: https://example.com/article)',
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const validation = validateParamsWithExample(ReadUrlSchema, params, 'readUrl');
    if (!validation.success) return { success: false, error: validation.error };
    const { url } = validation.data;

    const maxTextChars = CONFIG.readUrl?.maxTextChars ?? 8000;

    try {
      const article = await diffbotExtractArticle({
        url,
        fields: 'title,text,author,date,siteName,humanLanguage',
      });

      if (!article) {
        return {
          success: false,
          error:
            'Không trích xuất được nội dung từ URL này (Diffbot không nhận diện được article).',
        };
      }

      const rawText = article.text ?? '';
      const { text, truncated } = truncateAtParagraph(rawText, maxTextChars);

      debugLog(
        'DIFFBOT',
        `readUrl ok: "${article.title?.substring(0, 40) ?? '(no title)'}" ` +
          `(${rawText.length} chars${truncated ? ` → truncated to ${text.length}` : ''})`,
      );

      return {
        success: true,
        data: {
          url,
          title: article.title || null,
          author: article.author || null,
          date: article.date || null,
          siteName: article.siteName || null,
          language: article.humanLanguage || null,
          text,
          charCount: text.length,
          totalChars: rawText.length,
          truncated,
          hint: truncated
            ? `⚠️ Nội dung bị cắt ở ${text.length}/${rawText.length} chars (maxTextChars=${maxTextChars}). Tóm tắt thông tin user cần.`
            : 'Trích tóm tắt hoặc trả lời user dựa trên nội dung text ở trên.',
        },
      };
    } catch (error: any) {
      return { success: false, error: `Lỗi Diffbot readUrl: ${error.message}` };
    }
  },
};
