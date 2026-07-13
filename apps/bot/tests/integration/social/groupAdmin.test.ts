/**
 * Integration Test: Group Admin Tools (Phase 2 — basic only)
 *
 * Phase 2 refactor: chỉ test 6 tools cơ bản còn lại.
 * Dropped: blockMember, addMember, updateGroupSettings, changeGroupName,
 *          changeGroupAvatar, addGroupDeputy, removeGroupDeputy, changeGroupOwner,
 *          enableGroupLink, disableGroupLink, createGroup, joinGroupLink,
 *          leaveGroup, disperseGroup.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import {
  getGroupInfoTool,
  getGroupLinkDetailTool,
  getGroupLinkInfoTool,
  getPendingMembersTool,
  kickMemberTool,
  reviewPendingMembersTool,
} from '../../../src/modules/social/tools/groupAdmin.js';
import { setThreadType } from '../../../src/shared/utils/message/messageSender.js';
import { mockToolContext } from '../setup.js';

// Mock data
const mockGroupId = 'group-123456';
const mockUserId = 'user-789';
const mockCreatorId = 'creator-001';
const mockAdminIds = ['admin-001', 'admin-002'];

const mockGroupInfo = {
  gridInfoMap: {
    [mockGroupId]: {
      name: 'Test Group',
      creatorId: mockCreatorId,
      adminIds: mockAdminIds,
      memberIds: ['user-1', 'user-2', 'user-3', mockCreatorId, ...mockAdminIds],
      currentMems: [
        { id: 'user-1', dName: 'User 1' },
        { id: 'user-2', dName: 'User 2' },
        { id: 'user-3', dName: 'User 3' },
      ],
      setting: {
        blockName: false,
        signAdminMsg: true,
        joinAppr: false,
        lockSendMsg: false,
        lockCreatePost: false,
        lockCreatePoll: false,
      },
      desc: 'Test group description',
      avt: 'https://example.com/avatar.jpg',
      link: 'https://zalo.me/g/abc123',
    },
  },
};

const mockPendingMembers = {
  users: [
    { uid: 'pending-1', dpn: 'Pending User 1' },
    { uid: 'pending-2', dpn: 'Pending User 2' },
  ],
};

// Mock API (chỉ 6 methods cần thiết)
const createMockApi = () => ({
  getGroupInfo: async (groupId: string) => {
    if (groupId === mockGroupId) return mockGroupInfo;
    throw new Error('Group not found');
  },

  removeUserFromGroup: async (userId: string, groupId: string) => ({
    success: true,
    userId,
    groupId,
  }),

  getPendingGroupMembers: async (groupId: string) => mockPendingMembers,
  reviewPendingMemberRequest: async (payload: any, groupId: string) => ({
    'pending-1': 0,
    'pending-2': 0,
    ...payload,
  }),

  getGroupLinkDetail: async (groupId: string) => ({
    link: 'https://zalo.me/g/abc123',
    expiration_date: 0,
    enabled: 1,
  }),

  getGroupLinkInfo: async (link: string) => ({
    groupId: mockGroupId,
    name: 'Test Group',
    totalMember: 50,
    desc: 'Group from link',
  }),
});

describe('Group Admin Tools Integration (Phase 2 — basic)', () => {
  let mockApi: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    mockApi = createMockApi();
    setThreadType(mockGroupId, 1);
  });

  // ═══════════════════════════════════════════════════
  // GET GROUP INFO
  // ═══════════════════════════════════════════════════

  describe('getGroupInfo', () => {
    test('lấy thông tin nhóm thành công', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: mockGroupId };

      const result = await getGroupInfoTool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data.groupId).toBe(mockGroupId);
      expect(result.data.name).toBe('Test Group');
      expect(result.data.creatorId).toBe(mockCreatorId);
      expect(result.data.adminIds).toEqual(mockAdminIds);
      expect(result.data.memberCount).toBeGreaterThan(0);
      expect(result.data.settings).toBeDefined();
      expect(result.data.settingsSummary).toContain('Chặn đổi tên');
      expect(result.data.hint).toContain('getGroupMembers');
    });

    test('lỗi khi không tìm thấy nhóm', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: 'invalid-group' };

      const result = await getGroupInfoTool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lỗi lấy thông tin nhóm');
    });

    test('xử lý API error', async () => {
      const errorApi = {
        getGroupInfo: async () => {
          throw new Error('Network error');
        },
      };
      const context = { ...mockToolContext, api: errorApi, threadId: mockGroupId };

      const result = await getGroupInfoTool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lỗi lấy thông tin nhóm');
    });
  });

  // ═══════════════════════════════════════════════════
  // KICK MEMBER
  // ═══════════════════════════════════════════════════

  describe('kickMember', () => {
    test('kick thành viên thành công', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: mockGroupId };

      const result = await kickMemberTool.execute({ userId: mockUserId }, context);

      expect(result.success).toBe(true);
      expect(result.data.userId).toBe(mockUserId);
      expect(result.data.message).toContain('kick');
    });

    test('lỗi khi thiếu userId', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: mockGroupId };

      const result = await kickMemberTool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });

    test('xử lý API error', async () => {
      const errorApi = {
        removeUserFromGroup: async () => {
          throw new Error('Permission denied');
        },
      };
      const context = { ...mockToolContext, api: errorApi, threadId: mockGroupId };

      const result = await kickMemberTool.execute({ userId: mockUserId }, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lỗi kick');
    });
  });

  // ═══════════════════════════════════════════════════
  // GET PENDING MEMBERS
  // ═══════════════════════════════════════════════════

  describe('getPendingMembers', () => {
    test('lấy danh sách chờ duyệt thành công', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: mockGroupId };

      const result = await getPendingMembersTool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(2);
      expect(result.data.members).toHaveLength(2);
      expect(result.data.summary).toContain('Pending User 1');
      expect(result.data.hint).toContain('reviewPendingMembers');
    });

    test('trả về thông báo khi không có ai chờ', async () => {
      const emptyApi = {
        getPendingGroupMembers: async () => ({ users: [] }),
      };
      const context = { ...mockToolContext, api: emptyApi, threadId: mockGroupId };

      const result = await getPendingMembersTool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(0);
      expect(result.data.summary).toContain('Không có ai');
    });

    test('xử lý API error', async () => {
      const errorApi = {
        getPendingGroupMembers: async () => {
          throw new Error('Not admin');
        },
      };
      const context = { ...mockToolContext, api: errorApi, threadId: mockGroupId };

      const result = await getPendingMembersTool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lỗi lấy danh sách');
    });
  });

  // ═══════════════════════════════════════════════════
  // REVIEW PENDING MEMBERS
  // ═══════════════════════════════════════════════════

  describe('reviewPendingMembers', () => {
    test('duyệt thành viên thành công', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: mockGroupId };

      const result = await reviewPendingMembersTool.execute(
        {
          memberIds: ['pending-1', 'pending-2'],
          isApprove: true,
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data.memberIds).toEqual(['pending-1', 'pending-2']);
      expect(result.data.action).toBe('approved');
      expect(result.data.message).toContain('duyệt');
    });

    test('từ chối thành viên thành công', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: mockGroupId };

      const result = await reviewPendingMembersTool.execute(
        {
          memberIds: ['pending-1'],
          isApprove: false,
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('rejected');
      expect(result.data.message).toContain('từ chối');
    });

    test('lỗi khi memberIds rỗng', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: mockGroupId };

      const result = await reviewPendingMembersTool.execute(
        {
          memberIds: [],
          isApprove: true,
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('userId');
    });

    test('lỗi khi thiếu isApprove', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: mockGroupId };

      const result = await reviewPendingMembersTool.execute(
        {
          memberIds: ['pending-1'],
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('isApprove');
    });

    test('xử lý API error', async () => {
      const errorApi = {
        reviewPendingMemberRequest: async () => {
          throw new Error('Permission denied');
        },
      };
      const context = { ...mockToolContext, api: errorApi, threadId: mockGroupId };

      const result = await reviewPendingMembersTool.execute(
        {
          memberIds: ['pending-1'],
          isApprove: true,
        },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lỗi duyệt');
    });
  });

  // ═══════════════════════════════════════════════════
  // GET GROUP LINK DETAIL
  // ═══════════════════════════════════════════════════

  describe('getGroupLinkDetail', () => {
    test('lấy link nhóm thành công', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: mockGroupId };

      const result = await getGroupLinkDetailTool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data.link).toContain('zalo.me/g/');
      expect(result.data.enabled).toBe(true);
      expect(result.data.message).toContain('Link nhóm');
    });

    test('lấy link với groupId cụ thể', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: mockGroupId };

      const result = await getGroupLinkDetailTool.execute({ groupId: mockGroupId }, context);

      expect(result.success).toBe(true);
      expect(result.data.groupId).toBe(mockGroupId);
    });

    test('trả về thông báo khi link chưa bật', async () => {
      const disabledLinkApi = {
        getGroupLinkDetail: async () => ({
          link: '',
          enabled: 0,
          expiration_date: 0,
        }),
      };
      const context = { ...mockToolContext, api: disabledLinkApi, threadId: mockGroupId };

      const result = await getGroupLinkDetailTool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data.enabled).toBe(false);
      expect(result.data.link).toBeNull();
    });

    test('hiển thị thời gian hết hạn', async () => {
      const expiringLinkApi = {
        getGroupLinkDetail: async () => ({
          link: 'https://zalo.me/g/expiring',
          enabled: 1,
          expiration_date: Math.floor(Date.now() / 1000) + 86400, // 1 ngày sau
        }),
      };
      const context = { ...mockToolContext, api: expiringLinkApi, threadId: mockGroupId };

      const result = await getGroupLinkDetailTool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data.expirationInfo).not.toBe('Vĩnh viễn');
    });

    test('xử lý API error', async () => {
      const errorApi = {
        getGroupLinkDetail: async () => {
          throw new Error('Not admin');
        },
      };
      const context = { ...mockToolContext, api: errorApi, threadId: mockGroupId };

      const result = await getGroupLinkDetailTool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lỗi lấy link');
    });
  });

  // ═══════════════════════════════════════════════════
  // GET GROUP LINK INFO
  // ═══════════════════════════════════════════════════

  describe('getGroupLinkInfo', () => {
    test('lấy thông tin từ link thành công', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: mockGroupId };

      const result = await getGroupLinkInfoTool.execute(
        { link: 'https://zalo.me/g/abc123' },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data.groupId).toBe(mockGroupId);
      expect(result.data.groupName).toBe('Test Group');
      expect(result.data.memberCount).toBe(50);
    });

    test('lỗi khi thiếu link', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: mockGroupId };

      const result = await getGroupLinkInfoTool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('link');
    });

    test('lỗi khi link không hợp lệ', async () => {
      const context = { ...mockToolContext, api: mockApi, threadId: mockGroupId };

      const result = await getGroupLinkInfoTool.execute(
        { link: 'https://facebook.com/group' },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('không hợp lệ');
    });

    test('xử lý API error', async () => {
      const errorApi = {
        getGroupLinkInfo: async () => {
          throw new Error('Invalid link');
        },
      };
      const context = { ...mockToolContext, api: errorApi, threadId: mockGroupId };

      const result = await getGroupLinkInfoTool.execute(
        { link: 'https://zalo.me/g/invalid' },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
