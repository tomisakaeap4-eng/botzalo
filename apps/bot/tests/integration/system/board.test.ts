/**
 * Integration Test: Board/Note Tools
 * Test chức năng tạo, xem và sửa ghi chú/bảng tin
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import {
  createNoteTool,
  editNoteTool,
  getListBoardTool,
} from '../../../src/modules/social/tools/board.js';
import { mockToolContext } from '../setup.js';

// Mock data
const mockTopicId = 'topic-123';
const mockBoardItems = {
  items: [
    {
      boardType: 1, // Note
      data: {
        id: 'topic-001',
        params: { title: '🚨 THÔNG BÁO: Mai họp lúc 8h' },
        createdTime: Date.now() - 86400000,
      },
    },
    {
      boardType: 1, // Note
      data: {
        id: 'topic-002',
        params: { title: 'Quy định nhóm' },
        createdTime: Date.now() - 172800000,
      },
    },
    {
      boardType: 3, // Poll
      data: {
        poll_id: 123456,
        question: 'Trưa ăn gì?',
        createdTime: Date.now() - 3600000,
      },
    },
  ],
};

// Mock API
const createMockApi = () => ({
  createNote: async (options: any, groupId: string) => ({
    id: mockTopicId,
    title: options.title,
    pinAct: options.pinAct,
  }),
  getListBoard: async (params: any, groupId: string) => mockBoardItems,
  editNote: async (options: any, groupId: string) => ({
    id: options.topicId,
    title: options.title,
    pinAct: options.pinAct,
  }),
});

describe('Board/Note Tools Integration', () => {
  let mockApi: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    mockApi = createMockApi();
  });

  // ═══════════════════════════════════════════════════
  // CREATE NOTE
  // ═══════════════════════════════════════════════════

  describe('createNote', () => {
    test('tạo note và ghim thành công', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await createNoteTool.execute(
        {
          title: '🚨 THÔNG BÁO QUAN TRỌNG: Mai họp lúc 8h',
          pinAct: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data.topic_id).toBe(mockTopicId);
      expect(result.data.title).toContain('THÔNG BÁO');
      expect(result.data.pinned).toBe(true);
      expect(result.data.message).toContain('ghim');
      expect(result.data.hint).toContain('topic_id');
    });

    test('tạo note không ghim', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await createNoteTool.execute(
        {
          title: 'Ghi chú thường',
          pinAct: false,
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data.pinned).toBe(false);
      expect(result.data.message).not.toContain('ghim');
    });

    test('mặc định pinAct = true', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await createNoteTool.execute(
        {
          title: 'Test note',
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data.pinned).toBe(true);
    });

    test('lỗi khi thiếu title', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await createNoteTool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('title');
    });

    test('lỗi khi title không phải string', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await createNoteTool.execute({ title: 123 }, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('title');
    });

    test('xử lý API error', async () => {
      const errorApi = {
        createNote: async () => {
          throw new Error('Permission denied');
        },
      };
      const context = { ...mockToolContext, api: errorApi, threadId: 'group-123' };

      const result = await createNoteTool.execute({ title: 'Test' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lỗi tạo ghi chú');
    });
  });

  // ═══════════════════════════════════════════════════
  // GET LIST BOARD
  // ═══════════════════════════════════════════════════

  describe('getListBoard', () => {
    test('lấy danh sách board thành công', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await getListBoardTool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data.total).toBe(3);
      expect(result.data.notes).toHaveLength(2);
      expect(result.data.polls).toHaveLength(1);
    });

    test('summary chứa thông tin notes', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await getListBoardTool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data.summary).toContain('GHI CHÚ');
      expect(result.data.summary).toContain('topic-001');
      expect(result.data.summary).toContain('THÔNG BÁO');
    });

    test('summary chứa thông tin polls', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await getListBoardTool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data.summary).toContain('BÌNH CHỌN');
      expect(result.data.summary).toContain('123456');
      expect(result.data.summary).toContain('Trưa ăn gì');
    });

    test('hint chứa hướng dẫn sử dụng', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await getListBoardTool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data.hint).toContain('topic_id');
      expect(result.data.hint).toContain('poll_id');
    });

    test('phân trang với page và count', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await getListBoardTool.execute({ page: 2, count: 10 }, context);

      expect(result.success).toBe(true);
    });

    test('giới hạn count tối đa 50', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      // Không throw error, chỉ cap lại
      const result = await getListBoardTool.execute({ count: 100 }, context);

      expect(result.success).toBe(true);
    });

    test('xử lý board rỗng', async () => {
      const emptyApi = {
        getListBoard: async () => ({ items: [] }),
      };
      const context = { ...mockToolContext, api: emptyApi, threadId: 'group-123' };

      const result = await getListBoardTool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data.total).toBe(0);
      expect(result.data.notes).toHaveLength(0);
      expect(result.data.polls).toHaveLength(0);
      expect(result.data.summary).toContain('Không có ghi chú');
      expect(result.data.summary).toContain('Không có bình chọn');
    });

    test('xử lý API error', async () => {
      const errorApi = {
        getListBoard: async () => {
          throw new Error('Network error');
        },
      };
      const context = { ...mockToolContext, api: errorApi, threadId: 'group-123' };

      const result = await getListBoardTool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lỗi lấy danh sách');
    });
  });

  // ═══════════════════════════════════════════════════
  // EDIT NOTE
  // ═══════════════════════════════════════════════════

  describe('editNote', () => {
    test('sửa note thành công', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await editNoteTool.execute(
        {
          topicId: 'topic-001',
          title: '🚨 THÔNG BÁO (UPDATE): Mai họp lúc 9h nhé!',
          pinAct: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data.topic_id).toBe('topic-001');
      expect(result.data.title).toContain('UPDATE');
      expect(result.data.pinned).toBe(true);
      expect(result.data.message).toContain('cập nhật');
    });

    test('sửa note và bỏ ghim', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await editNoteTool.execute(
        {
          topicId: 'topic-001',
          title: 'Nội dung mới',
          pinAct: false,
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data.pinned).toBe(false);
    });

    test('lỗi khi thiếu topicId', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await editNoteTool.execute(
        {
          title: 'Nội dung mới',
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('topicId');
    });

    test('lỗi khi thiếu title', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'group-123' };

      const result = await editNoteTool.execute(
        {
          topicId: 'topic-001',
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('title');
    });

    test('xử lý API error', async () => {
      const errorApi = {
        editNote: async () => {
          throw new Error('Note not found');
        },
      };
      const context = { ...mockToolContext, api: errorApi, threadId: 'group-123' };

      const result = await editNoteTool.execute(
        {
          topicId: 'invalid-id',
          title: 'Test',
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lỗi sửa ghi chú');
    });
  });
});
