/**
 * Search Module - Web search (You.com) and YouTube tools
 */
import { BaseModule, type ITool, type ModuleMetadata } from '../../core/index.js';
import {
  youSearchTool,
  youtubeChannelTool,
  youtubeSearchTool,
  youtubeVideoTool,
} from './tools/index.js';

export class SearchModule extends BaseModule {
  readonly metadata: ModuleMetadata = {
    name: 'search',
    description: 'Web search (You.com) and YouTube tools',
    version: '1.0.0',
  };

  private _tools: ITool[] = [
    youSearchTool,
    youtubeSearchTool,
    youtubeVideoTool,
    youtubeChannelTool,
  ];

  get tools(): ITool[] {
    return this._tools;
  }

  async onLoad(): Promise<void> {
    console.log(`[Search] 🔍 Loading ${this._tools.length} search tools`);
  }
}

export const searchModule = new SearchModule();
export * from './tools/index.js';
