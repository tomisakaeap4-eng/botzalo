/**
 * Utility Client - QR Code Generator
 * Sử dụng API miễn phí không cần key
 */

import { debugLog, logError } from '../../../core/logger/logger.js';
import { fetchImageAsBuffer } from '../../../shared/utils/httpClient.js';

// ═══════════════════════════════════════════════════
// QR CODE GENERATOR (goqr.me)
// ═══════════════════════════════════════════════════

export interface QRCodeOptions {
  data: string;
  size?: number; // 100-1000, default 300
  format?: 'png' | 'svg' | 'jpg';
}

export interface QRCodeResult {
  url: string;
  buffer: Buffer;
  mimeType: string;
  size: number;
}

/**
 * Tạo QR Code từ text/URL
 * API: https://goqr.me/api/
 */
export async function generateQRCode(options: QRCodeOptions): Promise<QRCodeResult | null> {
  try {
    const { data, size = 300, format = 'png' } = options;

    // Validate size
    const validSize = Math.min(1000, Math.max(100, size));

    // Build URL
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${validSize}x${validSize}&data=${encodeURIComponent(data)}&format=${format}`;

    debugLog('QR', `Generating QR: ${data.substring(0, 50)}...`);

    // Fetch image
    const result = await fetchImageAsBuffer(qrUrl);
    if (!result) {
      return null;
    }

    debugLog('QR', `✓ QR generated: ${result.buffer.length} bytes`);

    return {
      url: qrUrl,
      buffer: result.buffer,
      mimeType: result.mimeType,
      size: validSize,
    };
  } catch (error: any) {
    logError('generateQRCode', error);
    return null;
  }
}
