/**
 * Poll Tools - Quản lý bình chọn trong nhóm Zalo
 * Phase 2: chỉ createPoll/getPollDetail/lockPoll (votePoll bỏ — bot không tự vote).
 */

import { debugLog, logZaloAPI } from '../../../core/logger/logger.js';
import type { ToolContext, ToolDefinition, ToolResult } from '../../../shared/types/tools.types.js';

// ═══════════════════════════════════════════════════
// CREATE POLL - Tạo bình chọn mới
// ═══════════════════════════════════════════════════

export const createPollTool: ToolDefinition = {
  name: 'createPoll',
  description:
    'Tạo bình chọn (poll) trong nhóm chat. Trả về poll_id để quản lý sau này. Chỉ hoạt động trong nhóm.',
  parameters: [
    {
      name: 'question',
      type: 'string',
      description: 'Câu hỏi bình chọn (VD: "Trưa ăn gì?")',
      required: true,
    },
    {
      name: 'options',
      type: 'object',
      description: 'Mảng các lựa chọn (VD: ["Cơm", "Phở", "Bún"])',
      required: true,
    },
    {
      name: 'expiredTime',
      type: 'number',
      description: 'Thời gian hết hạn (Unix timestamp ms). 0 = không hết hạn',
      required: false,
      default: 0,
    },
    {
      name: 'allowMultiChoices',
      type: 'boolean',
      description: 'Cho phép chọn nhiều đáp án',
      required: false,
      default: false,
    },
    {
      name: 'allowAddNewOption',
      type: 'boolean',
      description: 'Cho phép thành viên thêm lựa chọn mới',
      required: false,
      default: false,
    },
    {
      name: 'hideVotePreview',
      type: 'boolean',
      description: 'Ẩn kết quả nếu chưa vote',
      required: false,
      default: false,
    },
    {
      name: 'isAnonymous',
      type: 'boolean',
      description: 'Bình chọn ẩn danh',
      required: false,
      default: false,
    },
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      const { question, options } = params;

      if (!question || typeof question !== 'string') {
        return { success: false, error: 'Thiếu câu hỏi bình chọn (question)' };
      }

      if (!Array.isArray(options) || options.length < 2) {
        return { success: false, error: 'Cần ít nhất 2 lựa chọn (options)' };
      }

      debugLog('TOOL:createPoll', `Creating poll: "${question}" with ${options.length} options`);

      const pollOptions = {
        question,
        options: options.map(String),
        expiredTime: params.expiredTime ?? 0,
        allowMultiChoices: params.allowMultiChoices ?? false,
        allowAddNewOption: params.allowAddNewOption ?? false,
        hideVotePreview: params.hideVotePreview ?? false,
        isAnonymous: params.isAnonymous ?? false,
      };

      const result = await context.api.createPoll(pollOptions, context.threadId);
      logZaloAPI('tool:createPoll', { threadId: context.threadId, pollOptions }, result);

      return {
        success: true,
        data: {
          poll_id: result.poll_id,
          question: question,
          options: options,
          message: `Đã tạo bình chọn "${question}" với ${options.length} lựa chọn`,
          hint: 'Lưu poll_id để lock hoặc xem chi tiết sau (user tự vote trên Zalo UI)',
        },
      };
    } catch (error: any) {
      debugLog('TOOL:createPoll', `Error: ${error.message}`);
      return { success: false, error: `Lỗi tạo bình chọn: ${error.message}` };
    }
  },
};

// ═══════════════════════════════════════════════════
// GET POLL DETAIL - Xem chi tiết bình chọn
// ═══════════════════════════════════════════════════

export const getPollDetailTool: ToolDefinition = {
  name: 'getPollDetail',
  description:
    'Lấy chi tiết bình chọn: câu hỏi, các lựa chọn, số phiếu, danh sách người vote. Cần poll_id.',
  parameters: [
    {
      name: 'pollId',
      type: 'number',
      description: 'ID của bình chọn (lấy từ createPoll hoặc getListBoard)',
      required: true,
    },
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      const { pollId } = params;

      if (!pollId) {
        return { success: false, error: 'Thiếu pollId' };
      }

      debugLog('TOOL:getPollDetail', `Getting poll detail: ${pollId}`);

      const detail = await context.api.getPollDetail(Number(pollId));
      logZaloAPI('tool:getPollDetail', { pollId }, detail);

      // Format options để dễ đọc
      const optionsSummary = detail.options
        ?.map(
          (opt: any, idx: number) =>
            `${idx + 1}. ${opt.content} - ${opt.votes || 0} phiếu (option_id: ${opt.option_id})`,
        )
        .join('\n');

      return {
        success: true,
        data: {
          poll_id: detail.poll_id,
          question: detail.question,
          options: detail.options,
          summary: optionsSummary,
          hint: 'Dùng option_id để biết chi tiết vote của từng option (user tự vote trên Zalo UI)',
        },
      };
    } catch (error: any) {
      debugLog('TOOL:getPollDetail', `Error: ${error.message}`);
      return { success: false, error: `Lỗi lấy chi tiết bình chọn: ${error.message}` };
    }
  },
};

// ═══════════════════════════════════════════════════
// LOCK POLL - Khóa bình chọn
// ═══════════════════════════════════════════════════

export const lockPollTool: ToolDefinition = {
  name: 'lockPoll',
  description: 'Khóa bình chọn, không cho vote nữa. Cần poll_id.',
  parameters: [
    {
      name: 'pollId',
      type: 'number',
      description: 'ID của bình chọn cần khóa',
      required: true,
    },
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      const { pollId } = params;

      if (!pollId) {
        return { success: false, error: 'Thiếu pollId' };
      }

      debugLog('TOOL:lockPoll', `Locking poll: ${pollId}`);

      const result = await context.api.lockPoll(Number(pollId));
      logZaloAPI('tool:lockPoll', { pollId }, result);

      return {
        success: true,
        data: {
          poll_id: pollId,
          message: 'Đã khóa bình chọn, không thể vote thêm',
        },
      };
    } catch (error: any) {
      debugLog('TOOL:lockPoll', `Error: ${error.message}`);
      return { success: false, error: `Lỗi khóa bình chọn: ${error.message}` };
    }
  },
};
