/**
 * Gateway Handlers - Response và tool handling
 */

export { getThreadType, setThreadType } from '../../../shared/utils/message/messageSender.js';
export {
  createStreamCallbacks,
  sendResponse,
  setupSelfMessageListener,
} from './response.handler.js';

export {
  formatToolResultForAI,
  handleToolCalls,
  isToolOnlyResponse,
  notifyToolCall,
  type ToolHandlerResult,
} from './tool.handler.js';

export {
  handleAllToolOutputs,
  handleToolOutput,
  sendVoice,
} from './tool.output.handler.js';
