/**
 * History Store - Lưu trữ và quản lý history
 * Hybrid: In-memory cache + SQLite persistence
 */
import type {
  Content,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { CONFIG } from '../../../core/config/config.js';
import { debugLog } from '../../../core/logger/logger.js';
import { deleteChatSession } from '../../../infrastructure/ai/providers/gemini/geminiChat.js';
import { historyRepository } from '../../../infrastructure/database/index.js';
import { countTokens } from '../tokenCounter.js';
import { toGeminiContent } from './historyConverter.js';
import { fetchFullHistory, getPaginationConfig, loadOldMessages } from './historyLoader.js';
import {
  buildHiddenHandoffAck,
  buildHiddenHandoffContent,
  generateHandoffDoc,
  HIDDEN_HANDOFF_PREFIX,
} from './handoffGenerator.js';

// In-memory cache (primary storage for fast access)
const messageHistory = new Map<string, Content[]>();
const rawMessageHistory = new Map<string, any[]>();
const tokenCache = new Map<string, number>();
/** Timestamp (ms) của lần cuối setTokenCache → trimHistoryByTokens chỉ dùng cache khi còn fresh (<10s) */
const cacheTimestamp = new Map<string, number>();
const initializedThreads = new Set<string>();
const preloadedMessages = new Map<string, any[]>();
/** Thread đang trong quá trình gọi AI handoff — chặn re-entry khi 2 tin nhắn cùng trigger */
const compactingThreads = new Set<string>();
let isPreloaded = false;

/** Min history length để handoff có ý nghĩa — nếu ít hơn, return false (không compact). */
const HANDOFF_MIN_HISTORY_LENGTH = 4;

/** Coi cache là fresh nếu được set trong vòng 10s — tránh stale sau nhiều turn */
const CACHE_FRESH_MS = 10_000;

/** Update cache từ response.usageMetadata.totalTokenCount — chính xác hơn countTokens API */
export function setTokenCache(threadId: string, totalTokens: number): void {
  if (totalTokens <= 0) return;
  tokenCache.set(threadId, totalTokens);
  cacheTimestamp.set(threadId, Date.now());
  // Opportunistic cleanup: evict timestamps cũ (>1h) của threads khác → tránh leak
  const cutoff = Date.now() - 3_600_000;
  for (const [id, ts] of cacheTimestamp) {
    if (id !== threadId && ts < cutoff) cacheTimestamp.delete(id);
  }
  debugLog('HISTORY', `setTokenCache: thread=${threadId}, total=${totalTokens}`);
}

/** Đánh dấu cache stale — gọi sau khi save (history đã thay đổi, cache không còn đúng) */
function invalidateTokenCache(threadId: string): void {
  cacheTimestamp.set(threadId, 0);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

/**
 * Strip media data từ content parts để lưu DB nhẹ hơn
 * Thay base64 bằng placeholder, giữ nguyên text
 */
function stripMediaForDb(parts: Content['parts']): Content['parts'] {
  if (!parts) return [];
  return parts.map((part) => {
    if ('inlineData' in part && part.inlineData) {
      // Thay base64 data bằng placeholder
      return { text: '[Media đã hết hạn - chỉ có trong session hiện tại]' };
    }
    return part;
  });
}

/**
 * Persist message to database (async, non-blocking)
 * Media được strip để giảm size DB
 */
async function persistToDb(
  threadId: string,
  role: 'user' | 'model',
  content: Content,
): Promise<void> {
  try {
    // Strip media trước khi lưu DB
    const strippedParts = stripMediaForDb(content.parts);
    const serialized = JSON.stringify(strippedParts);
    await historyRepository.addMessage(threadId, role, serialized);
  } catch (err) {
    debugLog('HISTORY', `DB persist error: ${err}`);
  }
}

/**
 * `trimHistoryByTokens` là safety net CHỈ cho runaway memory growth (>2x max tokens).
 * KHÔNG gọi AI handoff ở đây. Handoff chỉ được trigger EXPLICITLY từ caller
 * (message.processor.ts) sau khi AI trả lời xong top-level turn (depth=0).
 *
 * Lý do tách: nếu để handoff nằm trong save flow, nó có thể fire:
 *   - TRƯỚC khi AI phản hồi (group no-mention, prefix wrong)
 *   - GIỮA tool loop (depth > 0 hoặc saveResponseToHistory mid-loop)
 * Điều này vi phạm semantic continuity — handoff chỉ có ý nghĩa khi AI đã
 * "thấy" history trước đó và trả lời xong một turn hoàn chỉnh.
 *
 * Caller chịu trách nhiệm gọi `compactHistoryWithHandoff` đúng thời điểm.
 */
async function trimHistoryByTokens(threadId: string): Promise<void> {
  const history = messageHistory.get(threadId) || [];
  if (history.length === 0) return;

  const maxTokens = CONFIG.maxTokenHistory;
  const cachedTotal = tokenCache.get(threadId);
  const cacheTs = cacheTimestamp.get(threadId) ?? 0;
  const cacheFresh = cachedTotal != null && Date.now() - cacheTs < CACHE_FRESH_MS;

  // Đo token (ưu tiên cache nếu fresh). KHÔNG gọi handoff ở đây.
  let currentTokens: number;
  const emergencyThreshold = maxTokens * 2;
  if (cacheFresh && cachedTotal != null && cachedTotal <= emergencyThreshold) {
    currentTokens = cachedTotal;
  } else {
    currentTokens = await countTokens(history);
    tokenCache.set(threadId, currentTokens);
    cacheTimestamp.set(threadId, Date.now());
  }

  // Emergency safety net chỉ khi vượt 2x max — chỉ soft-trim, không compact.
  // (Compact được caller trigger riêng sau khi AI turn hoàn tất.)
  if (currentTokens > emergencyThreshold) {
    console.warn(
      `[History] ⚠️ Emergency shift-trim: ${currentTokens} > ${emergencyThreshold} (2x max) for ${threadId} — handoff should be triggered at end of next deep-0 turn`,
    );
    debugLog(
      'HISTORY',
      `trim: emergency shift-trim ${currentTokens} > ${emergencyThreshold} for ${threadId}`,
    );
    await fallbackShiftTrim(threadId, history, maxTokens);
  }
}
/**
 * Khi history vượt max tokens → gọi AI với skills/handoff.md để tóm tắt cuộc hội thoại.
 * AI response → wrap thành Content `[HIDDEN_HANDOFF]` (role=user) và REPLACE toàn bộ history.
 *
 * **DO NOT CALL từ save flow** (saveToHistory / saveResponseToHistory / saveToolResultToHistory) —
 * chỉ được gọi **EXPLICITLY** từ message.processor.ts sau khi AI trả lời xong top-level
 * user turn (depth=0). Lý do: nếu fire trong save flow, có thể trigger trước khi AI phản
 * hồi (group no-mention, prefix wrong) hoặc GIỮA tool loop, vi phạm semantic continuity.
 *
 * Behavior khi được gọi đúng:
 * - Over max → gọi handoff AI; success → history [user-role hidden doc] DUY NHẤT + replace DB + delete chat session
 * - Fail sau retry → KHÔNG đụng history; lần user gửi tin tiếp theo caller retry
 * - Handoff doc mà vẫn over max → rolling summary (transcript strip handoff cũ)
 * - Concurrent calls → atomic lock (acquire trước await đầu tiên)
 *
 * Returns true nếu compact thành công, false nếu skip/fail.
 */
export async function compactHistoryWithHandoff(threadId: string): Promise<boolean> {
  // Lock acquire TRƯỚC MỌI await — atomic với JS single-threaded model.
  // Vì length/fast-path cần await (countTokens), không thể check-then-add rồi mới await ở giữa;
  // nếu làm vậy 2 call concurrent sẽ cùng pass lock rồi cùng gọi AI.
  if (compactingThreads.has(threadId)) {
    debugLog('HISTORY', `compactHistory: already compacting ${threadId}, skip`);
    return false;
  }
  const history = messageHistory.get(threadId) || [];
  if (history.length === 0) return false;

  const maxTokens = CONFIG.maxTokenHistory;
  const handoffEnabled = CONFIG.history?.handoff?.enabled !== false;

  // Re-check length dưới lock: history có thể đã được 1 thread khác compact về [hidden doc]
  if (history.length < HANDOFF_MIN_HISTORY_LENGTH) {
    debugLog(
      'HISTORY',
      `compactHistory: skip (len=${history.length} < ${HANDOFF_MIN_HISTORY_LENGTH})`,
    );
    return false;
  }

  compactingThreads.add(threadId);
  try {
    // Đo token hiện tại (ưu tiên cache fresh)
    const cachedTotal = tokenCache.get(threadId);
    const cacheTs = cacheTimestamp.get(threadId) ?? 0;
    const cacheFresh = cachedTotal != null && Date.now() - cacheTs < CACHE_FRESH_MS;
    let currentTokens: number;
    if (cacheFresh && cachedTotal! <= maxTokens) {
      currentTokens = cachedTotal!;
    } else {
      currentTokens = await countTokens(history);
    }

    console.log(
      `[History] Thread ${threadId}: ${currentTokens} tokens (max: ${maxTokens}) — check handoff`,
    );
    debugLog(
      'HISTORY',
      `compactHistory: thread=${threadId}, tokens=${currentTokens}, max=${maxTokens}, handoffEnabled=${handoffEnabled}`,
    );

    // Fast path: dưới max thì không cần làm gì
    if (currentTokens <= maxTokens) {
      tokenCache.set(threadId, currentTokens);
      cacheTimestamp.set(threadId, Date.now());
      return false;
    }

    // Handoff disabled → fallback cũ (shift oldest) để không kẹt bot
    if (!handoffEnabled) {
      debugLog('HISTORY', `compactHistory: handoff disabled, fallback to shift trim`);
      return fallbackShiftTrim(threadId, history, maxTokens);
    }

    const handoffDoc = await generateHandoffDoc(history);
    if (!handoffDoc) {
      // Fail → không đụng history; caller retry lần sau
      console.warn(
        `[History] ⚠️ Handoff failed for ${threadId} — leaving history untouched, will retry later`,
      );
      debugLog('HISTORY', `compactHistory: handoff AI returned empty for ${threadId}`);
      invalidateTokenCache(threadId);
      return false;
    }

    // Build hidden handoff content + phantom model ack để preserve Gemini SDK role
    // alternation (xem buildHiddenHandoffAck để biết lý do critical).
    const handoffContent = buildHiddenHandoffContent(handoffDoc);
    const handoffAck = buildHiddenHandoffAck();
    const newHistory = [handoffContent, handoffAck];
    const newRaw = [
      { isSelf: false, isHandoff: true, data: { content: handoffDoc } },
      { isSelf: true, isHandoff: true, data: { content: '[acknowledged]' } },
    ];

    messageHistory.set(threadId, newHistory);
    rawMessageHistory.set(threadId, newRaw);

    // Persist toàn bộ DB: xoá cũ, insert cả handoff doc + ack (2 rows, alternating roles)
    try {
      const newRows: Array<{ role: 'user' | 'model'; parts: any[] }> = [
        { role: 'user', parts: (handoffContent.parts ?? []) as any[] },
        { role: 'model', parts: (handoffAck.parts ?? []) as any[] },
      ];
      await historyRepository.replaceHistory(threadId, newRows);
    } catch (err) {
      debugLog('HISTORY', `replaceHistory DB error (memory already updated): ${err}`);
    }

    // QUAN TRỌNG: xoá chat session để next call tạo fresh session với history mới
    deleteChatSession(threadId);

    // Token cache reset — history giờ rất nhỏ
    tokenCache.set(threadId, 0);
    cacheTimestamp.set(threadId, 0);

    const newTokens = await countTokens(newHistory);
    console.log(
      `[History] 🔄 Handoff compacted: ${history.length} msgs → 1 hidden doc + 1 ack (${newTokens} tokens)`,
    );
    debugLog('HISTORY', `compactHistory: success for ${threadId}, newTokens=${newTokens}`);
    return true;
  } finally {
    compactingThreads.delete(threadId);
  }
}

/**
 * Fallback: shift() oldest messages như logic cũ khi handoff disabled hoặc transcript rỗng.
 * Returns true nếu đã trim ≥1 message.
 */
async function fallbackShiftTrim(
  threadId: string,
  history: Content[],
  maxTokens: number,
): Promise<boolean> {
  if (history.length <= 2) return false;
  const rawHistory = rawMessageHistory.get(threadId) || [];
  let trimCount = 0;
  let currentTokens = await countTokens(history);
  const maxTrimAttempts = CONFIG.history?.maxTrimAttempts ?? 50;
  while (currentTokens > maxTokens && history.length > 2 && trimCount < maxTrimAttempts) {
    history.shift();
    rawHistory.shift();
    trimCount++;
    if (trimCount % 5 === 0 || history.length <= 2) {
      currentTokens = await countTokens(history);
      console.log(`[History] Trimmed ${trimCount} messages -> ${currentTokens} tokens`);
    }
  }
  messageHistory.set(threadId, history);
  rawMessageHistory.set(threadId, rawHistory);
  tokenCache.set(threadId, currentTokens);
  cacheTimestamp.set(threadId, Date.now());
  return trimCount > 0;
}

/**
 * Preload tất cả tin nhắn cũ từ Zalo khi bot start
 */

/**
 * Preload tất cả tin nhắn cũ từ Zalo khi bot start
 */
export async function preloadAllHistory(api: any): Promise<void> {
  if (isPreloaded) return;

  if (CONFIG.historyLoader?.enabled === false) {
    console.log('[History] ⏭️ Preload history đã bị tắt trong config');
    isPreloaded = true;
    return;
  }

  console.log('[History] 📥 Đang preload lịch sử chat (Pagination mode)...');

  try {
    const config = getPaginationConfig();
    let totalMsgs = 0;

    // Load User messages
    if (CONFIG.historyLoader.loadUser) {
      const userMessages = await fetchFullHistory(api, 0);
      const allowedIds = CONFIG.allowedUserIds;
      const filteredMessages =
        allowedIds.length > 0
          ? userMessages.filter((msg) => allowedIds.includes(msg.threadId))
          : userMessages;

      for (const msg of filteredMessages) {
        const threadId = msg.threadId;
        if (!preloadedMessages.has(threadId)) {
          preloadedMessages.set(threadId, []);
        }
        preloadedMessages.get(threadId)!.push(msg);
      }
      totalMsgs += filteredMessages.length;

      if (userMessages.length > 0 && CONFIG.historyLoader.loadGroup) {
        const waitTime = randomDelay(config.minDelay, config.maxDelay);
        console.log(`[History] 💤 Nghỉ ${(waitTime / 1000).toFixed(1)}s...`);
        await sleep(waitTime);
      }
    }

    // Load Group messages
    if (CONFIG.historyLoader.loadGroup) {
      const groupMessages = await fetchFullHistory(api, 1);
      for (const msg of groupMessages) {
        const threadId = msg.threadId;
        if (!preloadedMessages.has(threadId)) {
          preloadedMessages.set(threadId, []);
        }
        preloadedMessages.get(threadId)!.push(msg);
      }
      totalMsgs += groupMessages.length;
    }

    isPreloaded = true;
    console.log(`[History] ✅ Preload xong: ${totalMsgs} tin từ ${preloadedMessages.size} threads`);
  } catch (_error) {
    console.log('[History] ⚠️ Preload gặp lỗi, tiếp tục với dữ liệu hiện có');
    isPreloaded = true;
  }
}

/**
 * Khởi tạo history cho thread từ Zalo (chỉ chạy 1 lần)
 */
export async function initThreadHistory(api: any, threadId: string, type: number): Promise<void> {
  if (initializedThreads.has(threadId)) return;

  debugLog('HISTORY', `Initializing history for thread ${threadId}`);
  initializedThreads.add(threadId);

  // Thử load từ database trước (nếu được bật)
  if (CONFIG.historyLoader?.loadFromDb !== false) {
    // Cast lên Content[] ngay tại boundary (DB rows narrow role='user'|'model' nhưng
    // Content.role trong @google/genai là string) — push/pop sau này hoạt động tự nhiên,
    // không phải cast-launder-and-mismatch nhiều chỗ.
    const dbHistory = (await historyRepository.getHistoryForAI(threadId)) as Content[];
    if (dbHistory.length > 0) {
      // Migration cho legacy single-row handoff records (từ version trước khi phantom ack được thêm).
      // Nếu DB có đúng 1 row user-role bắt đầu bằng `[HIDDEN_HANDOFF]`, append phantom ack in-memory + persist
      // để tránh Gemini SDK reject `[user, user]` consecutive turns ở tin nhắn kế tiếp.
      if (dbHistory.length === 1) {
        const single = dbHistory[0]!;  // narrow từ `T | undefined` (TS array indexing)
        const singleText = (single.parts?.[0] as { text?: string } | undefined)?.text ?? '';
        if (
          single.role === 'user' &&
          typeof singleText === 'string' &&
          singleText.startsWith(HIDDEN_HANDOFF_PREFIX)
        ) {
          const ack = buildHiddenHandoffAck();
          dbHistory.push(ack);
          try {
            await historyRepository.replaceHistory(threadId, [
              { role: 'user', parts: (single.parts ?? []) as any[] },
              { role: 'model', parts: (ack.parts ?? []) as any[] },
            ]);
            console.log(
              `[History] 🔧 Patch legacy single-row handoff → 2 rows (user + model ack) for ${threadId}`,
            );
            debugLog('HISTORY', `Patched legacy handoff: ${threadId}`);
          } catch (err) {
            debugLog('HISTORY', `Legacy handoff patch DB error: ${err}`);
          }
        }
      }
      console.log(`[History] 📚 Thread ${threadId}: Loaded ${dbHistory.length} messages from DB`);
      messageHistory.set(threadId, dbHistory);
      await trimHistoryByTokens(threadId);
      return;
    }
  } else {
    debugLog('HISTORY', `Load from DB disabled, skipping DB history`);
  }

  // Fallback: load từ Zalo API (nếu enabled)
  if (CONFIG.historyLoader?.enabled !== false) {
    const oldHistory = await loadOldMessages(api, threadId, type, preloadedMessages);

    if (oldHistory.length > 0) {
      messageHistory.set(threadId, oldHistory);
      await trimHistoryByTokens(threadId);

      // Persist to DB (async)
      for (const content of oldHistory) {
        persistToDb(threadId, content.role as 'user' | 'model', content);
      }
    }
  } else {
    debugLog('HISTORY', `Load from Zalo disabled, starting with empty history`);
  }
}

/**
 * Lưu tin nhắn mới vào history
 */
export async function saveToHistory(threadId: string, message: any): Promise<void> {
  debugLog('HISTORY', `saveToHistory: thread=${threadId}`);

  const history = messageHistory.get(threadId) || [];
  const rawHistory = rawMessageHistory.get(threadId) || [];

  const content = await toGeminiContent(message);
  history.push(content);
  rawHistory.push(message);

  messageHistory.set(threadId, history);
  rawMessageHistory.set(threadId, rawHistory);

  // Cache sẽ stale do vừa save — invalidate để trim lần sau KHÔNG dùng cache cũ
  invalidateTokenCache(threadId);

  // Persist to DB
  persistToDb(threadId, 'user', content);

  await trimHistoryByTokens(threadId);
}

/**
 * Lưu response text vào history
 */
export async function saveResponseToHistory(threadId: string, responseText: string): Promise<void> {
  const history = messageHistory.get(threadId) || [];
  const rawHistory = rawMessageHistory.get(threadId) || [];

  const content: Content = {
    role: 'model',
    parts: [{ text: responseText }],
  };

  history.push(content);
  rawHistory.push({ isSelf: true, data: { content: responseText } });

  messageHistory.set(threadId, history);
  rawMessageHistory.set(threadId, rawHistory);

  // Cache sẽ stale do vừa save — invalidate để trim lần sau KHÔNG dùng cache cũ
  invalidateTokenCache(threadId);

  // Persist to DB
  persistToDb(threadId, 'model', content);

  await trimHistoryByTokens(threadId);
}

/**
 * Lưu kết quả tool vào history
 */
export async function saveToolResultToHistory(
  threadId: string,
  toolResultPrompt: string,
): Promise<void> {
  const history = messageHistory.get(threadId) || [];
  const rawHistory = rawMessageHistory.get(threadId) || [];

  const content: Content = {
    role: 'user',
    parts: [{ text: toolResultPrompt }],
  };

  history.push(content);
  rawHistory.push({
    isSelf: false,
    isToolResult: true,
    data: { content: toolResultPrompt },
  });

  messageHistory.set(threadId, history);
  rawMessageHistory.set(threadId, rawHistory);

  // Cache sẽ stale do vừa save — invalidate để trim lần sau KHÔNG dùng cache cũ
  invalidateTokenCache(threadId);

  // Persist to DB
  persistToDb(threadId, 'user', content);

  await trimHistoryByTokens(threadId);
}

/** Lấy history dạng Gemini Content[] */
export function getHistory(threadId: string): Content[] {
  return messageHistory.get(threadId) || [];
}

/** Lấy số token hiện tại (từ cache) */
export function getCachedTokenCount(threadId: string): number {
  return tokenCache.get(threadId) || 0;
}

/** Xóa history của thread */
export function clearHistory(threadId: string): void {
  const oldCount = messageHistory.get(threadId)?.length || 0;
  debugLog('HISTORY', `Clearing history for thread ${threadId}`);

  // Xóa memory cache
  messageHistory.delete(threadId);
  rawMessageHistory.delete(threadId);
  tokenCache.delete(threadId);
  cacheTimestamp.delete(threadId);
  initializedThreads.delete(threadId);

  // Xóa Gemini chat session (quan trọng! để AI quên context cũ)
  deleteChatSession(threadId);

  // Clear from DB (async)
  historyRepository.clearHistory(threadId).catch((err) => {
    debugLog('HISTORY', `DB clear error: ${err}`);
  });

  debugLog('HISTORY', `Cleared ${oldCount} messages for ${threadId}`);
}

/** Lấy raw Zalo messages (cho quote feature) */
export function getRawHistory(threadId: string): any[] {
  return rawMessageHistory.get(threadId) || [];
}

/** Kiểm tra thread đã được khởi tạo chưa */
export function isThreadInitialized(threadId: string): boolean {
  return initializedThreads.has(threadId);
}
