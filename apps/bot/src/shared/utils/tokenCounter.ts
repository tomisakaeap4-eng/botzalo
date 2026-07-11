/**
 * Token Counter - Đếm token cho Gemini API
 */
import type {
  Content,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { debugLog, logError } from '../../core/logger/logger.js';
import { getGeminiModel } from '../../infrastructure/ai/providers/gemini/geminiConfig.js';
import { getAIService } from '../types/ai.types.js';

// MIME types mà Gemini API hỗ trợ cho countTokens
const SUPPORTED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'application/pdf', 'text/'];

/** Kiểm tra MIME type có được hỗ trợ không */
export function isSupportedMime(mime: string): boolean {
  return SUPPORTED_MIME_PREFIXES.some((p) => mime.startsWith(p.split('/')[0]));
}

/** Lọc bỏ các inline data có MIME type không được hỗ trợ */
export function filterUnsupportedMedia(contents: Content[]): Content[] {
  return contents.map((content) => ({
    ...content,
    parts:
      content.parts?.map((part) => {
        if ('inlineData' in part && part.inlineData) {
          const mimeType = part.inlineData.mimeType || '';
          if (!isSupportedMime(mimeType)) return { text: `[File: ${mimeType}]` };
        }
        return part;
      }) || [],
  }));
}

/**
 * Heuristic token estimate used both as a test-mode short-circuit AND as a
 * fallback when the live Gemini countTokens API rejects (e.g. quota / bad key).
 */
function estimateTokens(contents: Content[]): number {
  const text = contents
    .flatMap((c) => c.parts?.filter((p) => 'text' in p).map((p) => (p as any).text) || [])
    .join(' ');
  // Mỗi inlineData hoặc fileData (ảnh/video/audio/file URL) chiếm ~258 tokens
  // (Gemini's median tax mỗi file). Text ước tính 4 chars / token.
  const mediaCount = contents.reduce(
    (sum, c) =>
      sum +
      (c.parts?.filter((p) => {
        const part = p as any;
        return ('inlineData' in p && part.inlineData) || ('fileData' in p && part.fileData);
      }).length || 0),
    0,
  );
  return Math.ceil(text.length / 4) + mediaCount * 258 + contents.length * 100;
}

/** Đếm token của một content array */
export async function countTokens(contents: Content[]): Promise<number> {
  if (contents.length === 0) return 0;
  // Test-mode short-circuit: under bun:test without a real Gemini key,
  // skip the live API call and return the heuristic estimate directly so
  // history-store unit tests don't fail with INVALID_ARGUMENT 400 errors.
  if (Bun.env.NODE_ENV === 'test' || Bun.env.BUN_TEST === '1') {
    return estimateTokens(contents);
  }
  try {
    const ai = getAIService();
    const result = await ai.countTokens({
      model: getGeminiModel(),
      contents: filterUnsupportedMedia(contents),
    });
    return result.totalTokens || 0;
  } catch (error: any) {
    logError('countTokens', error);
    const estimated = estimateTokens(contents);
    debugLog('HISTORY', `Token fallback estimate: ${estimated}`);
    return estimated;
  }
}

/** Kết quả kiểm tra token đầu vào */
export interface TokenCheckResult {
  allowed: boolean;
  totalTokens: number;
  maxTokens: number;
  message?: string;
}

// ═══════════════════════════════════════════════════
// TOKEN USAGE DISPLAY — Lấy từ response.usageMetadata
// (Google Gemini SDK trả free, không cần gọi API riêng)
// ═══════════════════════════════════════════════════

/** Snapshot token usage từ response.usageMetadata (Google @google/genai v2.x) */
export interface TokenUsage {
  /** Input tokens (promptTokenCount) */
  prompt?: number;
  /** Output tokens (candidatesTokenCount) */
  output?: number;
  /** Thinking tokens (thoughtsTokenCount, Gemini 2.5/3) */
  thoughts?: number;
  /** Cached tokens (cachedContentTokenCount) */
  cached?: number;
  /** Total tokens (totalTokenCount) */
  total?: number;
}

/** Extract token usage từ `response.usageMetadata` của Gemini SDK (an toàn khi undefined).
 * Caller truyền `response.usageMetadata` (hoặc `chunk.usageMetadata` cho stream). */
export function extractTokenUsage(
  usage: GenerateContentResponseUsageMetadata | undefined | null,
): TokenUsage | null {
  if (!usage) return null;
  return {
    prompt: usage.promptTokenCount,
    output: usage.candidatesTokenCount,
    thoughts: usage.thoughtsTokenCount,
    cached: usage.cachedContentTokenCount,
    total: usage.totalTokenCount,
  };
}

/** Format số ngắn gọn: 1050 → "1.1k", 56700 → "57k", 2_500_000 → "2.5M" */
export function formatCompactNumber(n?: number): string {
  if (n == null) return '0';
  if (n < 0) return '0';
  if (n < 1000) return n.toString();
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Format usage thành chuỗi compact cho log:
 * "in=1.2k, out=567, thinking=234, total=2.0k" — skip thinking/cached nếu = 0 */
export function formatTokenUsage(usage: TokenUsage | null | undefined): string {
  if (!usage) return '';
  const parts: string[] = [
    `in=${formatCompactNumber(usage.prompt)}`,
    `out=${formatCompactNumber(usage.output)}`,
  ];
  if (usage.thoughts && usage.thoughts > 0) {
    parts.push(`thinking=${formatCompactNumber(usage.thoughts)}`);
  }
  if (usage.cached && usage.cached > 0) {
    parts.push(`cached=${formatCompactNumber(usage.cached)}`);
  }
  parts.push(`total=${formatCompactNumber(usage.total)}`);
  return parts.join(', ');
}

/** Log token usage ra console sau khi AI phản hồi xong (nếu usageMetadata có sẵn).
 * Format: `[Gemini] 📊 Thread <id> | in=X, out=Y, total=Z (model=name)` */
export function logTokenUsage(
  threadId: string,
  usage: TokenUsage | null | undefined,
  modelName?: string,
): void {
  // Skip log khi usageMetadata missing/total=0 (safety block, error response, empty response, test mock, ...)
  if (!usage || usage.total == null || usage.total === 0) {
    debugLog('TOKEN', `Thread ${threadId} | usage=N/A (total=${usage?.total ?? 'N/A'})`);
    return;
  }
  const modelSuffix = modelName ? ` (model=${modelName})` : '';
  console.log(`[Gemini] 📊 Thread ${threadId} | ${formatTokenUsage(usage)}${modelSuffix}`);
}

/**
 * Kiểm tra tổng token đầu vào (prompt + media) có vượt giới hạn không
 * KHÔNG bao gồm history - chỉ đếm input hiện tại
 * @param contents - Content array chứa prompt và media
 * @param maxTokens - Giới hạn token (mặc định 200000)
 * @returns TokenCheckResult với thông tin chi tiết
 */
export async function checkInputTokens(
  contents: Content[],
  maxTokens: number = 200000,
): Promise<TokenCheckResult> {
  try {
    const totalTokens = await countTokens(contents);

    debugLog('TOKEN', `Input tokens: ${totalTokens}/${maxTokens}`);

    if (totalTokens > maxTokens) {
      const overBy = totalTokens - maxTokens;
      return {
        allowed: false,
        totalTokens,
        maxTokens,
        message: `⚠️ Tin nhắn quá dài! Đã vượt giới hạn ${overBy.toLocaleString()} tokens (${totalTokens.toLocaleString()}/${maxTokens.toLocaleString()}). Hãy gửi tin nhắn/file ngắn hơn.`,
      };
    }

    return {
      allowed: true,
      totalTokens,
      maxTokens,
    };
  } catch (error: any) {
    logError('checkInputTokens', error);
    // Nếu lỗi khi đếm token, cho phép tiếp tục (fail-open)
    return {
      allowed: true,
      totalTokens: 0,
      maxTokens,
      message: 'Token check failed, proceeding anyway',
    };
  }
}
