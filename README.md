# Zia — Zalo AI Chatbot (Phase 2)

**Product/promotion/marketing chatbot cho Zalo với basic group management — theo dõi dữ liệu qua Web Dashboard (Next.js 16).**

> Phase 2 refactor (2026): tinh gọn từ 44 tools (6 modules — admin-heavy) → **18 tools (2 modules — marketing-aligned)** phù hợp bot cho sản phẩm, quảng bá, và quản lý nhóm cơ bản.

Monorepo gồm 2 ứng dụng:

| App      | Mô tả                                     | Tech Stack                              |
| -------- | ----------------------------------------- | --------------------------------------- |
| `bot`    | AI chatbot Zalo chạy trên Bun            | Bun 1+, TypeScript 5+, zca-js, Google Gemini, SQLite (Drizzle ORM), Hono |
| `web`    | Dashboard quản lý bot qua REST API        | Next.js 16, React 19, TailwindCSS 4, Hono proxy |

Bot lắng nghe tin nhắn Zalo qua `zca-js`, chạy qua Google Gemini (mặc định `models/gemini-3.1-flash-lite`), gọi **18 tools trên 2 modules**, lưu lịch sử hội thoại vào SQLite, xuất voice qua Microsoft Edge TTS, và expose REST API cho web dashboard xem logs/stats/backup/đổi settings runtime.

---

## Tổng quan khả năng

- 🧠 **AI streaming real-time** với Gemini (multi-key rotation, tự retry khi 429/503) — `bot.useStreaming`, `gemini.thinkingBudget=8192`, `thinkingLevel='HIGH'`
- 🗂️ **2 modules — 18 tools** (đếm từ `apps/bot/src/modules/*/tools/index.ts`):
  `media` 1 (voice) · `social` 17 (group mgmt + polls/notes/reminders)
- 🧾 **Message buffering 2.5s** gom nhiều tin liên tiếp (`buffer.delayMs`)
- 📂 **Đa phương tiện**: text, ảnh, video, audio/voice, file → phân tích bằng Gemini
- 📢 **Marketing-friendly**:
  - 🎤 `textToSpeech` — đọc quảng cáo SP bằng giọng Neural
  - 📝 `createNote` — ghim thông báo KM/launch lên đầu nhóm
  - 📊 `createPoll` — khảo sát nhu cầu khách hàng
  - ⏰ `createReminder` — lên lịch flash-sale/webinar
- 🌐 **Web Dashboard** Next.js 16 + Hono proxy truy cập bot REST API
- 🐳 **Docker** + health check + base64 credentials cho Railway/Render
- 💤 **Sleep mode** tự động offline theo giờ (`bot.sleepMode`)
- 🔧 **Maintenance mode** với message tùy chỉnh (`bot.maintenanceMode`)
- 🛌 **Cloud Debug**: bot đọc và xử lý tin nhắn tự gửi có prefix `#bot` (`bot.cloudDebug.prefix`)

---

## Yêu cầu hệ thống

- **Bun** 1.0+ (runtime chính)
- **Node** ≥ 18 (fallback runtime / dev optional)
- **Gemini API Key** (một hoặc nhiều key, hỗ trợ rotation)
- **Tài khoản Zalo** để QR-login lần đầu

---

## Cài đặt

```bash
git clone https://github.com/your-org/zia.git
cd zia
bun install                                                # cài deps (lấy từ package.json)
cp apps/bot/.env.example apps/bot/.env                    # tạo file env (xem "Cấu hình")
bun run --cwd apps/bot db:migrate                         # chạy Drizzle migrations
bun run dev:bot                                            # khởi động, quét QR từ apps/bot/qr.png
```

Sau khi quét QR, credentials tự lưu `apps/bot/credentials.json` cho các lần sau.

### Chạy web dashboard

```bash
bun run dev:web                                            # http://localhost:3000
bun run --cwd apps/web build
bun run --cwd apps/web start
```

### Các lệnh bot

```bash
bun run --cwd apps/bot dev                                 # hot reload
bun run --cwd apps/bot start                               # production
bun run --cwd apps/bot db:studio                           # mở Drizzle Studio
bun run --cwd apps/bot db:generate                         # generate migration
bun run --cwd apps/bot test                                # test toàn bộ
bun run --cwd apps/bot test:integration                    # integration tests
bun run --cwd apps/bot lint                                # biome lint
```

---

## Cấu hình

### Biến môi trường (`apps/bot/.env`)

| Biến                      | Bắt buộc | Mô tả                                                                                                |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`          | Bắt buộc | API key Gemini. Nhiều key: `key1,key2,key3` (một dòng) **HOẶC** `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, … (nhiều dòng, không giới hạn). Tự xoay khi 429. |
| `API_KEY`                 | Khuyến nghị | Bearer token cho TẤT CẢ `/api/*` endpoints. Có → bật Bearer auth; không có → API public (chỉ dev).   |
| `LOG_RECEIVER_ID`         | Tùy chọn | Zalo User ID nhận file log tự động (khi cache đủ 1000 dòng → flushLogs gửi qua Zalo). Note: `flush_logs` tool đã bị gỡ Phase 2, chỉ auto-flush còn lại. |
| `ZALO_CREDENTIALS_BASE64` | Tùy chọn | Cloud deploy: base64 của `credentials.json`. Dùng cho Railway/Render khi không có file vật lý.       |
| `PORT`                    | Tùy chọn | Port cho cả bot REST API + WebSocket. Mặc định `10000`.                                              |
| `NODE_ENV`                | Tùy chọn | `production` → bật một số guard trong logger (`apps/bot/src/core/logger/logger.ts`).                |
| `LOG_LEVEL`               | Tùy chọn | Pino log level. Mặc định `info`.                                                                      |
| `BOT_API_URL`             | Web only | URL của bot API để Next.js proxy (vd `http://localhost:10000/api`).                                  |
| `BOT_API_KEY`             | Web only | Khớp với `API_KEY` của bot để proxy authenticated.                                                  |
| `E2E_TEST_THREAD_ID`      | Test only | Dùng cho test integration E2E.                                                                       |
| `SKIP_EDGE_TTS`           | Test only | Set `true` để skip test TTS trong CI.                                                                 |
| `TEST_VERBOSE`            | Test only | Set `true` để in log chi tiết trong test setup.                                                      |

> `bun.lock` không bao gồm push lên remote (luôn `git restore --staged bun.lock` trước commit).

### Runtime settings (`apps/bot/settings.json`)

Validate bằng `apps/bot/src/core/config/config.schema.ts` (Zod). Thứ tự section `modules` đã được tinh gọn Phase 2:

| Section                                                  | Mô tả                                                                        | Default chính                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| `adminUserId`                                            | Hard-coded admin Zalo ID                                                      | `""`                                                  |
| `bot.name`                                              | Tên hiển thị khi khởi động                                                    | `"Trợ lý AI Zalo"`                                   |
| `bot.prefix` / `bot.requirePrefix`                       | Lệnh prefix (`#bot`)                                                          | `"#bot"`, `false`                                     |
| `bot.useStreaming`                                       | Trả lời từng phần real-time                                                  | `true`                                                |
| `bot.maxToolDepth`                                       | Số lần tool call lồng nhau tối đa                                              | `10`                                                  |
| `bot.maxInputTokens` / `bot.maxTokenHistory`             | Giới hạn token input / tổng context                                            | `200000` / `300000`                                   |
| `bot.selfListen`                                         | Bot có đọc tin nhắn tự gửi (Cloud Debug)                                     | `true`                                                |
| `bot.rateLimitMs`                                        | Debounce tin nhắn liên tiếp                                                   | `3000`                                                |
| `bot.cloudDebug.{enabled,prefix}`                        | Tin nhắn tự gửi có prefix                                                    | `false`, `"#bot"`                                    |
| `bot.sleepMode.{enabled,sleepHour,wakeHour}`            | Auto offline theo giờ                                                        | `false`, `23`, `6`                                    |
| `bot.maintenanceMode.{enabled,message}`                 | Chế độ bảo trì                                                              | `false`                                               |
| `bot.fileLogging` / `bot.logFile`                        | Có ghi log ra file không                                                     | `false`, `"logs/bot.txt"`                             |
| `buffer.delayMs` / `buffer.typingRefreshMs`            | Gom tin nhắn / giả lập "đang nhập"                                             | `2500` / `3000`                                       |
| `fetch.{timeoutMs,maxRetries,maxTextConvertSizeMB}`      | Tải URL/file                                                                  | `60000` / `3` / `20`                                 |
| `retry.{maxRetries,baseDelayMs,retryableStatusCodes}`    | Retry Gemini khi fail                                                        | `3` / `2000` / `[503,429,500,502,504]`                |
| `historyLoader.{enabled,loadFromDb,defaultLimit}`        | Preload lịch sử khi start                                                     | `true`, `true`, `100`                                 |
| **`modules.{media,social}`**                            | **Phase 2: chỉ 2 modules. Đã bỏ `chat`, `system`, `task`.**                  | `media: true, social: true`                            |
| `stickers.keywords`                                      | Từ khoá auto-suggest sticker                                                  | `[]`                                                  |
| `allowedUserIds`                                         | Whitelist user ID (rỗng = tất cả)                                           | `[]`                                                  |
| `logger.{maxLinesPerFile,logCacheThreshold}`             | Giới hạn log file / cache                                                     | `1000` / `1000`                                       |
| `reaction.debounceMs`                                    | Debounce reaction                                                            | `2000`                                                |
| `friendRequest.{autoAcceptDelayMin/MaxMs}`               | Auto-accept delay (giữ setting nhưng friend tools đã bỏ Phase 2)             | `2000` / `5000`                                       |
| `messageChunker.maxMessageLength`                        | Chia nhỏ tin nhắn dài                                                         | `1800`                                                |
| `messageStore.{maxCachePerThread,recentMessageWindowMs,maxUndoTimeMs}` | Cache thread / undo window                            | `20` / `300000` / `120000` (2 phút)                   |
| `edgeTts.{defaultVoice,defaultRate,defaultVolume,defaultPitch}` | Default Microsoft Edge TTS                                      | `"vi-VN-HoaiMyNeural"`, `"+0%"`, `"+0%"`, `"+0Hz"`   |
| `messageSender.{mediaDelayMs,chunkDelayMs}`              | Delay khi gửi media / chunk                                                   | `300` / `400`                                         |
| `markdown.{mermaidTimeoutMs,groupMediaSizeLimitMB}`      | Render mermaid                                                               | `30000` / `1`                                         |
| `history.{maxTrimAttempts,maxContextTokens,estimatedCharsPerToken}` | Trim context khi quá dài                                         | `50` / `300000` / `4`                                 |
| `database.{path,cleanupIntervalMs,cacheSize}`            | SQLite path / cleanup                                                        | `"data/bot.db"` / `3600000` / `10000`                 |
| `responseHandler.{reactionDelayMs,chunkDelayMs,stickerDelayMs,cardDelayMs,messageDelayMinMs,messageDelayMaxMs,imageDelayMs}` | Delay khi gửi response | `300` / `300` / `800` / `500` / `500` / `1000` / `500` |
| `websocketConnectTimeoutMs`                              | Đợi WS connect                                                               | `2000`                                                |
| `groupMembersFetch.{delayMinMs,delayMaxMs,errorDelayMinMs,errorDelayMaxMs}` | `getGroupMembers` random delay                            | `300` / `800` / `500` / `1000`                        |
| `gemini.{temperature,topP,maxOutputTokens,thinkingBudget,thinkingLevel,models,rateLimitMinuteMs,rateLimitDayMs}` | Gemini config | `1` / `0.95` / `65536` / `8192` / `"HIGH"` / `["models/gemini-3.1-flash-lite"]` / `120000` / `86400000` |

Xem schema đầy đủ trong `apps/bot/src/core/config/config.schema.ts`.

---

## 🔌 Modules & Tools

Plugins bật/tắt qua `settings.json` → `modules.*`. Tổng cộng **18 tools trên 2 modules** (Phase 2 — đã bỏ `chat` 1, `task` 2, `system` 1, `media` 2, `social` 20 từ tổng cũ 44).

### Media Module — 1 tool

| Tool            | Mô tả                                                                                                                          | Deps                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `textToSpeech`  | Text → speech (MP3, ≤5000 ký tự). Hỗ trợ nhiều giọng Neural (`vi-VN-HoaiMyNeural`, `en-US-AriaNeural`, …). Marketing: đọc quảng cáo SP, voice welcome. | msedge-tts (Microsoft Edge TTS)   |

### Social Module — 17 tools

#### User & Group lookup (2)

| Tool                  | Mô tả                                                        |
| --------------------- | ------------------------------------------------------------ |
| `getUserInfo`         | Lấy profile Zalo của một userId.                              |
| `getGroupMembers`     | Danh sách thành viên nhóm (kèm role, có cache). Cần cho tag/mention. |

#### Quảng bá (5)

| Tool            | Mô tả                                                                  |
| --------------- | ---------------------------------------------------------------------- |
| `createNote`    | Tạo + ghim thông báo quan trọng lên đầu nhóm (Board).                  |
| `editNote`      | Sửa ghi chú đã tạo.                                                   |
| `getListBoard`  | Lấy danh sách Note + Poll trong nhóm.                                  |
| `createPoll`    | Tạo bình chọn trong nhóm (≥2 options, multi-choice, anonymous, …).     |
| `getPollDetail` | Lấy chi tiết bình chọn (question, options, votes).                     |
| `lockPoll`      | Khóa poll, không cho vote nữa.                                        |

(Đã bỏ `votePoll` Phase 2 — bot không tự vote, chỉ user vote.)

#### Lên lịch (3)

| Tool             | Mô tả                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| `createReminder` | Tạo nhắc hẹn trong nhóm (`startTime` = Unix ms UTC, `repeat` ∈ `none/daily/weekly/monthly`). |
| `getReminder`    | Xem chi tiết một nhắc hẹn.                                                            |
| `removeReminder` | Xóa nhắc hẹn.                                                                          |

#### Basic Group Management (6)

| Tool                       | Mô tả                                                |
| -------------------------- | ---------------------------------------------------- |
| `getGroupInfo`             | Chi tiết nhóm: tên, creatorId, adminIds, settings, số thành viên. |
| `kickMember`               | Kick thành viên (bot phải là Admin).                 |
| `getPendingMembers`        | Đang chờ duyệt vào nhóm.                            |
| `reviewPendingMembers`     | Duyệt / từ chối (`memberIds[]`, `isApprove`).       |
| `getGroupLinkDetail`       | Lấy invite link của nhóm (read-only).                |
| `getGroupLinkInfo`         | Xem trước thông tin nhóm qua link `zalo.me/g/...`.    |

> **Đã bỏ Phase 2** (admin-heavy, không cần cho marketing bot):
> `blockMember` `addMember` `changeGroupName` `changeGroupAvatar` `updateGroupSettings`
> `changeGroupOwner` `addGroupDeputy` `removeGroupDeputy`
> `enableGroupLink` `disableGroupLink` `createGroup` `joinGroupLink` `leaveGroup` `disperseGroup`
> `getAllFriends` `getFriendOnlines` `findUserByPhone` `sendFriendRequest` `forwardMessage`
> `createChart` `createFile` `solveMath` `clearHistory` `qrCode` `flush_logs` `votePoll`

---

## 🌐 Web Dashboard

Next.js 16 + React 19 ở `apps/web/src/app/`. Mỗi page đọc/ghi qua proxy `/api/*` → bot REST API (`BOT_API_URL`).

| Đường dẫn                  | Component                          | Dữ liệu                                                                  |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `/`                        | `DashboardPage` (`app/page.tsx`)   | Tổng quan: 4 stats card + biểu đồ messages + bảng active threads         |
| `/settings`                | `SettingsPage` (`app/settings/page.tsx`) | Form cấu hình bot, gọi `GET/PATCH /api/settings` |
| `/logs`                    | `LogsPage` (`app/logs/page.tsx`)   | Log folders + đọc file log                                              |
| `/history`                 | `HistoryPage` (`app/history/page.tsx`) | Lịch sử hội thoại (threadId, role, content, timestamp)               |
| `/backup`                  | `BackupPage` (`app/backup/page.tsx`) | List / tạo / restore / download / upload / reset database              |
| `/api/[...path]`           | `route.ts` (proxy)                 | Reverse proxy mọi `/api/*` request sang `BOT_API_URL` (gắn `Authorization: Bearer ${BOT_API_KEY}`) |

Layout: `app/layout.tsx` (header + sidebar). UI components: 26 file trong `apps/web/src/components/ui/` (Radix wrappers + helpers `sonner`, `skeleton`, `chart`, …) + 2 layout components trong `apps/web/src/components/layout/` (header, sidebar-nav).

---

## 🗄 Database Schema (SQLite qua Drizzle ORM)

Định nghĩa duy nhất trong `apps/bot/src/infrastructure/database/schema.ts`. Migration lưu tại `apps/bot/drizzle/`, đường dẫn file `data/bot.db` (có thể đổi qua `database.path`).

| Bảng           | Cột                                                                                                     | Mục đích                                              |
| -------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `history`      | `id` (PK, auto) · `threadId` · `role` ∈ `user`/`model` · `content` (JSON) · `timestamp` (ms)            | Lịch sử hội thoại tất cả thread. Có index `idx_history_thread`. |
| `sent_messages`| `msgId` (PK) · `cliMsgId` · `threadId` · `content` · `timestamp` (ms)                                  | Log tin nhắn bot đã gửi — dùng cho `[undo:N]` thu hồi (window `messageStore.maxUndoTimeMs=120000ms`). |

Không có bảng long-term memory, scheduled tasks, hay session logs — chúng nằm trong `apps/bot/logs/*.txt` (file logging) hoặc trong RAM qua `messageStore` / `groupMembersCache`.

---

## 🌐 REST API (Hono trên port `PORT`, default 10000)

Mounted tại `/api/*` trong `apps/bot/src/infrastructure/api/index.ts`. Tất cả endpoint (trừ `/health`) yêu cầu `Authorization: Bearer ${API_KEY}` nếu `API_KEY` được set.

| Method & path                          | Handler (file)                          | Mô tả                                                                                       |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /`                                | `api/index.ts`                          | API index (list endpoints).                                                                 |
| `GET /health`                           | `api/index.ts`                          | Health check (luôn OK khi bot chạy).                                                         |
| `GET /api/settings`                    | `api/settings.api.ts`                   | Toàn bộ settings (đã Zod-validated).                                                        |
| `GET /api/settings/schema/all`         | `api/settings.api.ts`                   | Danh sách key cấp-1 của schema.                                                             |
| `GET /api/settings/:key`               | `api/settings.api.ts`                   | Một section (`bot`, `gemini`, …).                                                            |
| `PUT /api/settings`                    | `api/settings.api.ts`                   | Replace toàn bộ. Validate + save + notify listeners → CONFIG reload.                       |
| `PATCH /api/settings/:key`             | `api/settings.api.ts`                   | Merge vào một section.                                                                       |
| `POST /api/settings/reload`            | `api/settings.api.ts`                   | Force reload từ file.                                                                        |
| `GET /api/stats/overview`              | `api/stats.api.ts`                      | `{messages, messagesLast24h, uptime, timestamp}`.                                          |
| `GET /api/stats/messages?days=N`       | `api/stats.api.ts`                      | Tin nhắn group theo ngày & role.                                                            |
| `GET /api/stats/active-threads?N`      | `api/stats.api.ts`                      | Top N thread nhiều tin nhắn nhất.                                                            |
| `GET /api/history?page&limit&threadId&role` | `api/history.api.ts`                | Paginated history.                                                                         |
| `GET /api/history/threads?limit=N`     | `api/history.api.ts`                    | List threads.                                                                               |
| `GET /api/history/thread/:threadId`    | `api/history.api.ts`                    | Lịch sử 1 thread.                                                                           |
| `DELETE /api/history/thread/:threadId` | `api/history.api.ts`                    | Xóa lịch sử 1 thread.                                                                       |
| `DELETE /api/history/old?days=N`       | `api/history.api.ts`                    | Xóa mọi tin cũ hơn `N` ngày.                                                                |
| `GET /api/logs`                        | `api/logs.api.ts`                       | List log folder trong `logs/`.                                                               |
| `GET /api/logs/:folder`                | `api/logs.api.ts`                       | List file trong folder.                                                                      |
| `GET /api/logs/:folder/:file`          | `api/logs.api.ts`                       | Đọc N dòng cuối của file.                                                                    |
| `GET /api/logs/download/:folder/:file` | `api/logs.api.ts`                       | Download file log.                                                                          |
| `DELETE /api/logs/:folder`             | `api/logs.api.ts`                       | Xóa folder log.                                                                             |
| `GET /api/backup` / `POST /api/backup` / `POST /api/backup/restore/:name` / `POST /api/backup/upload` / `DELETE /api/backup/database` / `DELETE /api/backup/:name` | `api/backup.api.ts` | List / tạo / restore / download / upload / reset database. |

---

## 🏗 Kiến trúc

```
zia/
├── apps/
│   ├── bot/                                  # Bun runtime
│   │   ├── src/
│   │   │   ├── app/                           # Bootstrap (main.ts, botSetup.ts, app.module.ts)
│   │   │   ├── core/                          # Framework (base, config, container, errors,
│   │   │   │                                    event-bus, logger, plugin-manager, tool-registry, types.ts)
│   │   │   ├── modules/
│   │   │   │   ├── gateway/                   # Message pipeline (không export tool)
│   │   │   │   ├── media/       (1 tool)      # textToSpeech (+ services/edgeTtsClient.ts)
│   │   │   │   └── social/      (17 tools)    # basic group mgmt + polls/notes/reminders
│   │   │   ├── infrastructure/                # External services
│   │   │   │   ├── ai/                        # Gemini provider (multi-key rotation)
│   │   │   │   ├── api/                       # Hono REST: index + settings/stats/logs/history/backup
│   │   │   │   ├── database/                  # SQLite + Drizzle (schema.ts, connection.ts, database.service.ts)
│   │   │   │   └── messaging/                 # Zalo service (zca-js wrapper, sleepMode, zaloLogTransport)
│   │   │   └── shared/                        # utils, types, schemas (Zod)
│   │   ├── tests/                             # Integration + E2E (bun test)
│   │   ├── drizzle/                           # Generated migrations
│   │   ├── settings.json                      # Runtime config (Zod-validated)
│   │   └── .env.example                       # Environment template
│   │
│   └── web/                                  # Next.js 16 dashboard
│       └── src/app/                           # /, /settings, /logs, /history, /backup
│           └── api/[...path]/route.ts         # Reverse-proxy sang BOT_API_URL
│
├── package.json                               # Monorepo scripts (bun workspaces)
└── bun.lock                                  # Dependency lockfile (KHÔNG push)
```

### Core framework (`apps/bot/src/core/`)

| Component          | File                          | Vai trò                                                                                |
| ------------------ | ----------------------------- | -------------------------------------------------------------------------------------- |
| `EventBus`         | `event-bus/`                  | Pub/sub message bus.                                                                   |
| `ServiceContainer` | `container/`                  | Dependency injection singleton.                                                        |
| `ModuleManager`    | `plugin-manager/`             | Lifecycle: `register → load → start`. Thứ tự register cố định (gateway → media → social). |
| `ToolRegistry`     | `tool-registry/`              | Resolve tool name → `ToolDefinition`. Validate params với Zod. Parse `[tool:NAME]{json}[/tool]`. |
| `BaseModule` / `BaseTool` | `base/`                  | Abstract base cho plugin author.                                                        |
| `Logger`           | `logger/`                     | Pino + transports (console/file/Zalo).                                                 |

---

## 🐳 Triển khai

### Docker local

```bash
docker build -t zia-bot -f apps/bot/Dockerfile .
docker run -d --name zia-bot --env-file apps/bot/.env -p 10000:10000 zia-bot
```

### Docker Compose

```bash
cd apps/bot && docker-compose up -d
```

### Cloud (Railway / Render)

1. Tạo account Railway/Render, connect repo.
2. Encode `apps/bot/credentials.json` → base64:
   ```bash
   base64 -w 0 apps/bot/credentials.json
   ```
3. Set env: `GEMINI_API_KEY`, `API_KEY`, `ZALO_CREDENTIALS_BASE64` (kết quả bước 2), `LOG_RECEIVER_ID`, `PORT=10000`.
4. `Dockerfile` tại `apps/bot/Dockerfile` tự health-check ở `/health`.

### Test

```bash
bun run test                        # tất cả (integration + e2e)
bun run test:integration            # subset integration
bun run --cwd apps/bot test:ai      # test Gemini/AI integration
bun run --cwd apps/bot test:e2e     # e2e (cần ZALO_CREDENTIALS_BASE64 + GEMINI_API_KEY)
```

---

## 🛠 Công nghệ (Phase 2)

### Bot

| Danh mục              | Công nghệ                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Runtime               | Bun 1.0+                                                                                     |
| Ngôn ngữ              | TypeScript 7.x (compiler `bun-types`)                                                         |
| AI                    | `@google/genai` 2.11.x — Gemini 3.1 Flash Lite                                              |
| Zalo SDK              | `zca-js` 2.1.x                                                                               |
| Database              | SQLite + `drizzle-orm` 0.45.x + `better-sqlite3`                                            |
| HTTP API              | `hono` 4.12.x (Bun.serve)                                                                    |
| TTS                   | `msedge-tts` (Microsoft Edge TTS — miễn phí, Vietnamese voices)                            |
| OCR                   | `tesseract.js`, `word-extractor`, `docx-parser`, `mammoth`, `officeparser`                 |
| Image                 | `sharp` 0.35.x (resize/conversion), `satori` 0.26.x + `@resvg/resvg-js` (svg→png)         |
| HTTP client           | `ky` 2.x                                                                                      |
| Stream                | `rxjs` 7.x                                                                                   |
| Schema validation     | `zod` 4.x                                                                                    |
| Linting               | Biome (`@biomejs/biome`)                                                                      |
| Logger                | `pino` + `pino-pretty` + `pino-roll`                                                          |
| Repair                | `jsonrepair`                                                                                |

> Phase 2 bỏ: `chart.js`, `chartjs-node-canvas`, `docx`, `pptxgenjs`, `pdfkit`, `exceljs`, `katex`. Có thể dọn tiếp ở `apps/bot/package.json` (PR tiếp theo).

### Web

| Danh mục      | Công nghệ                                                                       |
| ------------- | ------------------------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router) + React 19.2                                           |
| Styling       | TailwindCSS 4                                                                   |
| Components    | Radix UI primitives + `lucide-react` icons                                    |
| State/Forms   | TanStack Query + SWR + `react-hook-form` + `@hookform/resolvers` + `nuqs`     |
| Charts        | Recharts (dashboard)                                                            |
| Theme         | `next-themes`                                                                  |
| Animations    | Framer Motion                                                                   |
| HTTP          | `axios`                                                                         |
| Validation    | `zod` 4                                                                         |
| Notifications | `sonner`                                                                        |

---

<div align="center">

**Zia — Closed-source project. All rights reserved. (Phase 2: 18 marketing-focused tools)**

</div>
