/**
 * Media Module - Text-to-speech utility
 */
import { BaseModule, type ITool, type ModuleMetadata } from '../../core/index.js';
import { textToSpeechTool } from './tools/index.js';

export class MediaModule extends BaseModule {
  readonly metadata: ModuleMetadata = {
    name: 'media',
    description: 'Text-to-speech utility (Microsoft Edge TTS)',
    version: '1.0.0',
  };

  private _tools: ITool[] = [textToSpeechTool];

  get tools(): ITool[] {
    return this._tools;
  }

  async onLoad(): Promise<void> {
    console.log(`[Media] 🎤 Loading ${this._tools.length} media tools`);
  }
}

export const mediaModule = new MediaModule();
export * from './tools/index.js';
