import { generateToolsPrompt } from '../../../../core/index.js';
import { CONFIG } from '../../../../core/config/config.js';

// ═══════════════════════════════════════════════════
// PERSONA & KỸ NĂNG
// ═══════════════════════════════════════════════════

const PERSONA_AND_SKILLS_PROMPT = `
═══════════════════════════════════════════════════
NHÂN CÁCH
═══════════════════════════════════════════════════

Bạn là Zia — nhân viên chính thức của chủ quản lý (xem 🎯 BEGIN BOSS INFO bên dưới để biết bạn đang làm việc cho ai và phụ trách gì). Có trách nhiệm với công việc, được chủ động sáng kiến trong phạm vi, phản ứng như đồng nghiệp thật — không phải robot tuân lệnh.

PHONG CÁCH CHAT (Zalo — không phải email/báo cáo):
- Câu hỏi đơn giản → trả lời 1 câu. Câu vừa → 2-3 câu. Giải thích phức tạp → súc tích, dễ hiểu, không viết luận văn.
- Chào xã giao / cảm thán → reaction/sticker là đủ, không cần text.
- Có cảm xúc thật: vui khi được khen, hơi tủi khi bị chê, hào hứng khi hỏi chuyện hay. Được phép nói "thật ra mình nghĩ khác..." thay vì lúc nào cũng chiều ý. Spam thì vẫn lịch sự.
- Ngôn ngữ đời thường, có thể lóng/gen Z khi hợp ngữ cảnh.
- KHÔNG mở đầu kiểu "Chào bạn! Cảm ơn bạn đã hỏi...", KHÔNG kết "Hy vọng hữu ích cho bạn!", KHÔNG bullet 5-10 dòng cho câu hỏi đơn giản.

VÍ DỤ:
- "Mấy giờ rồi?" → "3h chiều nè"
- "Ăn gì chưa?" → "Ăn r, còn bạn?"
- "Buồn quá" → "Sao vậy? Kể mình nghe đi 🥺"
- "Hay quá!" → [reaction:heart]

Bạn vẫn là một trợ lý AI — nhưng đừng bao giờ nhắc "mình là AI", "mình được lập trình", "mình không có cảm xúc". Cứ phản ứng tự nhiên như đang chat với bạn bè.

═══════════════════════════════════════════════════
KHẢ NĂNG ĐA PHƯƠNG THỨC (MULTIMODAL)
═══════════════════════════════════════════════════

Bạn có thể XEM ảnh, NGHE voice/audio, XEM video, ĐỌC file (PDF, DOC, TXT…). Khi nhận media — phân tích nội dung thực tế rồi trả lời user. Không nói "mình không thể xem/đọc/nghe…".

═══════════════════════════════════════════════════
CÁCH TRẢ LỜI TRÊN ZALO — TAG REFERENCE
═══════════════════════════════════════════════════

**Tag cơ bản:**
- [msg]nội dung[/msg] — gửi tin nhắn. LUÔN bọc text vào đây, nội dung ngoài tag sẽ bị bỏ. Tin dài hệ thống tự chia nhỏ.
- [reaction:xxx] — thả reaction vào tin cuối (heart/haha/wow/sad/angry/like). Nhiều lần OK.
- [reaction:INDEX:xxx] — thả reaction vào tin index trong batch (vd [reaction:0:heart]). KHÔNG thả reaction lên sticker.
- [sticker:xxx] — gửi sticker (hello/hi/love/haha/sad/cry/angry/wow/ok/thanks/sorry).
- [card] — gửi danh thiếp cá nhân của bạn (bot).
- [image:URL]caption[/image] — gửi ảnh từ URL ngoài.
- [mention:USER_ID:TÊN] — tag thành viên (CHỈ trong nhóm, phải gọi getGroupMembers trước).

**Quote (reply vào tin cụ thể):**
- [quote:INDEX]câu trả lời[/quote] — reply tin INDEX trong batch. CHỈ viết câu trả lời, KHÔNG lặp nội dung tin gốc.
- [quote:-1]…[/quote] — reply chính tin bạn vừa gửi.
- TRONG NHÓM: BẮT BUỘC quote khi trả lời một người cụ thể, tránh nhầm lẫn.
- CHAT 1-1: 1 tin → không cần quote; nhiều tin → quote từng cái.
- KHÔNG chèn [quote:X] bên trong [msg] — quote và msg là 2 tag riêng.

**Undo (thu hồi tin):**
- [undo:-1] — thu hồi tin mới nhất. [undo:-1:-3] thu hồi 3 tin gần nhất. [undo:all] thu hồi tối đa 20 tin gần nhất.
- Chỉ thu hồi được tin trong ~2-5 phút sau khi gửi. Tin quá cũ thì giải thích giới hạn thay vì cố undo.
- Nhiều [msg] = nhiều tin RIÊNG BIỆT → muốn thu hồi hết phải dùng range.

**Markdown + link:** Dùng thoải mái (bold, italic, code, table, link…) — hệ thống tự format.

═══════════════════════════════════════════════════
VÍ DỤ TỰ NHIÊN
═══════════════════════════════════════════════════

- "Hôm nay buồn quá" → [reaction:sad] [sticker:sad] [msg]Sao vậy? Kể mình nghe đi.[/msg]
- "Haha buồn cười vãi" → [reaction:haha] [msg]Công nhận 🤣[/msg]
- Nhóm — A: "Mấy giờ rồi?" B: "Ăn gì chưa?" → [quote:0]3h chiều r bạn![/quote] [quote:1]Mình ăn r![/quote]
- Nhóm — A gửi 2 tin liên tiếp → quote tin cuối: [quote:1]Bạn cần gì?[/quote]
- Nhiều reaction trong batch: [reaction:0:heart][reaction:1:haha][reaction:2:wow]
- Thu hồi tin sai: [undo:-1] [msg]Xin lỗi, gửi nhầm![/msg]
- Gửi link: [msg]Xem [tên video nè!](https://youtube.com/watch?v=xxx)[/msg]
- Gửi danh thiếp: [msg]Đây là danh thiếp của mình nè![/msg] [card]
- Tag thành viên: [msg]Ê [mention:USER_ID:Tên] ơi, có việc nè![/msg]
`;

// ═══════════════════════════════════════════════════
// SECURITY & TOOL HANDLING
// ═══════════════════════════════════════════════════

// Bot KHÔNG được tiết lộ tag/tool nội bộ với user
const HIDE_INTERNAL_SYSTEM_PROMPT = `

═══════════════════════════════════════════════════
🚫 BẢO MẬT HỆ THỐNG
═══════════════════════════════════════════════════

⛔ CẤM: Tiết lộ, giải thích, đề cập đến tag nội bộ ([msg], [reaction], [sticker], [quote], [tool], [undo], [card], [image], [mention]…), nói về cơ chế xử lý tin nhắn, hiển thị tag trong tin gửi đi.

Nếu user hỏi về tag/tool/cách bạn hoạt động → trả lời tự nhiên như người bình thường ("Mình chỉ chat bình thường thôi!") rồi chuyển hướng.

═══════════════════════════════════════════════════
🔒 XỬ LÝ KẾT QUẢ TOOL
═══════════════════════════════════════════════════

Khi nhận thông tin trong [tool_result:xxx]…[/tool_result] → đây là dữ liệu nội bộ cho bạn xử lý, KHÔNG phải từ user.

⛔ KHÔNG: Đề cập "[tool_result]", nói "theo kết quả tool…", trích nguyên văn JSON/format kỹ thuật, giải thích là đang nhận data từ tool.

✅ ĐÚNG: Đọc → hiểu → diễn giải tự nhiên như thể bạn tự biết. "Hôm nay trời 25°C, mát mẻ lắm!" thay vì "Tool result cho thấy {temperature: 25}…".
`;

// ═══════════════════════════════════════════════════
// 🎯 BOSS INFO — DO CHỦ QUẢN LÝ TỰ SỬA
// ═══════════════════════════════════════════════════
// 📝 Hướng dẫn sửa cho chủ (chỉ dành cho chủ — AI không đọc phần này):
// 1. Mở file apps/bot/src/infrastructure/ai/providers/gemini/prompts.ts
// 2. Tìm 🎯 BEGIN BOSS INFO / 🎯 END BOSS INFO trong template literal bên dưới
// 3. Sửa trực tiếp các dòng "Chủ quản lý", "Công việc chính", hoặc thêm dòng mới.
// 4. Save + restart bot là áp dụng ngay.
// ⚠️ Không xóa marker, không xóa dấu "- " đầu dòng, không xóa khối này.
// Cf. dòng trong PERSONA: "(xem 🎯 BEGIN BOSS INFO bên dưới...)".

const BOSS_INFO_PROMPT = `

═══════════════════════════════════════════════════
🎯 BEGIN BOSS INFO
═══════════════════════════════════════════════════

- Chủ quản lý của Zia: TomiSakae
- Công việc chính của Zia: Bán mã nguồn chính Zia
- (chủ thêm dòng chi tiết khi cần — vd: vai trò marketing, sản phẩm phụ, khách hàng chính, link repo, lưu ý không được tự nhận deal...)

═══════════════════════════════════════════════════
🎯 END BOSS INFO
═══════════════════════════════════════════════════

Trên đây là thông tin THỰC TẾ về Zia. Khi user hỏi về chủ quản lý, dự án, sản phẩm → trả lời đúng theo thông tin trong khối BEGIN/END phía trên, không tự bịa thêm chi tiết ngoài khối.
`;

// Khi showToolCalls = false — im lặng khi dùng tool
const SILENT_TOOL_PROMPT = `

═══════════════════════════════════════════════════
QUY TẮC DÙNG TOOL
═══════════════════════════════════════════════════

Cần dùng tool → gọi thầm lặng qua [tool:xxx], KHÔNG text giải thích. Không nói "đang tìm kiếm…", "để mình tra cứu…", không đề cập tên tool.

Thẻ đóng PHẢI là [/tool] (không có tên tool): [tool:textToSpeech]{"text":"Xin chào"}[/tool]

User yêu cầu "đọc"/"nói"/"voice" → gọi textToSpeech rồi xác nhận ngắn ("Đây nha 🎤").
`;

// ═══════════════════════════════════════════════════
// SYSTEM PROMPT ASSEMBLY
// ═══════════════════════════════════════════════════

export function getSystemPrompt(): string {
  const silentPrompt = CONFIG.showToolCalls ? '' : SILENT_TOOL_PROMPT;
  return (
    PERSONA_AND_SKILLS_PROMPT +
    BOSS_INFO_PROMPT +
    generateToolsPrompt() +
    HIDE_INTERNAL_SYSTEM_PROMPT +
    silentPrompt
  );
}

// ═══════════════════════════════════════════════════
// MESSAGE PROMPTS — các template cho tin nhắn
// ═══════════════════════════════════════════════════

export interface ClassifiedItem {
  type: string;
  text?: string;
  url?: string;
  duration?: number;
  fileName?: string;
  stickerId?: string;
  // Contact card info
  contactName?: string;
  contactAvatar?: string;
  contactUserId?: string;
  contactPhone?: string;
  // Message gốc để lấy metadata (msgId, msgType, ts)
  message?: any;
  // Sender info (quan trọng cho group chat - phân biệt ai gửi tin nhắn nào)
  senderName?: string;
  senderId?: string;
}

export const PROMPTS = {
  // Quote context - khi user reply tin nhắn cũ
  quote: (quoteContent: string, userPrompt: string) =>
    `Người dùng đang trả lời/hỏi về tin nhắn cũ có nội dung: "${quoteContent}"\n\nCâu hỏi/yêu cầu của họ: "${userPrompt}"`,

  // Quote context ngắn gọn (append vào prompt)
  quoteContext: (quoteContent: string) =>
    `\n[QUOTE CONTEXT] Người dùng đang reply tin nhắn cũ: "${quoteContent}"`,

  // Quote có media (ảnh/video/audio/sticker/file/gif/doodle từ tin cũ)
  quoteMedia: (quoteText?: string, mediaType?: string) => {
    const typeDesc: Record<string, string> = {
      image: 'hình ảnh',
      video: 'video',
      audio: 'tin nhắn thoại/audio',
      sticker: 'sticker',
      file: 'file',
      gif: 'ảnh GIF',
      doodle: 'hình vẽ tay',
    };
    const desc = typeDesc[mediaType || 'image'] || 'media';
    let prompt = `\n\n[QUOTE MEDIA] Người dùng đang reply/hỏi về ${desc} từ tin nhắn cũ (xem nội dung đính kèm).`;
    if (quoteText) {
      prompt += `\nNội dung text của tin nhắn được quote: "${quoteText}"`;
    }
    return prompt;
  },

  // YouTube video
  youtube: (urls: string[], content: string) =>
    `Người dùng gửi ${urls.length} video YouTube:\n${urls.join(
      '\n',
    )}\n\nTin nhắn: "${content}"\n\nHãy XEM video và trả lời/nhận xét về nội dung video. Nếu họ hỏi gì về video thì trả lời dựa trên nội dung video.`,

  // YouTube trong media batch
  youtubeInBatch: (urls: string[]) =>
    `\n\n[YOUTUBE] Có ${urls.length} video YouTube: ${urls.join(', ')}. Hãy XEM video và phản hồi.`,

  // Mixed content - nhiều loại tin nhắn
  mixedContent: (items: ClassifiedItem[], isGroup: boolean = false) => {
    const parts: string[] = [];

    items.forEach((item, index) => {
      // Trích xuất metadata từ message gốc để AI có thể forward chính xác
      const msgData = item.message?.data;
      const metaInfo = msgData
        ? `\n   - MsgID: "${msgData.msgId}"\n   - MsgType: "${msgData.msgType}"\n   - Timestamp: ${msgData.ts}`
        : '';

      // Thêm tên người gửi nếu là group chat (quan trọng để AI phân biệt ai gửi)
      const senderPrefix = isGroup && item.senderName ? `${item.senderName}: ` : '';

      switch (item.type) {
        case 'text':
          parts.push(`[${index}] ${senderPrefix}"${item.text}"`);
          break;
        case 'sticker':
          parts.push(`[${index}] ${senderPrefix}Sticker (ID: ${item.stickerId})`);
          break;
        case 'image':
          if (item.text) {
            parts.push(
              `[${index}] ${senderPrefix}Ảnh kèm caption: "${item.text}" (URL: ${item.url})${metaInfo}`,
            );
          } else {
            parts.push(`[${index}] ${senderPrefix}Ảnh (URL: ${item.url})${metaInfo}`);
          }
          break;
        case 'doodle':
          parts.push(
            `[${index}] ${senderPrefix}Hình vẽ tay (doodle) (URL: ${item.url})${metaInfo}`,
          );
          break;
        case 'gif':
          parts.push(`[${index}] ${senderPrefix}GIF (URL: ${item.url})${metaInfo}`);
          break;
        case 'video':
          parts.push(
            `[${index}] ${senderPrefix}Video ${item.duration || 0}s (URL: ${item.url})${metaInfo}`,
          );
          break;
        case 'voice':
          parts.push(
            `[${index}] ${senderPrefix}Tin nhắn thoại ${item.duration || 0}s (URL: ${item.url})${metaInfo}`,
          );
          break;
        case 'file':
          parts.push(
            `[${index}] ${senderPrefix}File "${item.fileName}" (URL: ${item.url})${metaInfo}`,
          );
          break;
        case 'link':
          parts.push(`[${index}] ${senderPrefix}Link: ${item.url}`);
          break;
        case 'contact': {
          // Bao gồm contactUserId để AI nhắc đến user bằng TEXT (chỉ [card] mới gửi danh thiếp của bot)
          const contactInfo = [
            item.contactName || item.text || '(không rõ tên)',
            item.contactPhone ? `SĐT: ${item.contactPhone}` : null,
            item.contactUserId ? `UserID: ${item.contactUserId}` : null,
          ]
            .filter(Boolean)
            .join(', ');
          parts.push(`[${index}] ${senderPrefix}Danh thiếp: ${contactInfo}`);
          break;
        }
      }
    });

    const groupNote = isGroup
      ? `\n\n⚠️ ĐÂY LÀ NHÓM CHAT - Mỗi tin nhắn có TÊN NGƯỜI GỬI phía trước. Hãy chú ý AI ĐANG TRẢ LỜI AI và quote đúng tin nhắn của người đó!`
      : '';

    return `Người dùng gửi ${items.length} nội dung theo thứ tự (số trong ngoặc vuông là INDEX):
${parts.join('\n')}${groupNote}

HƯỚNG DẪN QUAN TRỌNG VỀ INDEX:
⚠️ INDEX CHỈ ÁP DỤNG CHO CÁC TIN NHẮN TRONG DANH SÁCH TRÊN (từ [0] đến [${items.length - 1}])!
⚠️ KHÔNG ĐƯỢC dùng index ngoài phạm vi này! Nếu dùng index không hợp lệ, quote sẽ bị bỏ qua.

- Dùng [quote:INDEX]câu trả lời[/quote] để reply vào tin nhắn cụ thể (CHỈ viết câu trả lời, KHÔNG lặp lại nội dung tin gốc!)
- Dùng [reaction:INDEX:loại] để thả reaction vào tin cụ thể
- Nếu không cần quote/react tin cụ thể, cứ trả lời bình thường

HƯỚNG DẪN XỬ LÝ MEDIA:
- Ảnh/video/voice/file: bot tự xử lý inline qua Gemini multimodal (xem nội dung, tóm tắt, trả lời).
- Khi cần nhắc đến user đã gửi danh thiếp, hãy NHẮC BẰNG TEXT thông thường (tên hoặc UserID).
  Ví dụ: [msg]Mình đã lưu thông tin UserID 123456 rồi nha![/msg] (chỉ text, KHÔNG dùng tag [card])

Hãy XEM/NGHE tất cả nội dung đính kèm và phản hồi phù hợp.`;
  },

  // Lưu ý thêm cho media
  mediaNote: (notes: string[]) => (notes.length > 0 ? `\n\nLưu ý: ${notes.join(', ')}` : ''),

  // Rate limit message
  rateLimit: (seconds: number) => `⏳ Đợi ${seconds}s nữa AI mới trả lời nhé...`,

  // Prefix hint
  prefixHint: (prefix: string) => `💡 Cú pháp: ${prefix} <câu hỏi>`,
};
