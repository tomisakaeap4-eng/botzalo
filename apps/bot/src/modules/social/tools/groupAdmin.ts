/**
 * Group Admin Tools - Quản trị nhóm Zalo (basic only)
 * Phase 2: chỉ giữ info + kick + pending review + link read.
 * Đã bỏ: block/add member, settings, roles (deputy/owner), link enable/disable, lifecycle (create/join/leave/disperse).
 */

import { debugLog, logZaloAPI } from '../../../core/logger/logger.js';
import type { ToolContext, ToolDefinition, ToolResult } from '../../../shared/types/tools.types.js';
import { getThreadType } from '../../../shared/utils/message/messageSender.js';

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

/**
 * Kiểm tra xem context có phải là nhóm chat không
 * ThreadType: 0 = User (1-1), 1 = Group
 */
function isGroupContext(threadId: string): boolean {
  const threadType = getThreadType(threadId);
  return threadType === 1;
}

/**
 * Trả về lỗi khi tool được gọi trong ngữ cảnh 1-1 (không phải nhóm)
 */
function notGroupError(): ToolResult {
  return {
    success: false,
    error:
      'Tool này chỉ hoạt động trong nhóm chat. Bạn đang chat 1-1 với bot. Hãy sử dụng tool này trong một nhóm cụ thể hoặc cung cấp Group ID.',
  };
}

// ═══════════════════════════════════════════════════
// GROUP INFO
// ═══════════════════════════════════════════════════

export const getGroupInfoTool: ToolDefinition = {
  name: 'getGroupInfo',
  description:
    'Lấy toàn bộ thông tin chi tiết về nhóm: tên, người tạo (creatorId), danh sách admin (adminIds), cài đặt nhóm (setting), số thành viên. Dùng trước khi thực hiện các tác vụ quản trị.',
  parameters: [],
  execute: async (_params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      debugLog('TOOL:getGroupInfo', `Getting group info for ${context.threadId}`);

      const groupInfo = await context.api.getGroupInfo(context.threadId);
      logZaloAPI('tool:getGroupInfo', { threadId: context.threadId }, groupInfo);

      const info = groupInfo?.gridInfoMap?.[context.threadId];

      if (!info) {
        return {
          success: false,
          error: 'Không tìm thấy thông tin nhóm. Có thể đây không phải là nhóm chat.',
        };
      }

      const adminIds = info.adminIds || [];
      const creatorId = info.creatorId;
      const memberCount = info.memberIds?.length || info.currentMems?.length || 0;

      const settings = info.setting || {};
      const settingsSummary = [
        `- Chặn đổi tên/ảnh: ${settings.blockName ? 'Bật' : 'Tắt'}`,
        `- Đánh dấu tin admin: ${settings.signAdminMsg ? 'Bật' : 'Tắt'}`,
        `- Phê duyệt thành viên: ${settings.joinAppr ? 'Bật' : 'Tắt'}`,
        `- Khóa chat (chỉ admin): ${settings.lockSendMsg ? 'Bật' : 'Tắt'}`,
        `- Chặn tạo ghi chú: ${settings.lockCreatePost ? 'Bật' : 'Tắt'}`,
        `- Chặn tạo bình chọn: ${settings.lockCreatePoll ? 'Bật' : 'Tắt'}`,
      ].join('\n');

      return {
        success: true,
        data: {
          groupId: context.threadId,
          name: info.name || 'Không tên',
          creatorId,
          adminIds,
          memberCount,
          settings,
          settingsSummary,
          description: info.desc || '',
          avatar: info.avt || info.avatar,
          link: info.link,
          raw: info,
          hint: 'Dùng creatorId và adminIds để biết ai có quyền quản trị. Dùng getGroupMembers để lấy danh sách thành viên chi tiết.',
        },
      };
    } catch (error: any) {
      debugLog('TOOL:getGroupInfo', `Error: ${error.message}`);
      return { success: false, error: `Lỗi lấy thông tin nhóm: ${error.message}` };
    }
  },
};

// ═══════════════════════════════════════════════════
// KICK MEMBER (basic)
// ═══════════════════════════════════════════════════

export const kickMemberTool: ToolDefinition = {
  name: 'kickMember',
  description:
    'Kick (mời ra) thành viên khỏi nhóm. Bot phải là Trưởng nhóm hoặc Phó nhóm. Chỉ hoạt động trong nhóm.',
  parameters: [
    {
      name: 'userId',
      type: 'string',
      description: 'ID của thành viên cần kick (lấy từ getGroupMembers hoặc context.senderId)',
      required: true,
    },
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      if (!isGroupContext(context.threadId)) {
        return notGroupError();
      }

      const { userId } = params;

      if (!userId) {
        return { success: false, error: 'Thiếu userId của thành viên cần kick' };
      }

      debugLog('TOOL:kickMember', `Kicking user ${userId} from group ${context.threadId}`);

      const result = await context.api.removeUserFromGroup(String(userId), context.threadId);
      logZaloAPI('tool:kickMember', { userId, threadId: context.threadId }, result);

      return {
        success: true,
        data: {
          userId,
          message: `Đã kick thành viên ${userId} ra khỏi nhóm`,
        },
      };
    } catch (error: any) {
      debugLog('TOOL:kickMember', `Error: ${error.message}`);
      return { success: false, error: `Lỗi kick thành viên: ${error.message}` };
    }
  },
};

// ═══════════════════════════════════════════════════
// PENDING MEMBERS (basic)
// ═══════════════════════════════════════════════════

export const getPendingMembersTool: ToolDefinition = {
  name: 'getPendingMembers',
  description:
    'Lấy danh sách thành viên đang chờ duyệt vào nhóm (khi nhóm bật chế độ phê duyệt). Bot phải là Admin.',
  parameters: [],
  execute: async (_params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      debugLog('TOOL:getPendingMembers', `Getting pending members for group ${context.threadId}`);

      const result = await context.api.getPendingGroupMembers(context.threadId);
      logZaloAPI('tool:getPendingMembers', { threadId: context.threadId }, result);

      const rawUsers = result?.users || result?.pendingMembers || result?.members || [];

      const pendingList = rawUsers.map((user: any) => ({
        id: user.uid || user.id,
        name: user.dpn || user.dName || user.displayName || 'Không tên',
        avatar: user.avatar,
      }));

      const summary = pendingList.length
        ? pendingList.map((m: any) => `- ${m.name} (ID: ${m.id})`).join('\n')
        : 'Không có ai đang chờ duyệt';

      return {
        success: true,
        data: {
          count: pendingList.length,
          members: pendingList,
          summary,
          hint:
            pendingList.length > 0
              ? `Dùng reviewPendingMembers với memberIds=[${pendingList.map((m: any) => `"${m.id}"`).join(', ')}] và isApprove=true để duyệt`
              : 'Không có thành viên nào đang chờ duyệt',
        },
      };
    } catch (error: any) {
      debugLog('TOOL:getPendingMembers', `Error: ${error.message}`);
      return { success: false, error: `Lỗi lấy danh sách chờ duyệt: ${error.message}` };
    }
  },
};

export const reviewPendingMembersTool: ToolDefinition = {
  name: 'reviewPendingMembers',
  description:
    'Duyệt hoặc từ chối thành viên đang chờ vào nhóm. Bot phải là Admin. Dùng getPendingMembers để lấy danh sách trước.',
  parameters: [
    {
      name: 'memberIds',
      type: 'object',
      description: 'Mảng ID các thành viên cần duyệt/từ chối (VD: ["uid1", "uid2"])',
      required: true,
    },
    {
      name: 'isApprove',
      type: 'boolean',
      description: 'true = Duyệt vào nhóm, false = Từ chối',
      required: true,
    },
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      const { memberIds, isApprove } = params;

      if (!Array.isArray(memberIds) || memberIds.length === 0) {
        return { success: false, error: 'Cần ít nhất 1 userId trong memberIds' };
      }

      if (typeof isApprove !== 'boolean') {
        return { success: false, error: 'isApprove phải là true (duyệt) hoặc false (từ chối)' };
      }

      debugLog(
        'TOOL:reviewPendingMembers',
        `Reviewing ${memberIds.length} members, approve=${isApprove}`,
      );

      const payload = {
        members: memberIds.map(String),
        isApprove,
      };

      const result = await context.api.reviewPendingMemberRequest(payload, context.threadId);
      logZaloAPI('tool:reviewPendingMembers', { payload, threadId: context.threadId }, result);

      const statusMessages: Record<number, string> = {
        0: 'Thành công',
        170: 'Không có trong danh sách chờ',
        178: 'Đã là thành viên nhóm',
        166: 'Không đủ quyền',
      };

      const results: { id: string; status: string }[] = [];
      let successCount = 0;

      if (result && typeof result === 'object') {
        for (const [memberId, status] of Object.entries(result)) {
          const statusCode = status as number;
          const statusText = statusMessages[statusCode] || `Lỗi không xác định (${statusCode})`;
          results.push({ id: memberId, status: statusText });
          if (statusCode === 0) successCount++;
        }
      }

      return {
        success: true,
        data: {
          memberIds,
          action: isApprove ? 'approved' : 'rejected',
          successCount,
          totalCount: memberIds.length,
          results,
          message: `Đã ${isApprove ? 'duyệt' : 'từ chối'} ${successCount}/${memberIds.length} thành viên`,
        },
      };
    } catch (error: any) {
      debugLog('TOOL:reviewPendingMembers', `Error: ${error.message}`);
      return { success: false, error: `Lỗi duyệt thành viên: ${error.message}` };
    }
  },
};

// ═══════════════════════════════════════════════════
// GROUP LINK (read-only)
// ═══════════════════════════════════════════════════

export const getGroupLinkDetailTool: ToolDefinition = {
  name: 'getGroupLinkDetail',
  description:
    'Lấy đường dẫn chia sẻ (Invite Link) của nhóm. Link có dạng https://zalo.me/g/... Bot phải là thành viên nhóm.',
  parameters: [
    {
      name: 'groupId',
      type: 'string',
      description: 'ID của nhóm cần lấy link. Nếu không truyền, sẽ dùng threadId hiện tại.',
      required: false,
    },
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      const groupId = params.groupId || context.threadId;

      if (!isGroupContext(groupId)) {
        return notGroupError();
      }

      debugLog('TOOL:getGroupLinkDetail', `Getting group link for ${groupId}`);

      const result = await context.api.getGroupLinkDetail(groupId);
      logZaloAPI('tool:getGroupLinkDetail', { groupId }, result);

      if (!result?.link || result?.enabled === 0) {
        return {
          success: true,
          data: {
            groupId,
            enabled: false,
            link: null,
            message: 'Nhóm chưa bật tính năng tham gia bằng link. Hãy vào cài đặt nhóm trên Zalo để bật.',
          },
        };
      }

      let expirationInfo = 'Vĩnh viễn';
      if (result.expiration_date && result.expiration_date > 0) {
        const expDate = new Date(result.expiration_date * 1000);
        expirationInfo = expDate.toLocaleString('vi-VN');
      }

      return {
        success: true,
        data: {
          groupId,
          link: result.link,
          enabled: result.enabled === 1,
          expirationDate: result.expiration_date,
          expirationInfo,
          message: `Link nhóm: ${result.link}`,
        },
      };
    } catch (error: any) {
      debugLog('TOOL:getGroupLinkDetail', `Error: ${error.message}`);
      return { success: false, error: `Lỗi lấy link nhóm: ${error.message}` };
    }
  },
};

export const getGroupLinkInfoTool: ToolDefinition = {
  name: 'getGroupLinkInfo',
  description: 'Lấy thông tin nhóm từ đường link chia sẻ (zalo.me/g/...). Không cần quyền admin.',
  parameters: [
    {
      name: 'link',
      type: 'string',
      description: 'Link nhóm Zalo (VD: https://zalo.me/g/abc123)',
      required: true,
    },
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      const { link } = params;

      if (!link || typeof link !== 'string') {
        return { success: false, error: 'Thiếu link nhóm' };
      }

      if (!link.includes('zalo.me/g/')) {
        return {
          success: false,
          error: 'Link không hợp lệ. Link phải có dạng https://zalo.me/g/...',
        };
      }

      debugLog('TOOL:getGroupLinkInfo', `Getting info for link: ${link}`);

      const result = await context.api.getGroupLinkInfo({ link });
      logZaloAPI('tool:getGroupLinkInfo', { link }, result);

      const adminIds = result?.adminIds || [];
      const memberCount = result?.totalMember || result?.currentMems?.length || 0;

      return {
        success: true,
        data: {
          groupId: result?.groupId,
          groupName: result?.name,
          description: result?.desc || '',
          memberCount,
          creatorId: result?.creatorId,
          adminIds,
          avatar: result?.avt || result?.fullAvt,
          type: result?.type,
          setting: result?.setting,
          members: result?.currentMems?.map((m: any) => ({
            id: m.id,
            name: m.dName || m.zaloName,
            avatar: m.avatar,
          })),
          hasMoreMember: result?.hasMoreMember === 1,
          raw: result,
        },
      };
    } catch (error: any) {
      debugLog('TOOL:getGroupLinkInfo', `Error: ${error.message}`);

      const errorMsg = error.message || '';
      if (errorMsg.includes('Tham số không hợp lệ') || errorMsg.includes('Invalid')) {
        return {
          success: false,
          error:
            'Link nhóm không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại link (phải có dạng https://zalo.me/g/xxx)',
        };
      }

      return { success: false, error: `Lỗi lấy thông tin link: ${error.message}` };
    }
  },
};
