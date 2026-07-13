/**
 * Board/Note Tools - Quản lý bảng tin và ghi chú ghim trong nhóm Zalo
 * API: createNote, getListBoard, editNote
 */

import { debugLog, logZaloAPI } from '../../../core/logger/logger.js';
import type { ToolContext, ToolDefinition, ToolResult } from '../../../shared/types/tools.types.js';

// Board types
const BOARD_TYPE = {
  NOTE: 1,
  POLL: 3,
} as const;

// ═══════════════════════════════════════════════════
// CREATE NOTE - Tạo ghi chú và ghim
// ═══════════════════════════════════════════════════

export const createNoteTool: ToolDefinition = {
  name: 'createNote',
  description:
    'Tạo ghi chú/thông báo quan trọng và ghim lên đầu nhóm (Board). Trả về topic_id để sửa/xóa sau.',
  parameters: [
    {
      name: 'title',
      type: 'string',
      description: 'Nội dung ghi chú/thông báo (VD: "🚨 THÔNG BÁO: Mai họp lúc 8h")',
      required: true,
    },
    {
      name: 'pinAct',
      type: 'boolean',
      description: 'Ghim lên Board (true = ghim, false = không ghim)',
      required: false,
      default: true,
    },
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      const { title, pinAct = true } = params;

      if (!title || typeof title !== 'string') {
        return { success: false, error: 'Thiếu nội dung ghi chú (title)' };
      }

      debugLog('TOOL:createNote', `Creating note: "${title.substring(0, 50)}..." pinAct=${pinAct}`);

      const noteOptions = {
        title,
        pinAct: Boolean(pinAct),
      };

      const result = await context.api.createNote(noteOptions, context.threadId);
      logZaloAPI('tool:createNote', { threadId: context.threadId, noteOptions }, result);

      return {
        success: true,
        data: {
          topic_id: result.id,
          title: title,
          pinned: pinAct,
          message: `Đã tạo ghi chú${pinAct ? ' và ghim lên Board' : ''}`,
          hint: 'Lưu topic_id để sửa hoặc xóa sau với editNote',
        },
      };
    } catch (error: any) {
      debugLog('TOOL:createNote', `Error: ${error.message}`);
      return { success: false, error: `Lỗi tạo ghi chú: ${error.message}` };
    }
  },
};

// ═══════════════════════════════════════════════════
// GET LIST BOARD - Lấy danh sách bảng tin
// ═══════════════════════════════════════════════════

export const getListBoardTool: ToolDefinition = {
  name: 'getListBoard',
  description:
    'Lấy danh sách tất cả Poll và Note trong nhóm. Dùng để tìm ID của poll/note cần quản lý.',
  parameters: [
    {
      name: 'page',
      type: 'number',
      description: 'Số trang (bắt đầu từ 1)',
      required: false,
      default: 1,
    },
    {
      name: 'count',
      type: 'number',
      description: 'Số item mỗi trang (tối đa 50)',
      required: false,
      default: 20,
    },
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      const page = params.page ?? 1;
      const count = Math.min(params.count ?? 20, 50);

      debugLog('TOOL:getListBoard', `Getting board list: page=${page}, count=${count}`);

      const result = await context.api.getListBoard({ page, count }, context.threadId);
      logZaloAPI('tool:getListBoard', { threadId: context.threadId, page, count }, result);

      const items = result.items || [];
      const notes: any[] = [];
      const polls: any[] = [];

      for (const item of items) {
        if (item.boardType === BOARD_TYPE.NOTE) {
          notes.push({
            topic_id: item.data?.id,
            title: item.data?.params?.title || 'Không có tiêu đề',
            createdAt: item.data?.createdTime,
          });
        } else if (item.boardType === BOARD_TYPE.POLL) {
          polls.push({
            poll_id: item.data?.poll_id,
            question: item.data?.question || 'Không có câu hỏi',
            createdAt: item.data?.createdTime,
          });
        }
      }

      // Format summary
      const notesSummary = notes.length
        ? notes.map((n) => `📝 [${n.topic_id}] ${n.title}`).join('\n')
        : 'Không có ghi chú';

      const pollsSummary = polls.length
        ? polls.map((p) => `📊 [${p.poll_id}] ${p.question}`).join('\n')
        : 'Không có bình chọn';

      return {
        success: true,
        data: {
          total: items.length,
          notes,
          polls,
          summary: `=== GHI CHÚ (${notes.length}) ===\n${notesSummary}\n\n=== BÌNH CHỌN (${polls.length}) ===\n${pollsSummary}`,
          hint: 'Dùng topic_id với editNote, poll_id với getPollDetail/lockPoll (votePoll đã bỏ)',
        },
      };
    } catch (error: any) {
      debugLog('TOOL:getListBoard', `Error: ${error.message}`);
      return { success: false, error: `Lỗi lấy danh sách board: ${error.message}` };
    }
  },
};

// ═══════════════════════════════════════════════════
// EDIT NOTE - Sửa ghi chú
// ═══════════════════════════════════════════════════

export const editNoteTool: ToolDefinition = {
  name: 'editNote',
  description: 'Sửa nội dung ghi chú đã tạo. Cần topic_id (lấy từ createNote hoặc getListBoard).',
  parameters: [
    {
      name: 'topicId',
      type: 'string',
      description: 'ID của ghi chú cần sửa',
      required: true,
    },
    {
      name: 'title',
      type: 'string',
      description: 'Nội dung mới của ghi chú',
      required: true,
    },
    {
      name: 'pinAct',
      type: 'boolean',
      description: 'Ghim lên Board',
      required: false,
      default: true,
    },
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      const { topicId, title, pinAct = true } = params;

      if (!topicId) {
        return { success: false, error: 'Thiếu topicId' };
      }

      if (!title || typeof title !== 'string') {
        return { success: false, error: 'Thiếu nội dung mới (title)' };
      }

      debugLog('TOOL:editNote', `Editing note ${topicId}: "${title.substring(0, 50)}..."`);

      const editOptions = {
        topicId: String(topicId),
        title,
        pinAct: Boolean(pinAct),
      };

      const result = await context.api.editNote(editOptions, context.threadId);
      logZaloAPI('tool:editNote', { threadId: context.threadId, editOptions }, result);

      return {
        success: true,
        data: {
          topic_id: topicId,
          title: title,
          pinned: pinAct,
          message: 'Đã cập nhật ghi chú',
        },
      };
    } catch (error: any) {
      debugLog('TOOL:editNote', `Error: ${error.message}`);
      return { success: false, error: `Lỗi sửa ghi chú: ${error.message}` };
    }
  },
};
