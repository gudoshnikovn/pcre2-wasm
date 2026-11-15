import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  createPCRE2,
  FLAGS,
  MATCH_FLAGS,
  REPLACE_FLAGS,
  EXTRA_FLAGS,
  PCRE2CompileError,
} from '../lib/index.js';

let pcre2;

before(async () => {
  pcre2 = await createPCRE2();
});

/* ── Constants match pcre2.h ────────────────────────────────────────────── */

const HEADER = new URL('../pcre2/src/pcre2.h.generic', import.meta.url);

describe('constants match pcre2.h', { skip: !existsSync(HEADER) && 'run make setup first' }, () => {
  const defs = {};
  if (existsSync(HEADER)) {
    const text = readFileSync(HEADER, 'utf8');
    for (const [, name, hex] of text.matchAll(/#define\s+(PCRE2_\w+)\s+0x([0-9a-f]+)u/gi))
      defs[name] = parseInt(hex, 16);
  }
  const groups = [
    ['FLAGS', FLAGS, 'PCRE2_'],
    ['MATCH_FLAGS', MATCH_FLAGS, 'PCRE2_'],
    ['REPLACE_FLAGS', REPLACE_FLAGS, 'PCRE2_SUBSTITUTE_'],
    ['EXTRA_FLAGS', EXTRA_FLAGS, 'PCRE2_EXTRA_'],
  ];
  for (const [group, consts, prefix] of groups) {
    it(group, () => {
      for (const [k, v] of Object.entries(consts))
        assert.equal(v, defs[prefix + k], `${group}.${k}`);
    });
  }
});

/* ── MATCH_FLAGS ────────────────────────────────────────────────────────── */

describe('MATCH_FLAGS.ANCHORED / ENDANCHORED', () => {
  it('ANCHORED matches only at startPos', () => {
    const re = pcre2.compile('\\d+');
    assert.equal(re.match('ab12', { startPos: 2, matchFlags: MATCH_FLAGS.ANCHORED }).match, '12');
    assert.equal(re.match('ab12', { startPos: 1, matchFlags: MATCH_FLAGS.ANCHORED }), null);
  });

  it('ANCHORED in matchAll stops at the first gap, like the JS gy flags', () => {
    const r = pcre2.matchAll('\\d', '12a3', 0, { matchFlags: MATCH_FLAGS.ANCHORED });
    assert.deepEqual(
      r.map((m) => m.match),
      [...'12a3'.matchAll(/\d/gy)].map((m) => m[0]),
    );
  });

  it('ENDANCHORED: the match must end at the end of the subject', () => {
    const opts = { matchFlags: MATCH_FLAGS.ENDANCHORED };
    assert.equal(pcre2.match('\\d+', '12 34', 0, opts).match, '34');
    assert.equal(pcre2.match('\\d+', '12 34x', 0, opts), null);
  });
});

/* ── FLAGS ──────────────────────────────────────────────────────────────── */

describe('FLAGS', () => {
  it('FIRSTLINE: the match must start on the first line', () => {
    assert.equal(pcre2.test('b', 'a\nb', FLAGS.FIRSTLINE), false);
    assert.equal(pcre2.test('a\\nb', 'a\nb', FLAGS.FIRSTLINE), true);
  });

  it('MATCH_UNSET_BACKREF: a backreference to an unset group matches "", as in JS', () => {
    assert.equal(pcre2.test('(a)?\\1b', 'b'), false);
    assert.equal(pcre2.test('(a)?\\1b', 'b', FLAGS.MATCH_UNSET_BACKREF), /(a)?\1b/.test('b'));
  });

  it('NEVER_UTF / NEVER_UCP forbid (*UTF) / (*UCP) in the pattern', () => {
    assert.throws(() => pcre2.compile('(*UTF)a', FLAGS.NEVER_UTF), PCRE2CompileError);
    assert.throws(() => pcre2.compile('(*UCP)a', FLAGS.NEVER_UCP), PCRE2CompileError);
    pcre2.compile('(*UTF)a').destroy();
  });

  it('NEVER_BACKSLASH_C forbids \\C', () => {
    assert.throws(() => pcre2.compile('a\\C', FLAGS.NEVER_BACKSLASH_C), PCRE2CompileError);
  });

  it('MATCH_INVALID_UTF: a subject with lone surrogates can be searched in UTF mode', () => {
    const s = 'a\uD800bb';
    assert.throws(() => pcre2.match('b+', s, FLAGS.UTF));
    const r = pcre2.match('b+', s, FLAGS.MATCH_INVALID_UTF);
    assert.deepEqual([r.index, r.match], [2, 'bb']);
  });
});

/* ── EXTRA_FLAGS ────────────────────────────────────────────────────────── */

describe('EXTRA_FLAGS (more)', () => {
  it('BAD_ESCAPE_IS_LITERAL: an unknown escape is a literal character', () => {
    assert.throws(() => pcre2.compile('\\j'), PCRE2CompileError);
    assert.equal(pcre2.test('\\j', 'j', 0, {}, EXTRA_FLAGS.BAD_ESCAPE_IS_LITERAL), true);
  });

  it('ALT_BSUX: ECMAScript 6 \\u{...} escapes', () => {
    assert.equal(pcre2.test('\\u{1F600}', '😀', FLAGS.UTF, {}, EXTRA_FLAGS.ALT_BSUX), true);
    assert.equal(pcre2.test('\\u0041', 'A', 0, {}, EXTRA_FLAGS.ALT_BSUX), true);
  });

  it('ASCII_POSIX: [[:alpha:]] matches only ASCII even with UCP', () => {
    assert.equal(pcre2.test('^[[:alpha:]]$', 'ж', FLAGS.UCP), true);
    assert.equal(pcre2.test('^[[:alpha:]]$', 'ж', FLAGS.UCP, {}, EXTRA_FLAGS.ASCII_POSIX), false);
  });

  it('ASCII_DIGIT: [[:digit:]] matches only ASCII even with UCP', () => {
    const arabicFive = '٥';
    assert.equal(pcre2.test('^[[:digit:]]$', arabicFive, FLAGS.UCP), true);
    assert.equal(
      pcre2.test('^[[:digit:]]$', arabicFive, FLAGS.UCP, {}, EXTRA_FLAGS.ASCII_DIGIT),
      false,
    );
  });
});

/* ── REPLACE_FLAGS ──────────────────────────────────────────────────────── */

describe('REPLACE_FLAGS.REPLACEMENT_ONLY', () => {
  it('returns only the replacements', () => {
    const opts = { replaceFlags: REPLACE_FLAGS.REPLACEMENT_ONLY };
    assert.equal(pcre2.replaceAll('(\\d+)', 'a1 b22 c3', '<$1>', 0, opts), '<1><22><3>');
    assert.equal(pcre2.replace('(\\d+)', 'a1 b22', '<$1>', 0, opts), '<1>');
  });
});
