/**
 * Task Module - Code execution, math, scheduling
 */
import { BaseModule, type ITool, type ModuleMetadata } from '../../core/index.js';
import { flushLogsTool, solveMathTool } from './tools/index.js';

export class TaskModule extends BaseModule {
  readonly metadata: ModuleMetadata = {
    name: 'task',
    description: 'Task tools for math solving and log flushing',
    version: '1.0.0',
  };

  private _tools: ITool[] = [solveMathTool, flushLogsTool];

  get tools(): ITool[] {
    return this._tools;
  }

  async onLoad(): Promise<void> {
    console.log(`[Task] ⚡ Loading ${this._tools.length} task tools`);
  }
}

export const taskModule = new TaskModule();
export * from './tools/index.js';
