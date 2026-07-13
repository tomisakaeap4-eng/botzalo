/**
 * App Module - Đăng ký và khởi tạo các modules
 */
import { container, eventBus, moduleManager, Services } from '../core/index.js';
import { databaseService } from '../infrastructure/database/index.js';

// Import module instances
import { gatewayModule } from '../modules/gateway/gateway.module.js';
import { mediaModule } from '../modules/media/media.module.js';
import { socialModule } from '../modules/social/social.module.js';

/**
 * Đăng ký tất cả modules vào ModuleManager
 */
export async function registerModules(): Promise<void> {
  // Initialize database first
  databaseService.init();
  container.register(Services.DATABASE, databaseService);

  // Register core services
  container.register(Services.EVENT_BUS, eventBus);
  container.register(Services.MODULE_MANAGER, moduleManager);

  // Register modules (thứ tự quan trọng nếu có dependencies)
  await moduleManager.register(gatewayModule);
  await moduleManager.register(mediaModule);
  await moduleManager.register(socialModule);
}

/**
 * Load tất cả modules
 */
export async function loadModules(): Promise<void> {
  await moduleManager.loadAll();
}

/**
 * Khởi tạo app (register + load)
 */
export async function initializeApp(): Promise<void> {
  await registerModules();
  await loadModules();
}

// Export module instances for direct access
// Export module manager
export { gatewayModule, mediaModule, moduleManager, socialModule };
