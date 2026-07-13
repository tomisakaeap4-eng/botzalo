/**
 * Social Module - Basic group management, polls, notes, reminders, user lookup
 *
 * Positioning: Product/marketing/comms bot with basic group mgmt — không phải admin-bot.
 */
import { BaseModule, type ITool, type ModuleMetadata } from '../../core/index.js';
import {
  createNoteTool,
  createPollTool,
  createReminderTool,
  editNoteTool,
  // Group Admin - keep 6 tools
  getGroupInfoTool,
  getGroupLinkDetailTool,
  getGroupLinkInfoTool,
  getGroupMembersTool,
  getListBoardTool,
  getPendingMembersTool,
  getPollDetailTool,
  getReminderTool,
  getUserInfoTool,
  kickMemberTool,
  lockPollTool,
  removeReminderTool,
  reviewPendingMembersTool,
} from './tools/index.js';

export class SocialModule extends BaseModule {
  readonly metadata: ModuleMetadata = {
    name: 'social',
    description: 'Social tools for basic group management, polls, notes, and reminders',
    version: '2.0.0',
  };

  private _tools: ITool[] = [
    // User lookup
    getUserInfoTool,
    getGroupMembersTool,
    // Poll (no votePoll — chỉ user vote)
    createPollTool,
    getPollDetailTool,
    lockPollTool,
    // Board/Note
    createNoteTool,
    getListBoardTool,
    editNoteTool,
    // Reminder
    createReminderTool,
    getReminderTool,
    removeReminderTool,
    // Group Admin - Info
    getGroupInfoTool,
    // Group Admin - Member Management (basic)
    kickMemberTool,
    getPendingMembersTool,
    reviewPendingMembersTool,
    // Group Admin - Link (chỉ đọc link, không enable/disable)
    getGroupLinkDetailTool,
    getGroupLinkInfoTool,
  ];

  get tools(): ITool[] {
    return this._tools;
  }

  async onLoad(): Promise<void> {
    console.log(`[Social] 👥 Loading ${this._tools.length} social tools`);
  }
}

export const socialModule = new SocialModule();
export * from './tools/index.js';
