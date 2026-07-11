/**
 * Integration Test: Utility APIs (QR Code)
 * Test chức năng tạo QR (miễn phí, không cần API key)
 */

import { describe, test, expect } from 'bun:test';
import { isHttpFetchDisabled } from '../../../src/shared/utils/httpClient.js';
import { generateQRCode } from '../../../src/modules/system/services/utilityClient.js';
import { TEST_CONFIG } from '../setup.js';

// Skip các test phụ thuộc vào external HTTP API khi `.env.test` đặt
// DISABLE_HTTP_FETCH=true. Setup file: apps/bot/.env.test.
const SKIP_REMOTE = isHttpFetchDisabled();

describe.skipIf(SKIP_REMOTE)('QR Code API - goqr.me', () => {
  test('generateQRCode - basic text', async () => {
    const result = await generateQRCode({ data: 'Hello World' });

    expect(result).not.toBeNull();
    expect(result!.buffer).toBeInstanceOf(Buffer);
    expect(result!.buffer.length).toBeGreaterThan(100);
    expect(result!.mimeType).toContain('image');
    expect(result!.size).toBe(300);
    expect(result!.url).toContain('api.qrserver.com');
  }, TEST_CONFIG.timeout);

  test('generateQRCode - URL', async () => {
    const result = await generateQRCode({ data: 'https://google.com' });

    expect(result).not.toBeNull();
    expect(result!.buffer.length).toBeGreaterThan(100);
  }, TEST_CONFIG.timeout);

  test('generateQRCode - custom size', async () => {
    const result = await generateQRCode({ data: 'Test', size: 500 });

    expect(result).not.toBeNull();
    expect(result!.size).toBe(500);
  }, TEST_CONFIG.timeout);

  test('generateQRCode - Vietnamese text', async () => {
    const result = await generateQRCode({ data: 'Xin chào Việt Nam' });

    expect(result).not.toBeNull();
    expect(result!.buffer.length).toBeGreaterThan(100);
  }, TEST_CONFIG.timeout);

  test('generateQRCode - phone number', async () => {
    const result = await generateQRCode({ data: 'tel:+84123456789' });

    expect(result).not.toBeNull();
    expect(result!.buffer.length).toBeGreaterThan(100);
  }, TEST_CONFIG.timeout);

  test('generateQRCode - email', async () => {
    const result = await generateQRCode({ data: 'mailto:test@example.com' });

    expect(result).not.toBeNull();
    expect(result!.buffer.length).toBeGreaterThan(100);
  }, TEST_CONFIG.timeout);

  test('generateQRCode - WiFi config', async () => {
    const wifiConfig = 'WIFI:T:WPA;S:MyNetwork;P:MyPassword;;';
    const result = await generateQRCode({ data: wifiConfig });

    expect(result).not.toBeNull();
    expect(result!.buffer.length).toBeGreaterThan(100);
  }, TEST_CONFIG.timeout);

  test('generateQRCode - size clamping (too small)', async () => {
    const result = await generateQRCode({ data: 'Test', size: 50 });

    expect(result).not.toBeNull();
    expect(result!.size).toBe(100); // Clamped to min
  }, TEST_CONFIG.timeout);

  test('generateQRCode - size clamping (too large)', async () => {
    const result = await generateQRCode({ data: 'Test', size: 2000 });

    expect(result).not.toBeNull();
    expect(result!.size).toBe(1000); // Clamped to max
  }, TEST_CONFIG.timeout);
});

describe.skipIf(SKIP_REMOTE)('Utility APIs - Error Handling', () => {
  test('generateQRCode - empty data still works', async () => {
    // QR API accepts empty string but generates empty QR
    const result = await generateQRCode({ data: ' ' });
    expect(result).not.toBeNull();
  }, TEST_CONFIG.timeout);
});
