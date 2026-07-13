/**
 * Tool Output Handler - Xử lý output từ tools
 * Quyết định gửi file/media qua Zalo hay trả text về AI
 *
 * Phase 2: chỉ giữ textToSpeech (đã bỏ createFile/createChart/solveMath/qrCode).
 */

import { debugLog } from '../../../core/index.js';
import type { ToolCall, ToolResult } from '../../../core/types.js';
import { getThreadType } from '../../../shared/utils/message/messageSender.js';

// ═══════════════════════════════════════════════════
// MEDIA SENDERS
// ═══════════════════════════════════════════════════

/**
 * Gửi voice message từ TTS tool result (Microsoft Edge TTS)
 */
export async function sendVoice(api: any, threadId: string, audioBuffer: Buffer): Promise<void> {
  const threadType = getThreadType(threadId);
  console.log(`[Tool] 🎤 Đang upload voice (${audioBuffer.length} bytes)...`);
  debugLog('TOOL:TTS', `Uploading voice, size: ${audioBuffer.length}, threadType: ${threadType}`);

  const uploadResult = await api.uploadAttachment(
    {
      filename: `voice_${Date.now()}.mp3`,
      data: audioBuffer,
      metadata: { totalSize: audioBuffer.length, width: 0, height: 0 },
    },
    threadId,
    threadType,
  );

  const fileUrl = uploadResult[0]?.fileUrl || uploadResult[0]?.normalUrl;
  if (!fileUrl) {
    throw new Error('Không lấy được link file sau khi upload');
  }

  debugLog('TOOL:TTS', `Upload success, URL: ${fileUrl}`);
  await api.sendVoice({ voiceUrl: fileUrl }, threadId, threadType);
  console.log(`[Tool] ✅ Đã gửi voice message!`);
}

// ═══════════════════════════════════════════════════
// TOOL OUTPUT HANDLERS MAP
// ═══════════════════════════════════════════════════

type OutputHandler = (api: any, threadId: string, result: ToolResult) => Promise<void>;

const outputHandlers: Record<string, OutputHandler> = {
  // TTS → send voice
  textToSpeech: async (api, threadId, result) => {
    if (result.data?.audio) {
      await sendVoice(api, threadId, result.data.audio);
    }
  },
};

// ═══════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════

/**
 * Xử lý output của một tool call
 * Gửi file/media qua Zalo nếu cần
 */
export async function handleToolOutput(
  api: any,
  threadId: string,
  toolCall: ToolCall,
  result: ToolResult,
): Promise<void> {
  if (!result.success) return;

  const handler = outputHandlers[toolCall.toolName];
  if (handler) {
    try {
      await handler(api, threadId, result);
    } catch (e: any) {
      debugLog(`TOOL:${toolCall.toolName.toUpperCase()}`, `Failed to send output: ${e.message}`);
    }
  }
}

/**
 * Xử lý output của tất cả tool calls
 */
export async function handleAllToolOutputs(
  api: any,
  threadId: string,
  toolCalls: ToolCall[],
  results: Map<string, ToolResult>,
): Promise<void> {
  for (const call of toolCalls) {
    const result = results.get(call.rawTag);
    if (result) {
      await handleToolOutput(api, threadId, call, result);
    }
  }
}
