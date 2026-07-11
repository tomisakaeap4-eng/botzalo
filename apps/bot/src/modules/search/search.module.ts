/**
 * Search Module - Web search (You.com), Diffbot URL extract, YouTube
 */
import { BaseModule, type ITool, type ModuleMetadata } from '../../core/index.js';
import {
  youSearchTool,
  readUrlTool,
  youtubeChannelTool,
  youtubeSearchTool,
  youtubeVideoTool,
} from './tools/index.js';

export class SearchModule extends BaseModule {
  readonly metadata: ModuleMetadata = {
    name: 'search',
    description: 'Web search (You.com), Diffbot URL extraction, YouTube tools',
    version: '1.0.0',
  };

  private _tools: ITool[] = [
    youSearchTool,
    readUrlTool,
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
