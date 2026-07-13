/**
 * Handoff Generator - Tạo tài liệu handoff khi history vượt max context
 *
 * Khi max context reached, gửi cho AI skills `handoff` (apps/bot/skills/handoff.md)
 * cùng transcript hội thoại. AI phản hồi → lấy response làm `[HIDDEN_HANDOFF]`
 * content gán làm tin nhắn đầu tiên ẩn trong history, để AI kế tiếp tiếp tục hỗ trợ user.
 *
 * Module này tách riêng khỏi historyStore để tránh circular dependency:
 * - historyStore → geminiChat (deleteChatSession)
 * - handoffGenerator → geminiConfig (getAI, getGeminiModel, GEMINI_CONFIG, keyManager)
 * - geminiChat / geminiConfig KHÔNG import historyStore → an toàn
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Content } from '@google/genai';
import { CONFIG } from '../../../core/config/config.js';
import { debugLog, logError } from '../../../core/logger/logger.js';
import {
  GEMINI_CONFIG,
  getAI,
  getGeminiModel,
  keyManager,
} from '../../../infrastructure/ai/providers/gemini/geminiConfig.js';

/** Marker đứng đầu tin nhắn user ẩn để AI kế tiếp hiểu đó là memo nội bộ.
 * Phantom `model` ack dùng cùng prefix family (suffix `_ACK`) nên `startsWith(PREFIX)`
 * detection vẫn hoạt động cho cả hai: handoff doc (user role) và phantom ack (model role).
 *
 * Lý do cần phantom `model` ack: Gemini SDK 2.x yêu cầu chat history **alternating**
 * giữa `user`/`model`. Sau khi compact, history chỉ có `[user: handoff]`. Khi user
 * gửi tin tiếp theo, `sendMessage` sẽ append thêm 1 `user` turn → `[user, user]`
 * → SDK reject với `400 Invalid argument` (cf. https://ai.google.dev/gemini-api/docs/chat).
 * Phantom ac k bookkeep role alternation → structure `[user, model, user, model]` hợp lệ.
 */
export const HIDDEN_HANDOFF_PREFIX = '[HIDDEN_HANDOFF]';
export const HIDDEN_HANDOFF_ACK_PREFIX = '[HIDDEN_HANDOFF]_ACK';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// apps/bot/src/shared/utils/history/handoffGenerator.ts → apps/bot/skills/handoff.md (4 levels up)
const DEFAULT_SKILL_PATH = resolve(__dirname, '../../../../skills/handoff.md');

let cachedSkillBody: string | null = null;

/**
 * Strip YAML frontmatter (nếu có) để lấy nội dung "instruction" của skill.
 * Hỗ trợ 2 format:
 *   ---\nkey: val\n---\n<body>
 *   ← không có frontmatter → trả nguyên
 */
function stripFrontmatter(raw: string): string {
  const match = raw.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
  return (match ? match[1] : raw).trim();
}

/** Load (và cache) nội dung skill handoff từ file */
export async function loadHandoffSkill(): Promise<string> {
  if (cachedSkillBody !== null) return cachedSkillBody;
  const configured = CONFIG.history?.handoff?.skillFile;
  // Config path là relative-to-cwd; default là relative-to-this-module
  const filePath = configured ? resolve(process.cwd(), configured) : DEFAULT_SKILL_PATH;
  try {
    const raw = await readFile(filePath, 'utf-8');
    cachedSkillBody = stripFrontmatter(raw);
    debugLog(
      'HISTORY',
      `[Handoff] Loaded skill (${cachedSkillBody.length} chars) from ${filePath}`,
    );
    return cachedSkillBody;
  } catch (err) {
    logError('[Handoff] loadSkill', err);
    // Fallback: dùng instructions gốc trong code để bot vẫn chạy khi thiếu file
    cachedSkillBody = FALLBACK_HANDOFF_INSTRUCTION;
    debugLog('HISTORY', `[Handoff] Using fallback skill (file missing: ${filePath})`);
    return cachedSkillBody;
  }
}

/** Test-only: xoá cache skill để test có thể force re-load */
export function resetHandoffSkillCacheForTesting(): void {
  cachedSkillBody = null;
}

/** Test-only: xoá stub override cho handoff AI doc */
export function resetHandoffDocStubForTesting(): void {
  handoffDocStub = null;
}

/** Reset toàn bộ state test (skill cache + stub) — gọi trước mỗi test case */
export function resetHandoffStateForTesting(): void {
  cachedSkillBody = null;
  handoffDocStub = null;
}

/** Fallback inline khi file skill không load được (vd: trong prod build khác cwd) */
const FALLBACK_HANDOFF_INSTRUCTION = `Write a handoff document summarizing the current conversation so a fresh AI agent can continue helping the user. Cover: (1) user's main goal, (2) agreed decisions and outputs, (3) pending actions or open questions, (4) persona/context facts the next agent needs. Be concise and structured; the next agent cannot see the prior transcript.`;

// ═══════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════

/**
 * Convert Content[] thành transcript dạng text dễ đọc để gửi cho AI handoff.
 * - Bỏ qua các tin [HIDDEN_HANDOFF] cũ (tránh meta-recursion)
 * - Media parts → placeholder "[Media: <mime>]"
 * - Mỗi content → "User: ..." hoặc "AI: ..."
 */
export function formatHistoryForAI(history: Content[]): string {
  if (!history?.length) return '';
  const lines: string[] = [];
  for (const c of history) {
    if (!c?.parts?.length) continue;
    const text = c.parts
      .map((p) => {
        if (!p) return '';
        if ('text' in p && typeof (p as any).text === 'string') return (p as any).text;
        if ('inlineData' in p) {
          const mime = (p as any).inlineData?.mimeType ?? 'unknown';
          return `[Media: ${mime}]`;
        }
        if ('fileData' in p) {
          const uri = (p as any).fileData?.fileUri ?? 'file';
          return `[Media: file ${uri}]`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
    if (!text) continue;
    if (text.startsWith(HIDDEN_HANDOFF_PREFIX)) continue; // skip prior handoff docs
    const speaker = c.role === 'model' ? 'AI' : 'User';
    lines.push(`${speaker}: ${text}`);
  }
  return lines.join('\n\n');
}

/** Build prefix note (để AI biết đây là tóm tắt context).
 * KHÔNG giới hạn token output — để AI phản hồi đầy đủ. Skill body yêu cầu AI viết
 * đủ 4 sections, nếu user có history cực dài thì truncate xuống còn ~3000 words nếu cần. */
function buildHandoffHeader(): string {
  return `[Mô tả: Tóm tắt tự động cuộc hội thoại trước để AI tiếp tục hỗ trợ. KHÔNG lưu file - system sẽ capture response thẳng vào history làm tin nhắn đầu tiên ẩn.]\n\nHãy output một handoff document đầy đủ, có cấu trúc rõ ràng theo các sections: User Goal / Decisions Made / Pending Actions / Key Context. Đừng cắt ngắn — cần đủ để AI kế tiếp tiếp tục hỗ trợ user mà không mất context.\n\n`;
}

/** Build Content user-role object đại diện cho tin nhắn ẩn đầu tiên trong history.
 * NOTE: đặt ở role='user' (không phải system) vì Gemini SDK history chỉ nhận user/model.
 * Header có chỉ dẫn rõ ràng "DO NOT reply" để AI không "trả lời" bản tóm tắt mà chỉ
 * hấp thụ làm context cho next real user message. */
export function buildHiddenHandoffContent(doc: string): Content {
  return {
    role: 'user',
    parts: [
      {
        text:
          `${HIDDEN_HANDOFF_PREFIX}\n` +
          `[INTERNAL CONTEXT — DO NOT reply to this message. This is compressed background ` +
          `memory from prior turns. Absorb it silently, then wait for the next real user ` +
          `message and respond only to that.]\n\n` +
          doc.trim(),
      },
    ],
  };
}

/** Build Content model-role với dummy acknowledgment để preserve Gemini SDK role
 * alternation. Text starts with `[HIDDEN_HANDOFF]_ACK` (chia sẻ prefix family với
 * handoff doc) để `isHiddenHandoffContent` + `formatHistoryForAI` đều match bằng cùng
 * `startsWith('[HIDDEN_HANDOFF]')` check. Phantom ack KHÔNG đại diện cho AI thật trả
 * lời — chỉ là structural placeholder, không bao giờ gửi đến user Zalo. */
export function buildHiddenHandoffAck(): Content {
  return {
    role: 'model',
    parts: [
      {
        text: `${HIDDEN_HANDOFF_ACK_PREFIX}\nOK context absorbed, ready for next user message`,
      },
    ],
  };
}

/** Check Content có phải hidden handoff không. Dùng bởi:
 * - `formatHistoryForAI` (skip khi build transcript cho AI handoff)
 * - `history.api.ts` (annotate `isHidden: true` cho frontend render)
 * Match cả 2 loại: user-role handoff doc (`[HIDDEN_HANDOFF]...`) và model-role phantom ack
 * (`[HIDDEN_HANDOFF]_ACK...`) vì cả hai chia sẻ prefix `[HIDDEN_HANDOFF]`.
 */
export function isHiddenHandoffContent(content: Content | undefined | null): boolean {
  if (!content?.parts?.length) return false;
  const text = content.parts.find((p) => 'text' in p)?.text;
  return typeof text === 'string' && text.startsWith(HIDDEN_HANDOFF_PREFIX);
}

// ═══════════════════════════════════════════════════
// HANDOFF AI CALL
// ═══════════════════════════════════════════════════

/** Test-only stub: nếu set, generateHandoffDoc sẽ gọi stub này thay vì gọi Gemini thật */
let handoffDocStub: ((transcript: string) => Promise<string>) | null = null;

/** Test-only: inject stub cho handoff AI. Truyền null để reset. */
export function setHandoffDocStubForTesting(
  stub: ((transcript: string) => Promise<string>) | null,
): void {
  handoffDocStub = stub;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Gọi Gemini trực tiếp (non-streaming, không dùng chat session, không persona Zia) để tạo doc.
 * - systemInstruction = skill content (đóng vai "handoff writer agent")
 * - contents = 1 user message chứa header + transcript
 *
 * Trả về: raw text response (đã trim), hoặc '' nếu fail sau hết retries.
 *
 * Lưu ý quan trọng:
 * - Bỏ qua COMPLETELY nếu transcript rỗng → không gọi AI lãng phí
 * - Test mode (Bun.env.NODE_ENV === 'test') → bỏ qua gọi AI thật, trả về ''
 * - Retry tối đa maxRetries lần với exponential backoff; nếu gặp 429 thì rotate key
 */
export async function generateHandoffDoc(
  history: Content[],
  opts?: { maxRetries?: number; baseDelayMs?: number },
): Promise<string> {
  // Test-mode short-circuit: giống countTokens
  if (Bun.env.NODE_ENV === 'test' || Bun.env.BUN_TEST === '1') {
    debugLog('HISTORY', '[Handoff] test mode → skip real AI call');
    return handoffDocStub ? handoffDocStub(formatHistoryForAI(history)) : '';
  }

  // Cho phép stub override (test hoặc admin emergency)
  if (handoffDocStub) {
    return handoffDocStub(formatHistoryForAI(history));
  }

  const transcript = formatHistoryForAI(history);
  if (!transcript) {
    debugLog('HISTORY', '[Handoff] empty transcript → skip AI call');
    return '';
  }

  const skillBody = await loadHandoffSkill();
  const maxRetries = opts?.maxRetries ?? CONFIG.history?.handoff?.maxRetries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? CONFIG.history?.handoff?.baseDelayMs ?? 1500;
  const prompt = buildHandoffHeader() + transcript;

  const ai = getAI();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          ...GEMINI_CONFIG,
          // Override: thấp cho deterministic summary
          temperature: 0.3,
          // Skill content làm system instruction → AI đóng vai "handoff writer"
          systemInstruction: skillBody,
          // KHÔNG override maxOutputTokens — để AI viết đầy đủ handoff doc, không bị cắt.
        },
      });
      const txt = (response?.text ?? '').trim();
      if (txt) {
        debugLog(
          'HISTORY',
          `[Handoff] Generated doc: ${txt.length} chars (attempt ${attempt + 1})`,
        );
        return txt;
      }
      debugLog('HISTORY', `[Handoff] Empty response on attempt ${attempt + 1}`);
    } catch (error: any) {
      logError('[Handoff] generateHandoffDoc', error);
      const status = error?.status || error?.code;
      // Rotate key nếu 429 → retry immediately
      if (status === 429 && keyManager.handleRateLimitError()) {
        debugLog('HISTORY', '[Handoff] rotated key due to 429, retrying immediately');
        continue;
      }
      if (attempt < maxRetries) {
        const delay = baseDelayMs * 2 ** attempt;
        debugLog(
          'HISTORY',
          `[Handoff] retry ${attempt + 1}/${maxRetries} after ${delay}ms (status=${status})`,
        );
        await sleep(delay);
      }
    }
  }
  debugLog('HISTORY', '[Handoff] FAILED after all retries');
  return '';
}
