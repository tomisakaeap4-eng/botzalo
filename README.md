# Zia - Trợ Lý AI Zalo

<div align="center">

![Phiên bản](https://img.shields.io/badge/phiên_bản-1.0.0-blue.svg)
![Trạng thái](https://img.shields.io/badge/trạng_thái-preview-orange.svg)
![Giấy phép](https://img.shields.io/badge/giấy_phép-MIT-green.svg)
![Bun](https://img.shields.io/badge/runtime-Bun%201.0+-orange.svg)
![TypeScript](https://img.shields.io/badge/ngôn_ngữ-TypeScript-blue.svg)

**🚧 Dự án đang trong giai đoạn Preview - Có thể có thay đổi lớn 🚧**

**Chatbot AI cho nền tảng Zalo với Google Gemini 2.5 Flash + Web Dashboard quản lý**

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

- 🧠 **AI Thông minh** - Google Gemini 2.5 Flash với 8192 thinking token budget
- ⚡ **Streaming Real-time** - Gửi phản hồi ngay khi AI bắt đầu generate
- 🖼️ **Đa phương tiện** - Xử lý text, ảnh, video, audio, file và sticker
- 🔌 **Plugin System** - Kiến trúc modular với 6 modules và 50+ tools
- 📊 **Web Dashboard** - Quản lý settings, logs, memories, tasks, backup
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
# Bắt buộc
GEMINI_API_KEY=your_gemini_api_key

# Hỗ trợ nhiều keys (tự động xoay khi rate limit)
# GEMINI_API_KEY=key1,key2,key3
# Hoặc:
# GEMINI_API_KEY_1=key1
# GEMINI_API_KEY_2=key2

# Dịch vụ tùy chọn
GROQ_API_KEY=your_groq_key              # Background agent
# Imagen uses shared GEMINI_API_KEY (native @google/genai)
ELEVENLABS_API_KEY=your_elevenlabs_key  # Text-to-speech (legacy, không dùng)
GOOGLE_SEARCH_API_KEY=your_search_key   # Tìm kiếm web
GOOGLE_SEARCH_CX=your_search_engine_cx
GIPHY_API_KEY=your_giphy_key            # Tìm kiếm GIF


# API Key cho Web Dashboard
API_KEY=your_random_api_key
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

### Chat Module
| Tool | Mô tả |
|------|-------|
| `clearHistory` | Xóa lịch sử chat |
| `saveMemory` | Lưu vào bộ nhớ dài hạn |
| `recallMemory` | Truy xuất bộ nhớ |

### Media Module
| Tool | Mô tả | API cần thiết |
|------|-------|---------------|
| `createChart` | Tạo biểu đồ (bar, line, pie) | - |
| `createFile` | Tạo tài liệu (docx, pdf, pptx, xlsx) | - |
| `imagen` | Tạo ảnh AI | Google Imagen |
| `textToSpeech` | Chuyển text thành giọng nói | Microsoft Edge TTS (miễn phí) |

### Social Module
| Tool | Mô tả |
|------|-------|
| `getUserInfo` | Lấy thông tin user Zalo |
| `getAllFriends` | Danh sách bạn bè |
| `getFriendOnlines` | Bạn bè đang online |
| `getGroupMembers` | Thành viên nhóm |
| `forwardMessage` | Chuyển tiếp tin nhắn |
| `board` | Quản lý board/ghi chú |
| `poll` | Tạo/quản lý bình chọn |
| `reminder` | Tạo/quản lý nhắc nhở |
| `groupAdmin` | Quản lý nhóm (admin) |
| `friendRequest` | Quản lý lời mời kết bạn |

### Task Module
| Tool | Mô tả | API cần thiết |
|------|-------|---------------|
| `solveMath` | Giải toán với LaTeX | - |
| `createApp` | Tạo code ứng dụng | - |
| `scheduleTask` | Lên lịch task tương lai | Groq |
| `flushLogs` | Gửi file log qua Zalo | - |

### Entertainment Module (Jikan API)
| Tool | Mô tả |
|------|-------|
| `jikanSearch` | Tìm kiếm anime/manga |
| `jikanDetails` | Lấy chi tiết |
| `jikanTop` | Bảng xếp hạng |
| `jikanSeason` | Anime theo mùa |
| `jikanCharacters` | Danh sách nhân vật |
| `jikanRecommendations` | Gợi ý |
| `jikanGenres` | Danh sách thể loại |
| `jikanEpisodes` | Danh sách tập |
| `nekosImages` | Ảnh anime |
| `giphyGif` | Tìm kiếm GIF (cần Giphy API) |

### Academic Module (TVU Portal)
| Tool | Mô tả |
|------|-------|
| `tvuLogin` | Đăng nhập portal |
| `tvuStudentInfo` | Thông tin sinh viên |
| `tvuSemesters` | Danh sách học kỳ |
| `tvuSchedule` | Thời khóa biểu |
| `tvuGrades` | Điểm học tập |
| `tvuTuition` | Thông tin học phí |
| `tvuCurriculum` | Chương trình đào tạo |
| `tvuNotifications` | Thông báo portal |

---

## 🌐 Web Dashboard

Dashboard Next.js để quản lý bot:

| Trang | Chức năng |
|-------|-----------|
| `/` | Dashboard tổng quan, thống kê |
| `/settings` | Cấu hình bot |
| `/logs` | Xem logs |
| `/memories` | Quản lý long-term memory |
| `/history` | Lịch sử hội thoại |
| `/tasks` | Quản lý scheduled tasks |
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
zia/
├── apps/
│   ├── bot/                     # Zalo AI Bot
│   │   ├── src/
│   │   │   ├── app/             # Bootstrap (main.ts, botSetup.ts)
│   │   │   ├── core/            # Framework (EventBus, Container, ModuleManager)
│   │   │   ├── modules/         # Feature modules
│   │   │   │   ├── gateway/     # Message pipeline
│   │   │   │   ├── chat/        # Chat tools
│   │   │   │   ├── media/       # Media tools

│   │   │   │   ├── social/      # Social tools
│   │   │   │   ├── task/        # Task tools
│   │   │   │   ├── entertainment/  # Anime/Media
│   │   │   │   ├── academic/    # TVU Portal
│   │   │   │   └── background-agent/  # Scheduled tasks
│   │   │   ├── infrastructure/  # External services
│   │   │   │   ├── ai/          # Gemini provider
│   │   │   │   ├── api/         # REST API endpoints
│   │   │   │   ├── database/    # SQLite + Drizzle
│   │   │   │   ├── memory/      # Long-term memory
│   │   │   │   └── messaging/   # Zalo service
│   │   │   ├── libs/            # Document builders
│   │   │   │   ├── docx-builder/
│   │   │   │   └── pptx-builder/
│   │   │   └── shared/          # Utils, types, schemas
│   │   ├── tests/               # Integration & E2E tests
│   │   ├── drizzle/             # Database migrations
│   │   └── settings.json        # Runtime config
│   │
│   └── web/                     # Next.js Dashboard
│       └── src/
│           ├── app/             # Pages (App Router)
│           ├── components/      # React components
│           ├── hooks/           # Custom hooks
│           └── lib/             # Utilities
│
├── package.json                 # Monorepo scripts
└── bun.lock
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
| `history` | Lịch sử hội thoại |
| `sent_messages` | Log tin nhắn đã gửi (cho undo) |
| `memories` | Long-term memory |
| `agent_tasks` | Hàng đợi scheduled tasks |

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
5. Deploy - health check tại `/health`

---

## 🛠️ Công Nghệ

### Bot (`apps/bot`)
| Danh mục | Công nghệ |
|----------|-----------|
| Runtime | Bun 1.0+ |
| Ngôn ngữ | TypeScript 5.7+ |
| AI Model | Google Gemini 2.5 Flash |
| Messaging | zca-js (Zalo API) |
| Database | SQLite + Drizzle ORM |
| Reactive | RxJS |
| HTTP Client | Ky |
| Validation | Zod |
| Linting | Biome |

### Web (`apps/web`)
| Danh mục | Công nghệ |
|----------|-----------|
| Framework | Next.js 16 |
| UI | React 19, TailwindCSS 4 |
| Components | Radix UI, Lucide Icons |
| State | TanStack Query, SWR |
| Charts | Recharts |

---

## 🤝 Đóng Góp

1. Fork repository
2. Tạo feature branch (`git checkout -b feature/tinh-nang-moi`)
3. Commit thay đổi (`git commit -m 'Thêm tính năng mới'`)
4. Push lên branch (`git push origin feature/tinh-nang-moi`)
5. Mở Pull Request

Xem [CONTRIBUTING.md](CONTRIBUTING.md) để biết thêm chi tiết.

---

## 📄 Giấy Phép

MIT License - xem file [LICENSE](LICENSE).

---

## 🙏 Credits

- [zca-js](https://github.com/nicknguyen-dev/zca-js) - Zalo API
- [Google Gemini](https://ai.google.dev/) - AI model
- [Bun](https://bun.sh) - JavaScript runtime
- [Drizzle ORM](https://orm.drizzle.team/) - TypeScript ORM

---

<div align="center">

**Được xây dựng với ❤️ cho cộng đồng Zalo**

</div>
#   b o t z a l o  
 #   b o t z a l o  
 #   b o t z a l o  
 