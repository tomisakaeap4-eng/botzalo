# Zia - Trợ Lý AI Zalo

<div align="center">

![Runtime](https://img.shields.io/badge/runtime-Bun%201.0+-orange.svg)
![Language](https://img.shields.io/badge/ngôn_ngữ-TypeScript-blue.svg)

**Project overview nội bộ — Tài liệu tham chiếu kỹ thuật cho đội phát triển và khách mua source code**

[Tính năng](#-tính-năng) • [Cài đặt](#-cài-đặt) • [Cấu hình](#-cấu-hình) • [Modules](#-modules--tools) • [Triển khai](#-triển-khai)

</div>

---

## 🎯 Tổng Quan

**Zia** là monorepo gồm 2 ứng dụng:

| App | Mô tả | Tech Stack |
|-----|-------|------------|
| `apps/bot` | Zalo AI Chatbot | Bun, zca-js, Google Gemini, SQLite |
| `apps/web` | Web Dashboard quản lý | Next.js 16, React 19, TailwindCSS |

### Điểm Nổi Bật

- 🧠 **AI Thông minh** - Google Gemini (mặc định `gemini-3.1-flash-lite`), thinking budget cấu hình trong `settings.json`
- 🔑 **Multi-key Gemini** - Xoay vòng không giới hạn API key, tự retry khi 429/503
- ⚡ **Streaming Real-time** - Gửi phản hồi ngay khi AI bắt đầu generate
- 🖼️ **Đa phương tiện** - Xử lý text, ảnh, video, audio, file và sticker
- 🔌 **Plugin System** - Kiến trúc modular với 6 modules và 40+ tools
- 📊 **Web Dashboard** - Quản lý settings, logs, history và backup
- 🐳 **Cloud-Ready** - Docker support với health checks

---

## 📋 Yêu Cầu Hệ Thống

- **Bun** 1.0+ ([Cài đặt Bun](https://bun.sh))
- **Gemini API Key** ([Lấy API Key](https://aistudio.google.com/app/apikey))
- **Tài khoản Zalo** để đăng nhập bot

---

## 🚀 Cài Đặt

```bash
# Clone repository
git clone https://github.com/your-org/zia.git
cd zia

# Cài đặt dependencies
bun install

# Copy file môi trường mẫu
cp apps/bot/.env.example apps/bot/.env

# Cấu hình API keys trong apps/bot/.env
# Tối thiểu cần GEMINI_API_KEY

# Chạy database migrations
bun run --cwd apps/bot db:migrate
```

### Đăng Nhập Zalo Lần Đầu

1. Chạy bot: `bun run dev:bot`
2. File `qr.png` sẽ được tạo trong `apps/bot/`
3. Mở Zalo → Cài đặt → Đăng nhập trên máy tính → Quét mã QR
4. Credentials được lưu vào `credentials.json` cho các phiên sau

---

## 📖 Sử Dụng

```bash
# Development
bun run dev:bot          # Chạy bot với hot reload
bun run dev:web          # Chạy web dashboard

# Production
bun run start:bot        # Chạy bot production
bun run build:web        # Build web dashboard

# Database
bun run --cwd apps/bot db:studio     # Mở Drizzle Studio
bun run --cwd apps/bot db:generate   # Tạo migrations
bun run --cwd apps/bot db:migrate    # Chạy migrations

# Testing
bun run test                         # Tất cả tests
bun run test:integration             # Integration tests
```

---

## ⚙️ Cấu Hình

### Biến Môi Trường (`apps/bot/.env`)

```bash
# Bắt buộc (Gemini)
GEMINI_API_KEY=your_gemini_api_key

# Hỗ trợ nhiều keys (xoay vòng tự động khi rate limit, KHÔNG giới hạn số lượng)
# Cách 1 - một dòng (comma-separated):
# GEMINI_API_KEY=key1,key2,key3,...
# Cách 2 - nhiều dòng (dễ quản lý hơn, KHÔNG giới hạn):
# GEMINI_API_KEY_1=key1
# GEMINI_API_KEY_2=key2
# GEMINI_API_KEY_3=key3
# ... có thể thêm bao nhiêu key tùy ý

# Khuyến nghị (bắt buộc cho production, optional khi dev)
# Bảo vệ REST API endpoints của cả bot và web dashboard.
# Nếu KHÔNG set, API endpoints sẽ public (chỉ dùng cho dev local).
# Generate: openssl rand -hex 32
API_KEY=your_random_api_key

# Tùy chọn - Zalo User ID nhận file log tự động (production)
# Khi đủ 1000 dòng log, bot sẽ gửi file log qua Zalo cho user này
LOG_RECEIVER_ID=your_zalo_user_id

# Tùy chọn - Zalo Credentials cho Cloud Deployment (Railway/Render)
# Lấy bằng cách chạy bot local lần đầu, quét QR, bot in ra base64 string.
# ⚠️ KHÔNG copy giá trị mẫu bên dưới — thay bằng base64 của credentials.json THẬT của bạn.
ZALO_CREDENTIALS_BASE64=replace_me_with_real_base64_encoded_credentials
```

### Cài Đặt Runtime (`apps/bot/settings.json`)

Các cấu hình quan trọng:

| Section | Key | Mô tả |
|---------|-----|-------|
| `bot` | `useStreaming` | Bật streaming response |
| `bot` | `maxToolDepth` | Độ sâu tool calls tối đa |
| `bot` | `sleepMode` | Tự động offline theo giờ |
| `bot` | `maintenanceMode` | Chế độ bảo trì |
| `buffer` | `delayMs` | Cửa sổ gom tin nhắn (ms) |
| `modules` | `*` | Bật/tắt từng module |
| `allowedUserIds` | - | Whitelist user IDs |
| `gemini` | `models` | Danh sách model Gemini (xoay vòng) |
| `edgeTts` | `defaultVoice` | Giọng mặc định (vd: `vi-VN-HoaiMyNeural`) |

---

## ✨ Tính Năng

### Xử Lý Tin Nhắn

**Message Buffering (RxJS)** - Gom nhiều tin nhắn liên tiếp:
```
User gửi: "Alo" → "Có đó không" → "Giúp mình với"
         ↓ (đợi 2.5s không có tin mới)
Bot xử lý: [3 tin nhắn cùng lúc]
```

### Hỗ Trợ Media

| Loại | Định dạng | Xử lý |
|------|-----------|-------|
| Hình ảnh | PNG, JPG, GIF, WEBP, HEIC | Phân tích bởi Gemini |
| Video | MP4, MOV, AVI, WEBM (< 20MB) | Trích xuất thumbnail |
| Audio | AAC, MP3, WAV, OGG, FLAC | Tự động transcribe |
| Voice | Tin nhắn thoại Zalo | Tự động transcribe |
| File | PDF, TXT, DOC, Code files | Trích xuất nội dung |

### Response Tags

```
[reaction:heart]           → Thả reaction vào tin cuối
[sticker:hello]            → Gửi sticker
[msg]Nội dung[/msg]        → Gửi tin nhắn riêng
[quote:0]Trả lời[/quote]   → Reply vào tin cụ thể
[undo:-1]                  → Thu hồi tin nhắn cuối của bot
```

### Rich Text Formatting

| Cú pháp | Kết quả |
|---------|---------|
| `*text*` | **đậm** |
| `_text_` | *nghiêng* |
| `__text__` | gạch chân |
| `~text~` | ~~gạch ngang~~ |

---

## 🔌 Modules & Tools

Bot có 6 modules với tổng cộng 40+ tools. Bật/tắt module trong `apps/bot/settings.json` (`modules.*`).

### Chat Module
| Tool | Mô tả |
|------|-------|
| `clearHistory` | Xóa lịch sử chat theo thread |

### Media Module
| Tool | Mô tả | Deps |
|------|-------|------|
| `createChart` | Tạo biểu đồ (bar, line, pie) | chart.js, chartjs-node-canvas |
| `createFile` | Tạo tài liệu (docx, pdf, pptx, xlsx) | docx, pptxgenjs, pdfkit, exceljs |
| `textToSpeech` | Chuyển text thành giọng nói | msedge-tts (Microsoft Edge TTS, miễn phí) |

### Social Module — User & Friends
| Tool | Mô tả |
|------|-------|
| `getUserInfo` | Lấy thông tin user Zalo |
| `getAllFriends` | Danh sách bạn bè |
| `getFriendOnlines` | Bạn bè đang online |
| `findUserByPhone` | Tra cứu user theo SĐT |
| `sendFriendRequest` | Gửi lời mời kết bạn |
| `forwardMessage` | Chuyển tiếp tin nhắn |

### Social Module — Nhóm: thông tin & thành viên
| Tool | Mô tả |
|------|-------|
| `getGroupInfo` | Chi tiết nhóm |
| `getGroupMembers` | Danh sách thành viên |
| `kickMember` | Kick thành viên |
| `blockMember` | Block thành viên |
| `addMember` | Thêm thành viên |
| `getPendingMembers` | Thành viên chờ duyệt |
| `reviewPendingMembers` | Duyệt thành viên chờ |

### Social Module — Nhóm: cài đặt & vai trò
| Tool | Mô tả |
|------|-------|
| `updateGroupSettings` | Cập nhật cài đặt nhóm |
| `changeGroupName` | Đổi tên nhóm |
| `changeGroupAvatar` | Đổi avatar nhóm |
| `addGroupDeputy` | Thêm phó nhóm |
| `removeGroupDeputy` | Gỡ phó nhóm |
| `changeGroupOwner` | Chuyển owner |

### Social Module — Nhóm: link & tạo/rời nhóm
| Tool | Mô tả |
|------|-------|
| `getGroupLinkDetail` / `enableGroupLink` / `disableGroupLink` / `getGroupLinkInfo` | Quản lý link tham gia |
| `createGroup` | Tạo nhóm mới |
| `joinGroupLink` | Tham gia nhóm qua link |
| `leaveGroup` | Rời nhóm |
| `disperseGroup` | Giải tán nhóm |

### Social Module — Poll / Board / Reminder
| Tool | Mô tả |
|------|-------|
| `createPoll` / `getPollDetail` / `votePoll` / `lockPoll` | Tạo, xem, bình chọn, khóa poll |
| `createNote` / `getListBoard` / `editNote` | Ghi chú/board nhóm |
| `createReminder` / `getReminder` / `removeReminder` | Nhắc nhở cá nhân |

### System Module
| Tool | Mô tả |
|------|-------|
| `qrCode` | Tạo QR code từ text/URL |

### Task Module
| Tool | Mô tả |
|------|-------|
| `solveMath` | Giải toán, render công thức KaTeX → ảnh |
| `flushLogs` | Gửi file log qua Zalo (tới `LOG_RECEIVER_ID`) |

---

## 🌐 Web Dashboard

Dashboard Next.js để quản lý bot:

| Trang | Chức năng |
|-------|-----------|
| `/` | Dashboard tổng quan, thống kê tin nhắn |
| `/settings` | Cấu hình bot |
| `/logs` | Xem logs |
| `/history` | Lịch sử hội thoại (theo thread) |
| `/backup` | Database backup/restore |

### Chạy Web Dashboard

```bash
# Development
bun run dev:web

# Production
bun run build:web
bun run --cwd apps/web start
```

Cần set `API_KEY` trong `.env` của cả bot và web để bảo vệ API endpoints.

---

## 🏗️ Kiến Trúc

```
apps/
├── bot/                     # Zalo AI Bot
│   ├── src/
│   │   ├── app/             # Bootstrap (main.ts, botSetup.ts)
│   │   ├── core/            # Framework (EventBus, Container, ModuleManager)
│   │   ├── modules/         # Feature modules
│   │   │   ├── gateway/     # Message pipeline
│   │   │   ├── chat/        # Chat tools (clearHistory)
│   │   │   ├── media/       # Chart / File / TTS
│   │   │   ├── social/      # User / Group / Poll / Board / Reminder
│   │   │   ├── system/      # Utility tools (QR code)
│   │   │   └── task/        # Math + log tools
│   │   ├── infrastructure/  # External services
│   │   │   ├── ai/          # Gemini provider (multi-key rotation)
│   │   │   ├── api/         # REST API endpoints (Hono)
│   │   │   ├── database/    # SQLite + Drizzle ORM
│   │   │   └── messaging/   # Zalo service (zca-js)
│   │   ├── libs/            # Document builders (docx, pptx, ...)
│   │   └── shared/          # Utils, types, schemas
│   ├── tests/               # Integration & E2E tests
│   ├── drizzle/             # Database migrations
│   ├── settings.json        # Runtime config
│   └── .env.example         # Environment template
│
└── web/                     # Next.js Dashboard
    └── src/
        ├── app/             # Pages (App Router)
        ├── components/      # React components
        ├── hooks/           # Custom hooks
        └── lib/             # Utilities
```

### Core Components

| Component | Chức năng |
|-----------|-----------|
| **EventBus** | Pub/sub messaging cho loose coupling |
| **ServiceContainer** | Dependency injection container |
| **ModuleManager** | Quản lý lifecycle của modules |
| **ToolRegistry** | Parse và thực thi tools |
| **BaseModule** | Abstract base cho tất cả modules |
| **BaseTool** | Abstract base cho tất cả tools |

---

## 🗄️ Database Schema

| Bảng | Mô tả |
|------|-------|
| `history` | Lịch sử hội thoại (per-thread, role + content) |
| `sent_messages` | Log tin nhắn đã gửi (cho undo) |

---

## 🐳 Triển Khai

### Docker

```bash
# Build và chạy
docker build -t zia-bot -f apps/bot/Dockerfile .
docker run -d --name zia-bot --env-file apps/bot/.env zia-bot
```

### Docker Compose

```bash
cd apps/bot
docker-compose up -d
```

### Cloud Platforms (Railway, Render)

1. Set biến môi trường trong dashboard
2. Encode `credentials.json` sang base64:
   ```bash
   base64 -w 0 apps/bot/credentials.json
   ```
3. Set `ZALO_CREDENTIALS_BASE64` với chuỗi đã encode
4. Deploy — health check tại `/health`

---

## 🛠️ Công Nghệ

### Bot (`apps/bot`)
| Danh mục | Công nghệ |
|----------|-----------|
| Runtime | Bun 1.0+ |
| Ngôn ngữ | TypeScript 5.7+ |
| AI Model | Google Gemini (multi-key, configurable) |
| Messaging | zca-js (Zalo API) |
| Database | SQLite + Drizzle ORM |
| Reactive | RxJS |
| HTTP Client | Ky |
| Validation | Zod |
| Linting | Biome |
| Document | docx, pptxgenjs, pdfkit, exceljs |
| TTS | msedge-tts (Microsoft Edge TTS) |
| Math | KaTeX |

### Web (`apps/web`)
| Danh mục | Công nghệ |
|----------|-----------|
| Framework | Next.js 16 |
| UI | React 19, TailwindCSS 4 |
| Components | Radix UI, Lucide Icons |
| State | TanStack Query, SWR |
| Charts | Recharts |

---

<div align="center">

**Zia — Closed-source project. All rights reserved.**

</div>
