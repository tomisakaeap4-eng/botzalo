/**
 * Test: compactHistoryWithHandoff (integration)
 * Verify the coordinator's behavior: lock, AI success, AI failure,
 * skip paths (history too short, handoff disabled, under limit).
 */
import { describe, expect, it, beforeEach } from 'bun:test';
import { CONFIG } from '../../../src/core/config/config.js';
import {
  clearHistory,
  compactHistoryWithHandoff,
  getHistory,
  saveResponseToHistory,
  saveToHistory,
  saveToolResultToHistory,
} from '../../../src/shared/utils/history/history.js';
import {
  resetHandoffStateForTesting,
  setHandoffDocStubForTesting,
} from '../../../src/shared/utils/history/history.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('compactHistoryWithHandoff', () => {
  let origMaxTokens: number;

  beforeEach(() => {
    resetHandoffStateForTesting();
    origMaxTokens = CONFIG.maxTokenHistory;
  });

  /** Helper: pre-populate history với N messages đủ to để vượt maxTokens */
  async function seedThread(threadId: string, messageCount: number, charPerMsg = 400) {
    clearHistory(threadId);
    for (let i = 0; i < messageCount; i++) {
      // Each msg: ~100 tokens (text/4 + 100 overhead). 5 msgs @ 400 chars → ~500 tokens.
      await saveResponseToHistory(threadId, `Round ${i}: ${'x'.repeat(charPerMsg)}`);
    }
  }

  describe('happy path', () => {
    it('compacts over-limit history into [user handoff + model ack] (alternating roles)', async () => {
      const tid = `compact-ok-${Date.now()}`;
      await seedThread(tid, 5);
      expect(getHistory(tid).length).toBe(5);

      // Force over limit by lowering max
      CONFIG.maxTokenHistory = 50;
      setHandoffDocStubForTesting(async () => 'STUB_HANDOFF_DOC: user wanted a sandwich.');

      const success = await compactHistoryWithHandoff(tid);
      expect(success).toBe(true);

      const after = getHistory(tid);
      // [user-role handoff doc, model-role phantom ack] — 2 entries với alternating roles
      // để Gemini SDK (chat history phải alternate user/model) không reject ở turn kế tiếp.
      expect(after).toHaveLength(2);
      expect(after[0].role).toBe('user');
      expect(after[1].role).toBe('model');

      const handoffText = (after[0].parts[0] as any).text;
      expect(handoffText).toMatch(/\[HIDDEN_HANDOFF\]/);
      expect(handoffText).toContain('STUB_HANDOFF_DOC');
      expect(handoffText).toMatch(/DO NOT (reply|respond)/i);

      const ackText = (after[1].parts[0] as any).text;
      expect(ackText).toMatch(/\[HIDDEN_HANDOFF\]_ACK/);
      expect(ackText).toMatch(/OK/);

      clearHistory(tid);
      CONFIG.maxTokenHistory = origMaxTokens;
    });

    it('skips when under limit (fast path returns false, history untouched)', async () => {
      const tid = `compact-fastpath-${Date.now()}`;
      await seedThread(tid, 3, 50);
      expect(getHistory(tid).length).toBe(3);
      CONFIG.maxTokenHistory = 100_000; // way bigger than current → under limit

      const success = await compactHistoryWithHandoff(tid);
      expect(success).toBe(false);
      expect(getHistory(tid).length).toBe(3); // unchanged

      clearHistory(tid);
      CONFIG.maxTokenHistory = origMaxTokens;
    });

    it('skips when history.length < HANDOFF_MIN_HISTORY_LENGTH (4)', async () => {
      const tid = `compact-short-${Date.now()}`;
      await seedThread(tid, 3); // 3 < 4
      CONFIG.maxTokenHistory = 1; // force would-be over but length guard wins

      const success = await compactHistoryWithHandoff(tid);
      expect(success).toBe(false);
      expect(getHistory(tid).length).toBe(3);

      clearHistory(tid);
      CONFIG.maxTokenHistory = origMaxTokens;
    });
  });

  describe('failure path', () => {
    it('leaves history untouched when AI returns empty', async () => {
      const tid = `compact-fail-${Date.now()}`;
      await seedThread(tid, 5);
      const beforeLen = getHistory(tid).length;
      const beforeText = JSON.stringify(getHistory(tid));
      CONFIG.maxTokenHistory = 50;
      setHandoffDocStubForTesting(async () => ''); // simulate AI failure

      const success = await compactHistoryWithHandoff(tid);
      expect(success).toBe(false);
      expect(getHistory(tid).length).toBe(beforeLen);
      // History content unchanged
      expect(JSON.stringify(getHistory(tid))).toBe(beforeText);

      clearHistory(tid);
      CONFIG.maxTokenHistory = origMaxTokens;
    });

    it('concurrent calls + AI failure: lock prevents double-call, history untouched', async () => {
      const tid = `compact-race-fail-${Date.now()}`;
      await seedThread(tid, 5);
      const beforeLen = getHistory(tid).length;
      CONFIG.maxTokenHistory = 50;

      let stubCalls = 0;
      setHandoffDocStubForTesting(async () => {
        stubCalls++;
        await sleep(80); // slow stub
        return ''; // AI always returns empty
      });

      const [a, b] = await Promise.all([
        compactHistoryWithHandoff(tid),
        compactHistoryWithHandoff(tid),
      ]);

      // Lock: chỉ 1 invocation thực sự gọi AI
      expect(stubCalls).toBe(1);
      expect(a).toBe(false);
      expect(b).toBe(false);
      // History giữ nguyên vì cả 2 đều fail
      expect(getHistory(tid).length).toBe(beforeLen);

      clearHistory(tid);
      CONFIG.maxTokenHistory = origMaxTokens;
    });
  });

  describe('structural compliance for Gemini SDK', () => {
    it('compacted history has strict user→model alternation (SDK >2.x constraint)', async () => {
      const tid = `compact-alternating-${Date.now()}`;
      await seedThread(tid, 5);
      CONFIG.maxTokenHistory = 50;
      setHandoffDocStubForTesting(async () => 'CONTENT');

      await compactHistoryWithHandoff(tid);
      const after = getHistory(tid);

      // Critical: phải start với user-role rồi model-role. Nếu cả 2 đều user-role thì
      // Gemini SDK [user, user] liên tiếp → reject 400. Test này locks down cấu trúc.
      expect(after[0].role).toBe('user');
      expect(after[1].role).toBe('model');

      clearHistory(tid);
      CONFIG.maxTokenHistory = origMaxTokens;
    });
  });

  describe('disabled fallback', () => {
    it('handoff.enabled=false → falls back to shift trim', async () => {
      const tid = `compact-disabled-${Date.now()}`;
      await seedThread(tid, 10, 500); // 10 messages, mỗi cái ~500 chars → quá lớn
      const origEnabled = CONFIG.history?.handoff?.enabled;
      const origMaxTrim = CONFIG.history?.maxTrimAttempts;
      try {
        CONFIG.history!.handoff!.enabled = false;
        CONFIG.history!.maxTrimAttempts = 100;
        CONFIG.maxTokenHistory = 50;

        // Stub KHÔNG nên được gọi khi handoff disabled
        setHandoffDocStubForTesting(async () => 'SHOULD_NOT_BE_USED');

        const success = await compactHistoryWithHandoff(tid);
        // Fallback trim thành công → length giảm
        expect(success).toBe(true);
        const after = getHistory(tid);
        expect(after.length).toBeLessThan(10);
        // Each remaining msg should still be model role (shift trim keeps newest)
        for (const c of after) expect(c.role).toBe('model');
      } finally {
        if (origEnabled !== undefined) CONFIG.history!.handoff!.enabled = origEnabled;
        if (origMaxTrim !== undefined) CONFIG.history!.maxTrimAttempts = origMaxTrim;
        CONFIG.maxTokenHistory = origMaxTokens;
        clearHistory(tid);
      }
    });

    it('emergency shift-trim khi vượt 2x max (runaway safety net)', async () => {
      const tid = `compact-emergency-${Date.now()}`;
      await seedThread(tid, 10, 1000); // ~2500 tokens, vượt 2x 50
      CONFIG.maxTokenHistory = 50;

      // Handoff stub KHÔNG nên được gọi (trimHistoryByTokens không gọi handoff)
      setHandoffDocStubForTesting(async () => {
        throw new Error('STUB_SHOULD_NOT_BE_CALLED');
      });

      // Trigger user save → fires trimHistoryByTokens → emergency shift-trim
      await saveToHistory(tid, {
        isSelf: false,
        type: 0,
        data: { content: 'one more', msgType: 'text' },
      });

      // History should be reduced (shift trim ate oldest msgs)
      const after = getHistory(tid);
      expect(after.length).toBeLessThan(11);

      clearHistory(tid);
      CONFIG.maxTokenHistory = origMaxTokens;
    });
  });

  describe('safety: save* flows do NOT trigger handoff', () => {
    // Rule nghiêm: chỉ message.processor sau AI trả lời xong depth=0 turn mới được
    // trigger compactHistoryWithHandoff. Save flow bình thường KHÔNG được gọi AI.

    /** Use max high enough so we never truly "over" the limit → no trigger expected. Use
     * a counter stub so we can verify "0 calls" rather than just "no throw". */
    it('saveToHistory does NOT trigger handoff (counter stub stays 0)', async () => {
      const tid = `no-handoff-save-${Date.now()}`;
      await seedThread(tid, 3, 50);
      CONFIG.maxTokenHistory = 100_000; // well above current → no overflow path

      let stubCalls = 0;
      setHandoffDocStubForTesting(async () => {
        stubCalls++;
        return 'STUB_DOC';
      });

      await saveToHistory(tid, {
        isSelf: false,
        type: 0,
        data: { content: 'a new msg', msgType: 'text' },
      });
      expect(stubCalls).toBe(0); // handoff AI MUST NOT have been called
      expect(getHistory(tid).length).toBe(4); // 3 seeded + 1 new = 4

      clearHistory(tid);
      CONFIG.maxTokenHistory = origMaxTokens;
    });

    it('saveResponseToHistory does NOT trigger handoff', async () => {
      const tid = `no-handoff-resp-${Date.now()}`;
      await seedThread(tid, 3, 50);
      CONFIG.maxTokenHistory = 100_000;

      let stubCalls = 0;
      setHandoffDocStubForTesting(async () => {
        stubCalls++;
        return 'STUB_DOC';
      });

      await saveResponseToHistory(tid, 'partial AI response mid-tool-loop');
      expect(stubCalls).toBe(0);
      expect(getHistory(tid).length).toBe(4);

      clearHistory(tid);
      CONFIG.maxTokenHistory = origMaxTokens;
    });

    it('saveToolResultToHistory does NOT trigger handoff', async () => {
      const tid = `no-handoff-tool-${Date.now()}`;
      await seedThread(tid, 3, 50);
      CONFIG.maxTokenHistory = 100_000;

      let stubCalls = 0;
      setHandoffDocStubForTesting(async () => {
        stubCalls++;
        return 'STUB_DOC';
      });

      await saveToolResultToHistory(tid, '[Tool: search] 5 results');
      expect(stubCalls).toBe(0);
      expect(getHistory(tid).length).toBe(4);

      clearHistory(tid);
      CONFIG.maxTokenHistory = origMaxTokens;
    });

    it('even when over max, save flows do NOT trigger handoff (only emergency shift-trim)', async () => {
      // Under emergency threshold (2x max) but over max → no handoff, no trim.
      // Just verify the stub stays untouched even when overflow exists.
      const tid = `no-handoff-overflow-${Date.now()}`;
      await seedThread(tid, 4, 300); // ~4×80=320 tokens est
      CONFIG.maxTokenHistory = 200; // over max but under 2x → no emergency

      let stubCalls = 0;
      setHandoffDocStubForTesting(async () => {
        stubCalls++;
        return 'STUB_DOC';
      });

      await saveToHistory(tid, {
        isSelf: false,
        type: 0,
        data: { content: 'a new msg', msgType: 'text' },
      });
      expect(stubCalls).toBe(0); // critical: not called even though over max

      clearHistory(tid);
      CONFIG.maxTokenHistory = origMaxTokens;
    });
  });

  describe('concurrency lock', () => {
    it('two concurrent calls only invoke AI once', async () => {
      const tid = `compact-race-${Date.now()}`;
      await seedThread(tid, 5);
      CONFIG.maxTokenHistory = 50;

      let stubCalls = 0;
      setHandoffDocStubForTesting(async () => {
        stubCalls++;
        await sleep(80); // slow stub — give second caller time to enter
        return `STUB_CALL_${stubCalls}`;
      });

      const [a, b] = await Promise.all([
        compactHistoryWithHandoff(tid),
        compactHistoryWithHandoff(tid),
      ]);

      // Một trong hai gọi thật, một trả về false do lock
      expect(stubCalls).toBe(1);
      expect(a === true || b === true).toBe(true);
      // Lịch sử compact đúng 1 lần → 2 entries (user: handoff doc + model: phantom ack)
      expect(getHistory(tid).length).toBe(2);

      clearHistory(tid);
      CONFIG.maxTokenHistory = origMaxTokens;
    });
  });
});
