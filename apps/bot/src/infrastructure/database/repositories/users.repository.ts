/**
 * Users Repository - Quản lý người dùng và quyền (user/admin/blocked)
 *
 * Dùng raw SQL queries vì bảng `users` được tạo bởi auto-migration
 * trong `connection.ts` (xem CREATE TABLE IF NOT EXISTS users(...)) và
 * chưa có Drizzle schema mapping. Khi migrate sang Drizzle thì refactor
 * sang typed schema như `history.repository.ts` / `sent-messages.repository.ts`.
 */

import type { Database } from 'bun:sqlite';
import { debugLog } from '../../../core/logger/logger.js';
import { getSqliteDb } from '../connection.js';

export interface UserRecord {
  user_id: string;
  name: string | null;
  role: 'admin' | 'user' | 'blocked' | null;
  created_at: number;
}

export type UserRole = 'admin' | 'user' | 'blocked';

/**
 * Repository singleton — dùng getter lazy để tránh calling `getSqliteDb()`
 * ở module load time. Mục đích: khi test `import { usersRepository }` mà
 * chưa gọi `.getUser(u)` / `.upsertUser(u)` thì không tự tạo `data/bot.db`.
 *
 * Lưu ý: phù hợp với pattern ESM strict (no lazy `require` cũ).
 */
class UsersRepository {
  private get db(): Database {
    return getSqliteDb();
  }

  /**
   * Lấy user theo id. Trả về null nếu chưa có.
   */
  async getUser(userId: string): Promise<UserRecord | null> {
    try {
      const row = this.db
        .query('SELECT user_id, name, role, created_at FROM users WHERE user_id = ?')
        .get(userId) as UserRecord | undefined;
      return row ?? null;
    } catch (err) {
      debugLog('USERS', `getUser(${userId}) error: ${err}`);
      return null;
    }
  }

  /**
   * Upsert user. Nếu đã có thì update name + role; nếu chưa thì insert mới.
   *
   * @returns true nếu thành công
   */
  async upsertUser(
    userId: string,
    fields: { name?: string | null; role?: UserRole } = {},
  ): Promise<boolean> {
    try {
      const existing = await this.getUser(userId);
      if (existing) {
        const newName = fields.name !== undefined ? fields.name : existing.name;
        const newRole = fields.role ?? existing.role ?? 'user';
        this.db
          .query('UPDATE users SET name = ?, role = ? WHERE user_id = ?')
          .run(newName, newRole, userId);
        debugLog('USERS', `Updated user ${userId} (name=${newName}, role=${newRole})`);
      } else {
        this.db
          .query('INSERT INTO users (user_id, name, role, created_at) VALUES (?, ?, ?, ?)')
          .run(userId, fields.name ?? null, fields.role ?? 'user', Date.now());
        debugLog('USERS', `Inserted user ${userId} (role=${fields.role ?? 'user'})`);
      }
      return true;
    } catch (err) {
      debugLog('USERS', `upsertUser(${userId}) error: ${err}`);
      return false;
    }
  }
}

// Singleton instance (DB connection mở lazily trên method đầu tiên).
export const usersRepository = new UsersRepository();
