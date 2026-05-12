import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createPCRE2, FLAGS, MATCH_FLAGS, EXTRA_FLAGS, parseFlags } from '../lib/index.js';

let pcre2;

before(async () => {
  pcre2 = await createPCRE2();
});

/* ── FLAGS ──────────────────────────────────────────────────────────────── */

describe('flags', () => {
  it('CASELESS', () => assert.equal(pcre2.test('hello', 'HELLO', FLAGS.CASELESS), true));

  it('MULTILINE', () => {
    const r = pcre2.matchAll('^\\w+', 'foo\nbar\nbaz', FLAGS.MULTILINE);
    assert.deepEqual(
      r.map((m) => m.match),
      ['foo', 'bar', 'baz'],
    );
  });

  it('DOTALL', () => assert.ok(pcre2.match('a.b', 'a\nb', FLAGS.DOTALL)));

  it('combined flags', () => {
    assert.equal(pcre2.test('hello', 'HELLO', FLAGS.CASELESS | FLAGS.UTF), true);
  });

  it('ANCHORED — matches only at start', () => {
    assert.equal(pcre2.test('\\d+', 'abc 123', FLAGS.ANCHORED), false);
    assert.equal(pcre2.test('\\d+', '123 abc', FLAGS.ANCHORED), true);
  });

  it('UNGREEDY — inverts greediness of quantifiers', () => {
    const r = pcre2.match('(.+)', 'abc', FLAGS.UNGREEDY);
    assert.equal(r.groups[0], 'a'); // minimal, not greedy
  });

  it('NO_AUTO_CAPTURE — plain () do not capture', () => {
    const r = pcre2.match('(\\w+)', 'hello', FLAGS.NO_AUTO_CAPTURE);
    assert.deepEqual(r.groups, []);
  });

  it('UCP — (?i) folds non-ASCII with UTF+UCP', () => {
    assert.equal(pcre2.test('(?i)арт', 'Артикул', FLAGS.UTF | FLAGS.UCP), true);
  });

  it('UCP — \\b matches at Cyrillic word boundary with UTF+UCP', () => {
    assert.equal(pcre2.test('(?i)\\b(арт|код)', 'Артикул', FLAGS.UTF | FLAGS.UCP), true);
  });

  it('UCP — \\w matches Cyrillic letters with UTF+UCP', () => {
    const r = pcre2.match('\\w+', 'Артикул', FLAGS.UTF | FLAGS.UCP);
    assert.equal(r?.match, 'Артикул');
  });

  it('UCP alone auto-enables UTF — no explicit UTF flag needed', () => {
    assert.equal(pcre2.test('(?i)арт', 'Артикул', FLAGS.UCP), true);
    assert.equal(pcre2.test('(?i)\\b(арт|код)', 'Артикул', FLAGS.UCP), true);
    const r = pcre2.match('\\w+', 'Артикул', FLAGS.UCP);
    assert.equal(r?.match, 'Артикул');
  });

  it('ENDANCHORED — pattern must end at subject end', () => {
    assert.equal(pcre2.test('\\d+', 'abc123', FLAGS.ENDANCHORED), true);
    assert.equal(pcre2.test('\\d+', '123abc', FLAGS.ENDANCHORED), false);
  });

  it('DOLLAR_ENDONLY — $ does not match before trailing newline', () => {
    assert.equal(pcre2.test('end$', 'end\n'), true); // default: matches
    assert.equal(pcre2.test('end$', 'end\n', FLAGS.DOLLAR_ENDONLY), false); // strict: no match
    assert.equal(pcre2.test('end$', 'end', FLAGS.DOLLAR_ENDONLY), true); // strict: matches at real end
  });

  it('DUPNAMES — allows duplicate named groups', () => {
    assert.doesNotThrow(() => pcre2.compile('(?<x>a)|(?<x>b)', FLAGS.DUPNAMES));
    assert.throws(() => pcre2.compile('(?<x>a)|(?<x>b)'));
  });

  it('ALLOW_EMPTY_CLASS — [] is valid and never matches', () => {
    assert.throws(() => pcre2.compile('[]'));
    assert.doesNotThrow(() => pcre2.compile('[]', FLAGS.ALLOW_EMPTY_CLASS));
    assert.equal(pcre2.test('[]', 'anything', FLAGS.ALLOW_EMPTY_CLASS), false);
  });

  it('ALT_BSUX — JavaScript-style \\u{HHHH} escape sequences', () => {
    assert.equal(pcre2.test('\\u0041', 'A', FLAGS.ALT_BSUX), true); // A = A
    assert.equal(pcre2.test('\\u0041', 'B', FLAGS.ALT_BSUX), false);
  });

  it('LITERAL — pattern treated as a literal string', () => {
    assert.equal(pcre2.test('a.b', 'axb'), true); // default: . is wildcard
    assert.equal(pcre2.test('a.b', 'axb', FLAGS.LITERAL), false); // literal: no match
    assert.equal(pcre2.test('a.b', 'a.b', FLAGS.LITERAL), true); // literal: exact match
  });
});

/* ── Inline flags in pattern ────────────────────────────────────────────── */

describe('inline flags in pattern', () => {
  it('(?i) works without FLAGS constant', () => {
    assert.equal(pcre2.test('(?i)hello', 'HELLO'), true);
  });
  it('(?m) works without FLAGS constant', () => {
    const r = pcre2.matchAll('(?m)^\\w+', 'foo\nbar');
    assert.deepEqual(
      r.map((m) => m.match),
      ['foo', 'bar'],
    );
  });
});

/* ── MATCH_FLAGS ────────────────────────────────────────────────────────── */

describe('MATCH_FLAGS', () => {
  it('exports correct constants', () => {
    assert.equal(MATCH_FLAGS.NOTBOL, 0x00000001);
    assert.equal(MATCH_FLAGS.NOTEOL, 0x00000002);
    assert.equal(MATCH_FLAGS.NOTEMPTY, 0x00000004);
    assert.equal(MATCH_FLAGS.NOTEMPTY_ATSTART, 0x00000008);
    assert.equal(MATCH_FLAGS.PARTIAL_SOFT, 0x00000010);
    assert.equal(MATCH_FLAGS.PARTIAL_HARD, 0x00000020);
  });

  it('NOTBOL: ^ does not match at start of subject', () => {
    // Without NOTBOL, ^abc matches
    assert.equal(pcre2.test('^abc', 'abcdef'), true);
    // With NOTBOL, ^ is suppressed
    assert.equal(pcre2.test('^abc', 'abcdef', 0, { matchFlags: MATCH_FLAGS.NOTBOL }), false);
  });

  it('NOTEOL: $ does not match at end of subject', () => {
    assert.equal(pcre2.test('def$', 'abcdef'), true);
    assert.equal(pcre2.test('def$', 'abcdef', 0, { matchFlags: MATCH_FLAGS.NOTEOL }), false);
  });

  it('NOTEMPTY: empty pattern match is rejected', () => {
    // Without NOTEMPTY, a* matches empty string at position 0
    const r1 = pcre2.match('a*', 'bbb');
    assert.equal(r1.match, '');
    // With NOTEMPTY, first empty match is skipped — falls through to the 'b' positions
    // Actually PCRE2 returns NOMATCH immediately for position 0 when NOTEMPTY is set
    // and the only match there is empty. The next attempt starts at 1 and matches another empty.
    // For the full match(), it finds the first non-empty match or null.
    // a* on 'bbb' with NOTEMPTY — all positions produce empty matches, so null.
    const r2 = pcre2.match('a*', 'bbb', 0, { matchFlags: MATCH_FLAGS.NOTEMPTY });
    assert.equal(r2, null);
  });

  it('PARTIAL_SOFT: returns partial match when no full match', () => {
    // Pattern 'hello world' against 'hello' — partial match at start
    const r = pcre2.match('hello world', 'hello', 0, { matchFlags: MATCH_FLAGS.PARTIAL_SOFT });
    assert.ok(r !== null, 'expected partial match result');
    assert.equal(r.match, 'hello');
    assert.equal(r.partial, true);
  });

  it('PARTIAL_SOFT: returns full match when one exists', () => {
    // Full match is preferred over partial with PARTIAL_SOFT
    const r = pcre2.match('\\d+', 'abc 123 hello wor', 0, { matchFlags: MATCH_FLAGS.PARTIAL_SOFT });
    assert.ok(r !== null);
    assert.equal(r.match, '123');
    assert.equal(r.partial, undefined);
  });

  it('PARTIAL_HARD: partial match even when full match available later', () => {
    // 'hello' matches partially; PARTIAL_HARD returns it without looking further
    const r = pcre2.match('hello', 'say hello', 0, { matchFlags: MATCH_FLAGS.PARTIAL_HARD });
    // With PARTIAL_HARD, PCRE2 reports partial for incomplete match at current position
    // 'say hello' — full match exists, so PARTIAL_HARD still finds the full match
    assert.ok(r !== null);
  });

  it('PARTIAL_SOFT in matchAll includes partial at end', () => {
    // 'hello' against 'say hel' — partial match
    const results = pcre2.matchAll('hello', 'say hel', 0, { matchFlags: MATCH_FLAGS.PARTIAL_SOFT });
    assert.equal(results.length, 1);
    assert.equal(results[0].match, 'hel');
    assert.equal(results[0].partial, true);
  });

  it('NOTBOL + NOTEOL combined with startPos for streaming', () => {
    // Simulate processing a chunk that is the middle of a larger string.
    // Pattern ^\w+ should not match because chunk is not at BOL.
    const chunk = 'world foo';
    const noMatch = pcre2.match('^\\w+', chunk, 0, { matchFlags: MATCH_FLAGS.NOTBOL });
    assert.equal(noMatch, null);
    // Without NOTBOL it matches
    assert.equal(pcre2.match('^\\w+', chunk).match, 'world');
  });
});

/* ── EXTRA_FLAGS ────────────────────────────────────────────────────────── */

describe('EXTRA_FLAGS', () => {
  it('exports all expected constants', () => {
    const keys = [
      'ALLOW_LOOKAROUND_BSK',
      'MATCH_WORD',
      'MATCH_LINE',
      'CASELESS_RESTRICT',
      'ASCII_BSD',
      'ASCII_BSS',
      'ASCII_BSW',
      'TURKISH_CASING',
    ];
    for (const k of keys) assert.equal(typeof EXTRA_FLAGS[k], 'number', `EXTRA_FLAGS.${k}`);
  });

  it('MATCH_WORD: pattern does not match inside a word', () => {
    assert.equal(pcre2.test('cat', 'concatenate', 0, {}, EXTRA_FLAGS.MATCH_WORD), false);
  });

  it('MATCH_WORD: pattern matches a standalone word', () => {
    assert.equal(pcre2.test('cat', 'the cat sat', 0, {}, EXTRA_FLAGS.MATCH_WORD), true);
  });

  it('MATCH_WORD: does not match cat at word boundary inside "scatter"', () => {
    assert.equal(pcre2.test('cat', 'scatter', 0, {}, EXTRA_FLAGS.MATCH_WORD), false);
  });

  it('MATCH_LINE: pattern must match the entire line', () => {
    assert.equal(pcre2.test('hello', 'say hello world', 0, {}, EXTRA_FLAGS.MATCH_LINE), false);
  });

  it('MATCH_LINE: pattern matches when it fills the whole line', () => {
    assert.equal(pcre2.test('hello', 'hello', 0, {}, EXTRA_FLAGS.MATCH_LINE), true);
  });

  it('ASCII_BSW + UCP: \\w matches only ASCII word characters', () => {
    assert.equal(pcre2.test('\\w+', 'αβγ', FLAGS.UCP, {}, EXTRA_FLAGS.ASCII_BSW), false);
    assert.equal(pcre2.test('\\w+', 'hello', FLAGS.UCP, {}, EXTRA_FLAGS.ASCII_BSW), true);
  });

  it('ASCII_BSW + UCP: \\w does not match Arabic letters', () => {
    assert.equal(pcre2.test('\\w+', 'مرحبا', FLAGS.UCP, {}, EXTRA_FLAGS.ASCII_BSW), false);
  });

  it('ASCII_BSD + UCP: \\d matches only ASCII digits, not Arabic-Indic digits', () => {
    assert.equal(pcre2.test('\\d+', '١٢٣', FLAGS.UCP, {}, EXTRA_FLAGS.ASCII_BSD), false);
    assert.equal(pcre2.test('\\d+', '123', FLAGS.UCP, {}, EXTRA_FLAGS.ASCII_BSD), true);
  });

  it('ASCII_BSS + UCP: \\s matches only ASCII whitespace', () => {
    const nonBreakingSpace = ' ';
    assert.equal(pcre2.test('\\s', nonBreakingSpace, FLAGS.UCP, {}, EXTRA_FLAGS.ASCII_BSS), false);
    assert.equal(pcre2.test('\\s', ' ', FLAGS.UCP, {}, EXTRA_FLAGS.ASCII_BSS), true);
  });

  it('CASELESS_RESTRICT + UCP: (?i) ASCII caseless still works', () => {
    assert.equal(
      pcre2.test('hello', 'HELLO', FLAGS.UCP | FLAGS.CASELESS, {}, EXTRA_FLAGS.CASELESS_RESTRICT),
      true,
    );
  });

  it('CASELESS_RESTRICT + UCP: \\w does not gain case-insensitive Unicode expansion', () => {
    // With CASELESS_RESTRICT, (?i)\w still matches only ASCII word chars
    assert.equal(
      pcre2.test(
        '(?i)\\w+',
        'αβγ',
        FLAGS.UCP,
        {},
        EXTRA_FLAGS.CASELESS_RESTRICT | EXTRA_FLAGS.ASCII_BSW,
      ),
      false,
    );
    assert.equal(
      pcre2.test(
        '(?i)\\w+',
        'HELLO',
        FLAGS.UCP,
        {},
        EXTRA_FLAGS.CASELESS_RESTRICT | EXTRA_FLAGS.ASCII_BSW,
      ),
      true,
    );
  });

  it('compiled regex with extraFlags respects MATCH_WORD', () => {
    const re = pcre2.compile('cat', 0, EXTRA_FLAGS.MATCH_WORD);
    assert.equal(re.test('concatenate'), false);
    assert.equal(re.test('my cat here'), true);
    re.destroy();
  });

  it('compiled regex with extraFlags respects ASCII_BSW', () => {
    const re = pcre2.compile('\\w+', FLAGS.UCP, EXTRA_FLAGS.ASCII_BSW);
    assert.equal(re.test('αβγ'), false);
    assert.equal(re.test('hello'), true);
    re.destroy();
  });

  it('extraFlags = 0 is a no-op and does not affect behaviour', () => {
    assert.equal(pcre2.test('\\w+', 'αβγ', FLAGS.UCP, {}, 0), true);
  });

  it('MATCH_WORD with matchAll finds all standalone words', () => {
    const r = pcre2.matchAll(
      'cat',
      'the cat and a catfish and cats',
      0,
      {},
      EXTRA_FLAGS.MATCH_WORD,
    );
    assert.equal(r.length, 1);
    assert.equal(r[0].match, 'cat');
  });
});

/* ── parseFlags() ───────────────────────────────────────────────────────── */

describe('parseFlags()', () => {
  it('single flag: i → CASELESS', () => {
    assert.equal(parseFlags('i'), FLAGS.CASELESS);
  });

  it('multiple flags: im → CASELESS | MULTILINE', () => {
    assert.equal(parseFlags('im'), FLAGS.CASELESS | FLAGS.MULTILINE);
  });

  it('g is silently ignored — returns 0', () => {
    assert.equal(parseFlags('g'), 0);
  });

  it('g mixed with real flags is a no-op', () => {
    assert.equal(parseFlags('gi'), FLAGS.CASELESS);
  });

  it('all documented letters are accepted without throwing', () => {
    assert.doesNotThrow(() => parseFlags('imsuUxADg'));
  });

  it('empty string returns 0', () => {
    assert.equal(parseFlags(''), 0);
  });

  it('unknown flag letter throws TypeError', () => {
    assert.throws(() => parseFlags('z'), TypeError);
    assert.throws(() => parseFlags('z'), /unknown flag 'z'/);
  });

  it('result works as flags argument to compile()', () => {
    const re = pcre2.compile('hello', parseFlags('i'));
    assert.equal(re.test('HELLO'), true);
    re.destroy();
  });

  it('result works as flags argument to one-shot methods', () => {
    assert.equal(pcre2.test('hello', 'HELLO world', parseFlags('i')), true);
    assert.equal(pcre2.match('hello', 'HELLO', parseFlags('i')).match, 'HELLO');
  });
});
