/**
 * Test: Handoff Generator (format helpers + stub injection)
 * Verify pure-function behavior; AI calls are bypassed via stub.
 */
import { describe, expect, it, beforeEach } from 'bun:test';
import type { Content } from '@google/genai';
import {
  buildHiddenHandoffContent,
  formatHistoryForAI,
  HIDDEN_HANDOFF_PREFIX,
  isHiddenHandoffContent,
  setHandoffDocStubForTesting,
  resetHandoffStateForTesting,
} from '../../../src/shared/utils/history/history.js';

describe('handoffGenerator — formatters', () => {
  beforeEach(() => {
    resetHandoffStateForTesting();
  });

  describe('formatHistoryForAI()', () => {
    it('emits User/AI labels for plain text turns', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'hello' }] },
        { role: 'model', parts: [{ text: 'hi there' }] },
      ];
      const out = formatHistoryForAI(history);
      expect(out).toContain('User: hello');
      expect(out).toContain('AI: hi there');
    });

    it('skips prior [HIDDEN_HANDOFF] entries to avoid meta-recursion', () => {
      const history: Content[] = [
        {
          role: 'user',
          parts: [{ text: `${HIDDEN_HANDOFF_PREFIX}\nold compacted summary` }],
        },
        { role: 'user', parts: [{ text: 'real follow-up' }] },
      ];
      const out = formatHistoryForAI(history);
      expect(out).not.toContain('old compacted summary');
      expect(out).toContain('User: real follow-up');
    });

    it('replaces inlineData media with placeholder', () => {
      const history: Content[] = [
        {
          role: 'user',
          parts: [{ text: 'Look at this' }, { inlineData: { mimeType: 'image/png', data: 'AA==' } }],
        },
      ];
      const out = formatHistoryForAI(history);
      expect(out).toContain('Look at this');
      expect(out).toContain('[Media: image/png]');
      expect(out).not.toContain('AA==');
    });

    it('returns empty string for empty history', () => {
      expect(formatHistoryForAI([])).toBe('');
    });

    it('emits media-only content as [Media: ...] placeholder', () => {
      // Media parts without text still render as placeholder — useful so AI summary knows
      // a media turn happened. (Only completely empty parts[] get skipped.)
      const history: Content[] = [
        { role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'AA==' } }] },
      ];
      const out = formatHistoryForAI(history);
      expect(out).toContain('[Media: image/png]');
      expect(out.startsWith('User: ')).toBe(true);
    });
  });

  describe('buildHiddenHandoffContent()', () => {
    it('returns user-role Content starting with [HIDDEN_HANDOFF] prefix', () => {
      const c = buildHiddenHandoffContent('Goal: ship v2 by Friday.');
      expect(c.role).toBe('user');
      expect(c.parts).toHaveLength(1);
      const text = (c.parts[0] as any).text;
      expect(text.startsWith(HIDDEN_HANDOFF_PREFIX)).toBe(true);
      expect(text).toContain('Goal: ship v2 by Friday.');
      // Should warn AI not to reply
      expect(text).toMatch(/DO NOT (reply|respond)/i);
    });
  });

  describe('isHiddenHandoffContent()', () => {
    it('returns true for content starting with prefix', () => {
      expect(isHiddenHandoffContent(buildHiddenHandoffContent('x'))).toBe(true);
    });
    it('returns false for normal content', () => {
      expect(
        isHiddenHandoffContent({ role: 'user', parts: [{ text: 'normal' }] }),
      ).toBe(false);
    });
    it('returns false for undefined/empty', () => {
      expect(isHiddenHandoffContent(undefined)).toBe(false);
      expect(isHiddenHandoffContent(null)).toBe(false);
      expect(isHiddenHandoffContent({ role: 'user', parts: [] })).toBe(false);
    });
  });
});

describe('handoffGenerator — generateHandoffDoc (stub path)', () => {
  beforeEach(() => {
    resetHandoffStateForTesting();
  });

  it('returns stub output directly without calling Gemini', async () => {
    setHandoffDocStubForTesting(async (transcript) => `STUB:${transcript.slice(0, 20)}`);
    const { generateHandoffDoc } = await import(
      '../../../src/shared/utils/history/history.js'
    );
    const result = await generateHandoffDoc([
      { role: 'user', parts: [{ text: 'hello world' }] },
    ]);
    expect(result).toMatch(/^STUB:/);
    expect(result).toContain('User: hello world');
  });

  it('returns empty string for empty transcript', async () => {
    const { generateHandoffDoc } = await import(
      '../../../src/shared/utils/history/history.js'
    );
    const result = await generateHandoffDoc([]);
    expect(result).toBe('');
  });
});
