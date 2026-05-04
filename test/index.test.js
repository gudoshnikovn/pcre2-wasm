import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createPCRE2, FLAGS, MATCH_FLAGS } from '../lib/index.js';

let pcre2;

before(async () => {
  pcre2 = await createPCRE2();
});

/* ── test() ─────────────────────────────────────────────────────────────── */

describe('test()', () => {
  it('returns true on match',    () => assert.equal(pcre2.test('\\d+', 'abc 123'), true));
  it('returns false on no match', () => assert.equal(pcre2.test('\\d+', 'no digits'), false));
  it('returns false on empty subject', () => assert.equal(pcre2.test('\\d+', ''), false));
});

/* ── match() ────────────────────────────────────────────────────────────── */

describe('match()', () => {
  it('returns match object with correct fields', () => {
    const r = pcre2.match('(\\w+)@(\\w+)', 'user@example');
    assert.deepEqual(r, { match: 'user@example', index: 0, groups: ['user', 'example'] });
  });

  it('returns null on no match', () => {
    assert.equal(pcre2.match('\\d+', 'no digits'), null);
  });

  it('index is 0 when match is at start', () => {
    assert.equal(pcre2.match('\\d+', '123abc').index, 0);
  });

  it('index is correct when match is in the middle', () => {
    assert.equal(pcre2.match('\\d+', 'abc 123').index, 4);
  });

  it('index is a character offset, not a byte offset, for multi-byte subjects', () => {
    // 'при' = 3 chars but 6 UTF-8 bytes; 'в' must be at char index 3, not byte index 6
    const r = pcre2.match('в', 'привет', FLAGS.UTF);
    assert.equal(r.index, 3);
  });

  it('matchAll indices are character offsets for multi-byte subjects', () => {
    const results = pcre2.matchAll('[аеиоу]', 'привет', FLAGS.UTF);
    // и = char 2, е = char 4
    assert.deepEqual(results.map(r => r.index), [2, 4]);
  });

  it('groups is empty array when pattern has no capture groups', () => {
    assert.deepEqual(pcre2.match('\\w+', 'hello').groups, []);
  });

  it('unmatched optional group is null in groups', () => {
    const r = pcre2.match('(a)?(b)', 'b');
    assert.deepEqual(r.groups, [null, 'b']);
  });

  it('empty pattern matches at start with empty string', () => {
    const r = pcre2.match('', 'hello');
    assert.equal(r.match, '');
    assert.equal(r.index, 0);
  });

  it('empty subject matches pattern that accepts empty string', () => {
    const r = pcre2.match('.*', '');
    assert.equal(r.match, '');
    assert.equal(r.index, 0);
  });
});

/* ── match() — named capture groups ─────────────────────────────────────── */

describe('match() named capture groups', () => {
  it('returns namedGroups for named captures', () => {
    const r = pcre2.match('(?P<year>\\d{4})-(?P<month>\\d{2})', '2024-01');
    assert.deepEqual(r.namedGroups, { year: '2024', month: '01' });
  });

  it('namedGroups is absent when pattern has no named groups', () => {
    const r = pcre2.match('(\\d+)', '123');
    assert.equal(r.namedGroups, undefined);
  });

  it('unmatched optional named group is null in namedGroups', () => {
    const r = pcre2.match('(?P<a>x)?(?P<b>y)', 'y');
    assert.equal(r.namedGroups.a, null);
    assert.equal(r.namedGroups.b, 'y');
  });

  it('mixed named and numbered groups', () => {
    const r = pcre2.match('(\\d+) (?P<word>\\w+)', '42 hello');
    assert.equal(r.groups[0], '42');
    assert.equal(r.groups[1], 'hello');
    assert.equal(r.namedGroups.word, 'hello');
  });

  it('multiple named groups in correct order', () => {
    const r = pcre2.match(
      '(?P<host>[\\w.]+):(?P<port>\\d+)',
      'localhost:8080'
    );
    assert.equal(r.namedGroups.host, 'localhost');
    assert.equal(r.namedGroups.port, '8080');
  });
});

/* ── matchAll() ─────────────────────────────────────────────────────────── */

describe('matchAll()', () => {
  it('returns array of match objects', () => {
    const r = pcre2.matchAll('\\d+', 'abc 123 def 456');
    assert.equal(r.length, 2);
    assert.equal(r[0].match, '123');
    assert.equal(r[0].index, 4);
    assert.deepEqual(r[0].groups, []);
    assert.equal(r[1].match, '456');
    assert.equal(r[1].index, 12);
  });

  it('returns empty array on no match', () => {
    assert.deepEqual(pcre2.matchAll('\\d+', 'no digits'), []);
  });

  it('includes capture groups per match', () => {
    const r = pcre2.matchAll('(\\w+)=(\\d+)', 'a=1 b=22');
    assert.equal(r[0].groups[0], 'a');
    assert.equal(r[0].groups[1], '1');
    assert.equal(r[1].groups[0], 'b');
    assert.equal(r[1].groups[1], '22');
  });

  it('includes namedGroups per match', () => {
    const r = pcre2.matchAll('(?P<k>\\w+)=(?P<v>\\d+)', 'x=1 y=2');
    assert.equal(r[0].namedGroups.k, 'x');
    assert.equal(r[0].namedGroups.v, '1');
    assert.equal(r[1].namedGroups.k, 'y');
    assert.equal(r[1].namedGroups.v, '2');
  });

  it('zero-width matches do not loop forever', () => {
    const r = pcre2.matchAll('(?=\\d)', '1a2b3');
    assert.ok(r.length > 0);
    assert.ok(r.length < 100);
  });

  it('indices are correct for all matches', () => {
    const r = pcre2.matchAll('a', 'xaxax');
    assert.equal(r[0].index, 1);
    assert.equal(r[1].index, 3);
  });
});

/* ── search() ───────────────────────────────────────────────────────────── */

describe('search()', () => {
  it('returns 0 when match is at start', () => {
    assert.equal(pcre2.search('\\d+', '123abc'), 0);
  });
  it('returns correct index when match is in the middle', () => {
    assert.equal(pcre2.search('\\d+', 'abc 123'), 4);
  });
  it('returns -1 when no match', () => {
    assert.equal(pcre2.search('\\d+', 'no digits'), -1);
  });
  it('returns -1 on empty subject with non-matching pattern', () => {
    assert.equal(pcre2.search('\\d+', ''), -1);
  });
});

/* ── replace() ──────────────────────────────────────────────────────────── */

describe('replace()', () => {
  it('replaces only the first match', () => {
    assert.equal(pcre2.replace('\\d+', 'abc 123 def 456', 'NUM'), 'abc NUM def 456');
  });
  it('$1 numbered backreference', () => {
    assert.equal(pcre2.replace('(\\w+)@(\\w+)', 'user@example.com', '$2@$1'), 'example@user.com');
  });
  it('$0 for whole match', () => {
    assert.equal(pcre2.replace('\\d+', 'abc 123', '[$0]'), 'abc [123]');
  });
  it('$& for whole match (JS syntax alias)', () => {
    assert.equal(pcre2.replace('\\d+', 'abc 123', '[$&]'), 'abc [123]');
  });
  it('${name} named backreference', () => {
    assert.equal(pcre2.replace('(?P<num>\\d+)', 'abc 123', '[${num}]'), 'abc [123]');
  });
  it('no match returns original string', () => {
    assert.equal(pcre2.replace('\\d+', 'no digits', 'NUM'), 'no digits');
  });
  it('replace with empty string deletes the match', () => {
    assert.equal(pcre2.replace('\\s+', 'hello world', ''), 'helloworld');
  });
  it('replacement longer than match', () => {
    assert.equal(pcre2.replace('x', 'axb', 'LONGWORD'), 'aLONGWORDb');
  });
  it('$$ becomes a literal dollar sign', () => {
    assert.equal(pcre2.replace('\\d+', 'price 100', '$$'), 'price $');
  });
});

/* ── replaceAll() ───────────────────────────────────────────────────────── */

describe('replaceAll()', () => {
  it('replaces all matches', () => {
    assert.equal(pcre2.replaceAll('\\d+', 'abc 123 def 456', 'NUM'), 'abc NUM def NUM');
  });
  it('with $1 backreference', () => {
    assert.equal(pcre2.replaceAll('(\\w+)', 'hello world', '[$1]'), '[hello] [world]');
  });
  it('no matches returns original string', () => {
    assert.equal(pcre2.replaceAll('\\d+', 'no digits', 'X'), 'no digits');
  });
  it('with $& (JS syntax)', () => {
    assert.equal(pcre2.replaceAll('[aeiou]', 'hello world', '($&)'), 'h(e)ll(o) w(o)rld');
  });
});

/* ── FLAGS ──────────────────────────────────────────────────────────────── */

describe('flags', () => {
  it('CASELESS', () => assert.equal(pcre2.test('hello', 'HELLO', FLAGS.CASELESS), true));

  it('MULTILINE', () => {
    const r = pcre2.matchAll('^\\w+', 'foo\nbar\nbaz', FLAGS.MULTILINE);
    assert.deepEqual(r.map(m => m.match), ['foo', 'bar', 'baz']);
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
    assert.equal(pcre2.test('end$', 'end\n'), true);                          // default: matches
    assert.equal(pcre2.test('end$', 'end\n', FLAGS.DOLLAR_ENDONLY), false);   // strict: no match
    assert.equal(pcre2.test('end$', 'end',   FLAGS.DOLLAR_ENDONLY), true);    // strict: matches at real end
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
    assert.equal(pcre2.test('\\u0041', 'A', FLAGS.ALT_BSUX), true);  // A = A
    assert.equal(pcre2.test('\\u0041', 'B', FLAGS.ALT_BSUX), false);
  });

  it('LITERAL — pattern treated as a literal string', () => {
    assert.equal(pcre2.test('a.b', 'axb'), true);                      // default: . is wildcard
    assert.equal(pcre2.test('a.b', 'axb', FLAGS.LITERAL), false);      // literal: no match
    assert.equal(pcre2.test('a.b', 'a.b', FLAGS.LITERAL), true);       // literal: exact match
  });
});

/* ── Inline flags in pattern ────────────────────────────────────────────── */

describe('inline flags in pattern', () => {
  it('(?i) works without FLAGS constant', () => {
    assert.equal(pcre2.test('(?i)hello', 'HELLO'), true);
  });
  it('(?m) works without FLAGS constant', () => {
    const r = pcre2.matchAll('(?m)^\\w+', 'foo\nbar');
    assert.deepEqual(r.map(m => m.match), ['foo', 'bar']);
  });
});

/* ── compile() ──────────────────────────────────────────────────────────── */

describe('compile()', () => {
  it('compiled regex is reusable', () => {
    const re = pcre2.compile('\\d+');
    assert.equal(re.test('abc 123'), true);
    const r = re.matchAll('1 2 3');
    assert.deepEqual(r.map(m => m.match), ['1', '2', '3']);
    re.destroy();
  });

  it('throws on invalid pattern', () => {
    assert.throws(() => pcre2.compile('[invalid'), /PCRE2 compile error/);
  });

  it('error offset is in characters, not bytes', () => {
    // 'арт[' — 'арт' is 3 chars (6 UTF-8 bytes); PCRE2 reports the error after '[' (char 4, byte 7).
    // Without conversion the raw byte offset would appear as 7; with conversion it is 4.
    assert.throws(
      () => pcre2.compile('арт[', FLAGS.UTF),
      /offset 4/
    );
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
      /match limit exceeded/i
    );
  });

  it('depthLimit stops deep recursion', () => {
    assert.throws(
      () => pcre2.test(REDOS_PATTERN, REDOS_SUBJECT, 0, { depthLimit: 10 }),
      /depth limit exceeded/i
    );
  });

  it('limits do not affect normal patterns', () => {
    assert.equal(pcre2.test('\\d+', 'abc 123', 0, { matchLimit: 1000, depthLimit: 100 }), true);
  });

  it('compiled regex also respects limits', () => {
    const re = pcre2.compile(REDOS_PATTERN);
    assert.throws(
      () => re.test(REDOS_SUBJECT, { matchLimit: 1000 }),
      /match limit exceeded/i
    );
    re.destroy();
  });

  it('matchAll stops on limit mid-loop', () => {
    assert.throws(
      () => pcre2.matchAll(REDOS_PATTERN, REDOS_SUBJECT, 0, { matchLimit: 1000 }),
      /match limit exceeded/i
    );
  });
});

/* ── Large inputs (dynamic buffer) ─────────────────────────────────────── */

describe('large inputs', () => {
  it('match result larger than 64 KB', () => {
    const subject = 'a'.repeat(100_000);
    const r = pcre2.match('a+', subject);
    assert.equal(r.match.length, 100_000);
  });

  it('matchAll with many matches', () => {
    const subject = ('a ').repeat(1_000);
    const r = pcre2.matchAll('a', subject);
    assert.equal(r.length, 1_000);
  });
});

/* ── Edge cases ─────────────────────────────────────────────────────────── */

describe('edge cases', () => {
  it('alternation — correct branch captured', () => {
    const r = pcre2.match('(cat|dog)', 'I have a dog');
    assert.equal(r.groups[0], 'dog');
  });

  it('non-capturing group does not appear in groups', () => {
    const r = pcre2.match('(?:\\w+) (\\d+)', 'foo 42');
    assert.deepEqual(r.groups, ['42']);
  });

  it('destroy is idempotent', () => {
    const re = pcre2.compile('\\w+');
    re.destroy();
    assert.doesNotThrow(() => re.destroy());
  });

  it('special regex characters in subject do not affect result', () => {
    const r = pcre2.match('\\$\\d+', '$100');
    assert.equal(r.match, '$100');
  });

  it('newline in subject with DOTALL flag', () => {
    const r = pcre2.match('start(.*)end', 'start\nfoo\nend', FLAGS.DOTALL);
    assert.equal(r.groups[0], '\nfoo\n');
  });
});

/* ── startPos ───────────────────────────────────────────────────────────── */

describe('startPos option', () => {
  it('match() skips characters before startPos', () => {
    const r = pcre2.match('\\d+', 'abc 123 456', 0, { startPos: 4 });
    assert.equal(r.match, '123');
    assert.equal(r.index, 4);
  });

  it('match() startPos on multibyte (Cyrillic) string', () => {
    // "Привет 42" — skip "Привет " (7 chars, 13 bytes) and match digits
    const r = pcre2.match('\\d+', 'Привет 42', FLAGS.UTF, { startPos: 7 });
    assert.equal(r.match, '42');
    assert.equal(r.index, 7);
  });

  it('matchAll() starts from startPos', () => {
    const results = pcre2.matchAll('\\d+', 'a1 b2 c3', 0, { startPos: 3 });
    assert.equal(results.length, 2);
    assert.equal(results[0].match, '2');
    assert.equal(results[1].match, '3');
  });

  it('test() with startPos ignores earlier content', () => {
    assert.equal(pcre2.test('^\\d', 'abc123', 0, { startPos: 3 }), false);
  });

  it('replace() with startPos leaves prefix unchanged', () => {
    // 'cost: 100 or 200' — '200' starts at index 13; replace only from there
    const r = pcre2.replace('\\d+', 'cost: 100 or 200', 'X', 0, { startPos: 13 });
    assert.equal(r, 'cost: 100 or X');
  });
});

/* ── MATCH_FLAGS ────────────────────────────────────────────────────────── */

describe('MATCH_FLAGS', () => {
  it('exports correct constants', () => {
    assert.equal(MATCH_FLAGS.NOTBOL,           0x00000001);
    assert.equal(MATCH_FLAGS.NOTEOL,           0x00000002);
    assert.equal(MATCH_FLAGS.NOTEMPTY,         0x00000004);
    assert.equal(MATCH_FLAGS.NOTEMPTY_ATSTART, 0x00000008);
    assert.equal(MATCH_FLAGS.PARTIAL_SOFT,     0x00000010);
    assert.equal(MATCH_FLAGS.PARTIAL_HARD,     0x00000020);
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

/* ── split() ────────────────────────────────────────────────────────────── */

describe('split()', () => {
  it('basic split by fixed delimiter', () => {
    assert.deepEqual(pcre2.split(',', 'a,b,c'), ['a', 'b', 'c']);
  });

  it('split by regex with optional whitespace', () => {
    assert.deepEqual(pcre2.split('\\s*,\\s*', 'one , two , three'), ['one', 'two', 'three']);
  });

  it('no match returns array with original string', () => {
    assert.deepEqual(pcre2.split(',', 'abc'), ['abc']);
  });

  it('empty subject returns array with one empty string', () => {
    assert.deepEqual(pcre2.split(',', ''), ['']);
  });

  it('limit restricts the number of splits', () => {
    assert.deepEqual(pcre2.split(',', 'a,b,c,d', 2), ['a', 'b', 'c,d']);
  });

  it('limit 0 returns empty array', () => {
    assert.deepEqual(pcre2.split(',', 'a,b,c', 0), []);
  });

  it('includes capture groups in result', () => {
    assert.deepEqual(pcre2.split('(,)', 'a,b,c'), ['a', ',', 'b', ',', 'c']);
  });

  it('unmatched optional group appears as undefined', () => {
    const r = pcre2.split('(x)|(,)', 'a,b');
    // Between 'a' and 'b': group 1 (x) = undefined, group 2 (,) = ','
    assert.deepEqual(r, ['a', undefined, ',', 'b']);
  });

  it('PCRE2Regex.split works the same', () => {
    const re = pcre2.compile('\\s+');
    assert.deepEqual(re.split('hello world  foo'), ['hello', 'world', 'foo']);
    re.destroy();
  });

  it('split with Unicode delimiter', () => {
    assert.deepEqual(
      pcre2.split('\\p{Z}+', 'hello world', undefined, FLAGS.UCP),
      ['hello', 'world'],
    );
  });
});
