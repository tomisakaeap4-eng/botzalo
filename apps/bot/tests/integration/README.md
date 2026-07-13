## API Keys Required

Tests đọc API keys từ file `.env.test` (không phải `.env`).
Tests sẽ tự động skip nếu key không có.

| Test Suite | Required Key | Get Key At |
|------------|--------------|------------|
| Giphy | `GIPHY_API_KEY` | https://developers.giphy.com |
| ElevenLabs | `ELEVENLABS_API_KEY` | https://elevenlabs.io (legacy) |
| Edge TTS | _(không cần)_ | Microsoft Edge TTS service (miễn phí) |
| ComPDF | `COMPDF_API_KEY` | https://www.compdf.com |
| Gemini | `GEMINI_API_KEY_1` ... `GEMINI_API_KEY_N` | https://aistudio.google.com |
| Zalo | `ZALO_CREDENTIALS_BASE64` | Zalo login |
| TVU | `TVU_USERNAME`, `TVU_PASSWORD` | TVU student portal |
