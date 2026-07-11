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

// In-memory cache (primary storage for fast access)
const messageHistory = new Map<string, Content[]>();
const rawMessageHistory = new Map<string, any[]>();
const tokenCache = new Map<string, number>();
/** Timestamp (ms) của lần cuối setTokenCache → trimHistoryByTokens chỉ dùng cache khi còn fresh (<10s) */
const cacheTimestamp = new Map<string, number>();
const initializedThreads = new Set<string>();
const preloadedMessages = new Map<string, any[]>();
let isPreloaded = false;

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
 * Xóa lịch sử cũ từ từ cho đến khi dưới ngưỡng token.
 * Tận dụng tokenCache khi cache còn fresh (được set từ response.usageMetadata gần đây)
 * → giảm ~50% countTokens API calls, tránh 429 rate-limit khi history dài.
 */
async function trimHistoryByTokens(threadId: string): Promise<void> {
  const history = messageHistory.get(threadId) || [];
  if (history.length === 0) return;

  const maxTokens = CONFIG.maxTokenHistory;
  const cachedTotal = tokenCache.get(threadId);
  const cacheTs = cacheTimestamp.get(threadId) ?? 0;
  const cacheFresh = cachedTotal != null && Date.now() - cacheTs < CACHE_FRESH_MS;

  // Optimization: dùng cache nếu còn fresh + dưới maxTokens (skip countTokens API call)
  let currentTokens: number;
  if (cacheFresh && cachedTotal! <= maxTokens) {
    currentTokens = cachedTotal!;
    debugLog(
      'HISTORY',
      `trimHistoryByTokens: using fresh cache=${currentTokens} (≤max=${maxTokens}, age=${Date.now() - cacheTs}ms) — skip countTokens API`,
    );
  } else {
    currentTokens = await countTokens(history);
  }

  console.log(`[History] Thread ${threadId}: ${currentTokens} tokens (max: ${maxTokens})`);
  debugLog(
    'HISTORY',
    `trimHistoryByTokens: thread=${threadId}, tokens=${currentTokens}, max=${maxTokens}, cacheFresh=${cacheFresh}`,
  );

  // Fast path: nếu đã dưới max thì không cần trim
  if (currentTokens <= maxTokens) {
    tokenCache.set(threadId, currentTokens);
    cacheTimestamp.set(threadId, Date.now());
    return;
  }

  const rawHistory = rawMessageHistory.get(threadId) || [];
  let trimCount = 0;
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
}

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
    const dbHistory = await historyRepository.getHistoryForAI(threadId);
    if (dbHistory.length > 0) {
      console.log(`[History] 📚 Thread ${threadId}: Loaded ${dbHistory.length} messages from DB`);
      messageHistory.set(threadId, dbHistory as Content[]);
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
