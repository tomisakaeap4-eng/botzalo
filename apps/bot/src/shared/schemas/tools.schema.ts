/**
 * Tool Schemas - Zod validation cho tool parameters
 *
 * Phase 2: chỉ giữ 18 tools cho bot product/marketing/comms.
 * Đã bỏ: clearHistory, createChart, createFile, getAllFriends, getFriendOnlines,
 *        findUserByPhone, sendFriendRequest, forwardMessage, joinGroupLink,
 *        leaveGroup, disperseGroup, createGroup, votePoll, qrCode, solveMath,
 *        flush_logs, enableGroupLink, disableGroupLink, changeGroupOwner,
 *        removeGroupDeputy, addGroupDeputy, changeGroupName, changeGroupAvatar,
 *        updateGroupSettings, blockMember, addMember.
 */
import { z } from 'zod';

// ============ MICROSOFT EDGE TTS ============

export const TextToSpeechSchema = z.object({
  text: z.string().min(1, 'Thiếu văn bản cần đọc').max(5000, 'Văn bản quá dài (tối đa 5000 ký tự)'),
  voice: z.string().optional().describe('Mã giọng đọc, vd: vi-VN-HoaiMyNeural'),
  rate: z.string().optional().describe('Tốc độ đọc, vd: "+0%", "-10%", "+50%"'),
  volume: z.string().optional().describe('Âm lượng, vd: "+0%", "+50%"'),
  pitch: z.string().optional().describe('Cao độ, vd: "+0Hz", "-10Hz"'),
});

// ============ USER LOOKUP ============

export const GetUserInfoSchema = z.object({
  userId: z.string().optional(),
});

export const GetGroupMembersSchema = z.object({});

// ============ POLL ============

export const CreatePollSchema = z.object({
  question: z.string().min(1, 'Thiếu câu hỏi bình chọn'),
  options: z.array(z.string()).min(2, 'Cần ít nhất 2 lựa chọn'),
  expiredTime: z.coerce.number().default(0),
  allowMultiChoices: z.boolean().default(false),
  allowAddNewOption: z.boolean().default(false),
  hideVotePreview: z.boolean().default(false),
  isAnonymous: z.boolean().default(false),
});

export const GetPollDetailSchema = z.object({
  pollId: z.coerce.number().min(1, 'Thiếu pollId'),
});

export const LockPollSchema = z.object({
  pollId: z.coerce.number().min(1, 'Thiếu pollId'),
});

// ============ BOARD/NOTE ============

export const CreateNoteSchema = z.object({
  title: z.string().min(1, 'Thiếu nội dung ghi chú'),
  pinAct: z.boolean().default(true),
});

export const GetListBoardSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  count: z.coerce.number().min(1).max(50).default(20),
});

export const EditNoteSchema = z.object({
  topicId: z.string().min(1, 'Thiếu topicId'),
  title: z.string().min(1, 'Thiếu nội dung mới'),
  pinAct: z.boolean().default(true),
});

// ============ REMINDER ============

const REMINDER_REPEAT_MODES = ['none', 'daily', 'weekly', 'monthly'] as const;

export const CreateReminderSchema = z.object({
  title: z.string().min(1, 'Thiếu tiêu đề nhắc nhở'),
  startTime: z.coerce.number().min(1, 'Thiếu thời gian nhắc (Unix timestamp ms)'),
  repeat: z.enum(REMINDER_REPEAT_MODES).default('none'),
});

export const GetReminderSchema = z.object({
  reminderId: z.string().min(1, 'Thiếu reminderId'),
});

export const RemoveReminderSchema = z.object({
  reminderId: z.string().min(1, 'Thiếu reminderId'),
});

// ============ GROUP ADMIN (basic only) ============

export const GetGroupInfoSchema = z.object({});

export const KickMemberSchema = z.object({
  userId: z.string().min(1, 'Thiếu userId của thành viên cần kick'),
});

export const ReviewPendingMembersSchema = z.object({
  memberIds: z.array(z.string()).min(1, 'Cần ít nhất 1 userId'),
  isApprove: z.boolean().describe('true = Duyệt, false = Từ chối'),
});

export const GetGroupLinkInfoSchema = z.object({
  link: z.string().min(1, 'Thiếu link nhóm'),
});

export const GetGroupLinkDetailSchema = z.object({
  groupId: z.string().optional().describe('ID nhóm cần lấy link (mặc định: threadId hiện tại)'),
});

// ============ HELPER FUNCTION ============

/**
 * Ví dụ cấu trúc đúng cho từng tool - giúp AI tránh ảo giác.
 * Phase 2: 18 tools only.
 */
export const TOOL_EXAMPLES: Record<string, string> = {
  // Utility
  textToSpeech: `[tool:textToSpeech]{"text":"Xin chào"}[/tool]`,

  // User/Group lookup
  getUserInfo: `[tool:getUserInfo]{"userId":"123"}[/tool]`,
  getGroupMembers: `[tool:getGroupMembers]{}[/tool]`,

  // Poll tools
  createPoll: `[tool:createPoll]{"question":"Trưa ăn gì?","options":["Cơm","Phở","Bún"],"allowMultiChoices":true}[/tool]`,
  getPollDetail: `[tool:getPollDetail]{"pollId":123456}[/tool]`,
  lockPoll: `[tool:lockPoll]{"pollId":123456}[/tool]`,

  // Board/Note tools
  createNote: `[tool:createNote]{"title":"🚨 THÔNG BÁO: Mai họp lúc 8h","pinAct":true}[/tool]`,
  getListBoard: `[tool:getListBoard]{"page":1,"count":20}[/tool]`,
  editNote: `[tool:editNote]{"topicId":"topic_123","title":"Nội dung mới","pinAct":true}[/tool]`,

  // Reminder tools
  createReminder: `[tool:createReminder]{"title":"Deadline nộp báo cáo","startTime":1733580000000,"repeat":"none"}[/tool]`,
  getReminder: `[tool:getReminder]{"reminderId":"reminder_123"}[/tool]`,
  removeReminder: `[tool:removeReminder]{"reminderId":"reminder_123"}[/tool]`,

  // Group Admin (basic)
  getGroupInfo: `[tool:getGroupInfo]{}[/tool]`,
  kickMember: `[tool:kickMember]{"userId":"123456789"}[/tool]`,
  getPendingMembers: `[tool:getPendingMembers]{}[/tool]`,
  reviewPendingMembers: `[tool:reviewPendingMembers]{"memberIds":["uid1","uid2"],"isApprove":true}[/tool]`,
  getGroupLinkInfo: `[tool:getGroupLinkInfo]{"link":"https://zalo.me/g/abc123"}[/tool]`,
  getGroupLinkDetail: `[tool:getGroupLinkDetail]{}[/tool]`,
};

/**
 * Validate params với Zod schema
 */
export function validateParams<T>(
  schema: z.ZodSchema<T>,
  params: unknown,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(params);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues[0]?.message || 'Tham số không hợp lệ',
    };
  }
  return { success: true, data: result.data };
}

/**
 * Validate params và trả về error kèm ví dụ cấu trúc đúng
 * Giúp AI tránh ảo giác khi gọi tool sai cấu trúc
 */
export function validateParamsWithExample<T>(
  schema: z.ZodSchema<T>,
  params: unknown,
  toolName: string,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(params);
  if (!result.success) {
    const errorMsg = result.error.issues[0]?.message || 'Tham số không hợp lệ';
    const example = TOOL_EXAMPLES[toolName];
    const errorWithExample = example ? `${errorMsg}\n\n📝 Cấu trúc đúng:\n${example}` : errorMsg;
    return {
      success: false,
      error: errorWithExample,
    };
  }
  return { success: true, data: result.data };
}

// Type exports
export type TextToSpeechParams = z.infer<typeof TextToSpeechSchema>;
export type GetUserInfoParams = z.infer<typeof GetUserInfoSchema>;
export type GetGroupMembersParams = z.infer<typeof GetGroupMembersSchema>;

// Poll types
export type CreatePollParams = z.infer<typeof CreatePollSchema>;
export type GetPollDetailParams = z.infer<typeof GetPollDetailSchema>;
export type LockPollParams = z.infer<typeof LockPollSchema>;

// Board/Note types
export type CreateNoteParams = z.infer<typeof CreateNoteSchema>;
export type GetListBoardParams = z.infer<typeof GetListBoardSchema>;
export type EditNoteParams = z.infer<typeof EditNoteSchema>;

// Reminder types
export type CreateReminderParams = z.infer<typeof CreateReminderSchema>;
export type GetReminderParams = z.infer<typeof GetReminderSchema>;
export type RemoveReminderParams = z.infer<typeof RemoveReminderSchema>;

// Group Admin types
export type GetGroupInfoParams = z.infer<typeof GetGroupInfoSchema>;
export type KickMemberParams = z.infer<typeof KickMemberSchema>;
export type ReviewPendingMembersParams = z.infer<typeof ReviewPendingMembersSchema>;
export type GetGroupLinkInfoParams = z.infer<typeof GetGroupLinkInfoSchema>;
export type GetGroupLinkDetailParams = z.infer<typeof GetGroupLinkDetailSchema>;
