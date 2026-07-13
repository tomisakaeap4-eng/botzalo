/**
 * History Module - Re-export từ các sub-modules
 *
 * Cấu trúc:
 * - tokenCounter.ts: Đếm token cho Gemini API
 * - historyConverter.ts: Convert Zalo messages sang Gemini format
 * - historyLoader.ts: Tải lịch sử từ Zalo API
 * - historyStore.ts: Lưu trữ và quản lý history
 */

// Message store (database-backed)
export {
  getLastSentMessage,
  getSentMessage,
  removeSentMessage,
  saveSentMessage,
} from '../message/messageStore.js';
// Token counter
export {
  checkInputTokens,
  countTokens,
  filterUnsupportedMedia,
  isSupportedMime,
  type TokenCheckResult,
} from '../tokenCounter.js';
// History converter
export {
  getMediaUrl,
  getMimeType,
  toGeminiContent,
} from './historyConverter.js';
// History loader
export {
  fetchFullHistory,
  getPaginationConfig,
  loadOldMessages,
} from './historyLoader.js';
// Handoff generator (used by historyStore + history.api.ts + tests)
// NOTE: HIDDEN_HANDOFF_ACK_PREFIX không re-export — detection dùng chung HIDDEN_HANDOFF_PREFIX
// (ack text bắt đầu bằng `[HIDDEN_HANDOFF]_ACK` vẫn match `startsWith('[HIDDEN_HANDOFF]')`).
export {
  buildHiddenHandoffAck,
  buildHiddenHandoffContent,
  formatHistoryForAI,
  generateHandoffDoc,
  HIDDEN_HANDOFF_PREFIX,
  isHiddenHandoffContent,
  loadHandoffSkill,
  resetHandoffDocStubForTesting,
  resetHandoffSkillCacheForTesting,
  resetHandoffStateForTesting,
  setHandoffDocStubForTesting,
} from './handoffGenerator.js';
// History store (main exports)
export {
  clearHistory,
  compactHistoryWithHandoff,
  getCachedTokenCount,
  getHistory,
  getRawHistory,
  initThreadHistory,
  isThreadInitialized,
  preloadAllHistory,
  saveResponseToHistory,
  saveToHistory,
  saveToolResultToHistory,
  setTokenCache,
} from './historyStore.js';
