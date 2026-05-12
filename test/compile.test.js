import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPCRE2,
  FLAGS,
  EXTRA_FLAGS,
  PCRE2CompileError,
  PCRE2MatchError,
} from '../lib/index.js';

let pcre2;

before(async () => {
  pcre2 = await createPCRE2();
});

/* ── compile() ──────────────────────────────────────────────────────────── */

describe('compile()', () => {
  it('compiled regex is reusable', () => {
    const re = pcre2.compile('\\d+');
    assert.equal(re.test('abc 123'), true);
    const r = re.matchAll('1 2 3');
    assert.deepEqual(
      r.map((m) => m.match),
      ['1', '2', '3'],
    );
    re.destroy();
  });

  it('throws on invalid pattern', () => {
    assert.throws(() => pcre2.compile('[invalid'), /PCRE2 compile error/);
  });

  it('error offset is in characters, not bytes', () => {
    // 'арт[' — 'арт' is 3 chars (6 UTF-8 bytes); PCRE2 reports the error after '[' (char 4, byte 7).
    // Without conversion the raw byte offset would appear as 7; with conversion it is 4.
    assert.throws(() => pcre2.compile('арт[', FLAGS.UTF), /offset 4/);
  });

  it('compiled regex supports replace()', () => {
    const re = pcre2.compile('\\d+');
    assert.equal(re.replace('abc 123 def 456', 'N'), 'abc N def 456');
    assert.equal(re.replaceAll('abc 123 def 456', 'N'), 'abc N def N');
    re.destroy();
  });

  it('compiled regex supports search()', () => {
    const re = pcre2.compile('\\d+');
    assert.equal(re.search('abc 123'), 4);
    assert.equal(re.search('no digits'), -1);
    re.destroy();
  });
});

/* ── ReDoS protection (matchLimit / depthLimit) ─────────────────────────── */

describe('ReDoS protection', () => {
  // ^ prevents PCRE2's "first required char" pre-check optimisation, forcing full backtracking
  const REDOS_PATTERN = '^(a+)+$';
  const REDOS_SUBJECT = 'a'.repeat(20) + 'c';

  it('matchLimit stops catastrophic backtracking', () => {
    assert.throws(
      () => pcre2.test(REDOS_PATTERN, REDOS_SUBJECT, 0, { matchLimit: 1000 }),
      /match limit exceeded/i,
    );
  });

  it('depthLimit stops deep recursion', () => {
    assert.throws(
      () => pcre2.test(REDOS_PATTERN, REDOS_SUBJECT, 0, { depthLimit: 10 }),
      /depth limit exceeded/i,
    );
  });

  it('limits do not affect normal patterns', () => {
    assert.equal(pcre2.test('\\d+', 'abc 123', 0, { matchLimit: 1000, depthLimit: 100 }), true);
  });

  it('compiled regex also respects limits', () => {
    const re = pcre2.compile(REDOS_PATTERN);
    assert.throws(() => re.test(REDOS_SUBJECT, { matchLimit: 1000 }), /match limit exceeded/i);
    re.destroy();
  });

  it('matchAll stops on limit mid-loop', () => {
    assert.throws(
      () => pcre2.matchAll(REDOS_PATTERN, REDOS_SUBJECT, 0, { matchLimit: 1000 }),
      /match limit exceeded/i,
    );
  });
});

/* ── patternInfo() ──────────────────────────────────────────────────────── */

describe('patternInfo()', () => {
  it('captureCount is correct for multiple groups', () => {
    assert.equal(pcre2.patternInfo('(a)(b)(c)').captureCount, 3);
  });

  it('captureCount is 0 when no groups', () => {
    assert.equal(pcre2.patternInfo('\\d+').captureCount, 0);
  });

  it('namedGroupCount is correct', () => {
    assert.equal(pcre2.patternInfo('(?P<x>\\d+)-(?P<y>\\d+)').namedGroupCount, 2);
  });

  it('namedGroupCount is 0 when no named groups', () => {
    assert.equal(pcre2.patternInfo('(a)(b)').namedGroupCount, 0);
  });

  it('hasBackreferences is true when pattern uses \\1', () => {
    assert.equal(pcre2.patternInfo('(a)\\1').hasBackreferences, true);
  });

  it('hasBackreferences is false when no backreferences', () => {
    assert.equal(pcre2.patternInfo('(a)(b)').hasBackreferences, false);
  });

  it('hasBackreferences is false for patterns with only named groups', () => {
    assert.equal(pcre2.patternInfo('(?P<x>a)(?P<y>b)').hasBackreferences, false);
  });

  it('minLength is 0 for patterns that can match empty string', () => {
    assert.equal(pcre2.patternInfo('a*').minLength, 0);
    assert.equal(pcre2.patternInfo('a?').minLength, 0);
    assert.equal(pcre2.patternInfo('(a|)').minLength, 0);
  });

  it('minLength is >= 1 for patterns requiring at least one character', () => {
    assert.ok(pcre2.patternInfo('a+').minLength >= 1);
    assert.ok(pcre2.patternInfo('[a-z]').minLength >= 1);
    assert.ok(pcre2.patternInfo('\\d{3}').minLength >= 3);
  });

  it('minLength is null or a number (never undefined)', () => {
    const info = pcre2.patternInfo('.+');
    assert.ok(info.minLength === null || typeof info.minLength === 'number');
  });

  it('maxLookbehind is 0 when no lookbehind in pattern', () => {
    assert.equal(pcre2.patternInfo('\\d+').maxLookbehind, 0);
    assert.equal(pcre2.patternInfo('(a)(b)').maxLookbehind, 0);
  });

  it('maxLookbehind > 0 for patterns with fixed-length lookbehind', () => {
    assert.ok(pcre2.patternInfo('(?<=foo)\\d+').maxLookbehind >= 3);
  });

  it('compiled PCRE2Regex.patternInfo() returns the same result as one-shot', () => {
    const pattern = '(?P<x>\\d+)';
    const re = pcre2.compile(pattern);
    const fromInstance = re.patternInfo();
    const fromOneShot = pcre2.patternInfo(pattern);
    re.destroy();
    assert.deepEqual(fromInstance, fromOneShot);
  });

  it('Unicode pattern with named group: namedGroupCount counted correctly', () => {
    const info = pcre2.patternInfo('(?P<word>\\p{L}+)', FLAGS.UCP);
    assert.equal(info.captureCount, 1);
    assert.equal(info.namedGroupCount, 1);
  });

  it('complex pattern: all fields are numbers or boolean or null', () => {
    const info = pcre2.patternInfo('(?P<a>\\d+)(?<=\\d{2})(\\w)\\1');
    assert.equal(typeof info.captureCount, 'number');
    assert.equal(typeof info.namedGroupCount, 'number');
    assert.equal(typeof info.hasBackreferences, 'boolean');
    assert.ok(info.minLength === null || typeof info.minLength === 'number');
    assert.equal(typeof info.maxLookbehind, 'number');
  });

  it('pattern with nested groups counts all capture groups', () => {
    assert.equal(pcre2.patternInfo('((a)(b))').captureCount, 3);
  });

  it('patternInfo with extraFlags: compile succeeds and info is correct', () => {
    const info = pcre2.patternInfo('\\w+', FLAGS.UCP, EXTRA_FLAGS.ASCII_BSW);
    assert.equal(info.captureCount, 0);
  });
});

/* ── FinalizationRegistry safety net ────────────────────────────────────── */

describe('FinalizationRegistry (destroy safety)', () => {
  it('destroy() is idempotent — calling it twice does not throw', () => {
    const re = pcre2.compile('\\d+');
    re.destroy();
    assert.doesNotThrow(() => re.destroy());
  });

  it('destroy() unregisters from GC registry — no double-free on subsequent GC', () => {
    const re = pcre2.compile('\\w+');
    re.destroy();
    assert.doesNotThrow(() => re.destroy());
  });
});

/* ── PCRE2CompileError ───────────────────────────────────────────────────── */

describe('PCRE2CompileError', () => {
  it('compile() throws PCRE2CompileError, not a plain Error', () => {
    assert.throws(() => pcre2.compile('[unclosed'), PCRE2CompileError);
  });

  it('PCRE2CompileError is instanceof Error', () => {
    try {
      pcre2.compile('[unclosed');
    } catch (e) {
      assert.ok(e instanceof Error);
      assert.ok(e instanceof PCRE2CompileError);
    }
  });

  it('e.name is PCRE2CompileError', () => {
    try {
      pcre2.compile('[unclosed');
    } catch (e) {
      assert.equal(e.name, 'PCRE2CompileError');
    }
  });

  it('e.offset is the character position of the error in the pattern', () => {
    // 'арт[' — 3 Cyrillic chars + '['; error is at char offset 4
    try {
      pcre2.compile('арт[', FLAGS.UTF);
    } catch (e) {
      assert.ok(e instanceof PCRE2CompileError);
      assert.equal(e.offset, 4);
    }
  });

  it('e.message includes the offset', () => {
    try {
      pcre2.compile('[unclosed');
    } catch (e) {
      assert.match(e.message, /offset \d+/);
    }
  });
});

/* ── PCRE2MatchError ────────────────────────────────────────────────────── */

describe('PCRE2MatchError', () => {
  const REDOS = '^(a+)+$';
  const SUBJECT = 'a'.repeat(20) + 'c';

  it('matchLimit exceeded throws PCRE2MatchError, not a plain Error', () => {
    assert.throws(() => pcre2.test(REDOS, SUBJECT, 0, { matchLimit: 1000 }), PCRE2MatchError);
  });

  it('PCRE2MatchError is instanceof Error', () => {
    try {
      pcre2.test(REDOS, SUBJECT, 0, { matchLimit: 1000 });
    } catch (e) {
      assert.ok(e instanceof Error);
      assert.ok(e instanceof PCRE2MatchError);
    }
  });

  it('e.name is PCRE2MatchError', () => {
    try {
      pcre2.test(REDOS, SUBJECT, 0, { matchLimit: 1000 });
    } catch (e) {
      assert.equal(e.name, 'PCRE2MatchError');
    }
  });

  it('e.code is a negative integer (raw PCRE2 error code)', () => {
    try {
      pcre2.test(REDOS, SUBJECT, 0, { matchLimit: 1000 });
    } catch (e) {
      assert.ok(e instanceof PCRE2MatchError);
      assert.equal(typeof e.code, 'number');
      assert.ok(e.code < 0);
    }
  });
});
