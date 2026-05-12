import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createPCRE2, FLAGS } from '../lib/index.js';

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

/* ── matchAll() — zero-length match + UTF-8 bug fix ────────────────────── */

describe('matchAll() zero-length match + UTF-8', () => {
  it('zero-length match on Greek string does not throw', () => {
    const r = pcre2.matchAll('(?:)', 'αβγ', FLAGS.UTF);
    assert.ok(Array.isArray(r));
    assert.ok(r.length > 0);
  });

  it('zero-length match on Arabic string does not throw', () => {
    const r = pcre2.matchAll('(?:)', 'مرحبا', FLAGS.UTF);
    assert.ok(Array.isArray(r));
    assert.ok(r.length > 0);
  });

  it('zero-length match on Chinese string does not throw', () => {
    const r = pcre2.matchAll('(?:)', '你好世界', FLAGS.UTF);
    assert.ok(Array.isArray(r));
    assert.ok(r.length > 0);
  });

  it('zero-length match on emoji string does not throw', () => {
    const r = pcre2.matchAll('(?:)', '😀🎉', FLAGS.UTF);
    assert.ok(Array.isArray(r));
    assert.ok(r.length > 0);
  });

  it('lookahead on Greek string yields correct character-offset indices', () => {
    const r = pcre2.matchAll('(?=.)', 'αβ', FLAGS.UTF);
    assert.deepEqual(r.map(x => x.index), [0, 1]);
  });

  it('lookahead on Chinese string yields correct character-offset indices', () => {
    const r = pcre2.matchAll('(?=.)', '中文', FLAGS.UTF);
    assert.deepEqual(r.map(x => x.index), [0, 1]);
  });

  it('lookahead on Japanese string yields correct character-offset indices', () => {
    const r = pcre2.matchAll('(?=.)', 'こんにちは', FLAGS.UTF);
    assert.deepEqual(r.map(x => x.index), [0, 1, 2, 3, 4]);
  });

  it('zero-length match at end of multi-byte string terminates cleanly', () => {
    const r = pcre2.matchAll('b*', 'αa', FLAGS.UTF);
    assert.ok(Array.isArray(r));
    assert.ok(r.length < 20);
  });

  it('zero-length match interleaved with non-zero on mixed ASCII + Greek', () => {
    const r = pcre2.matchAll('[aα]?', 'aα', FLAGS.UTF);
    assert.ok(Array.isArray(r));
    for (const m of r) assert.ok(m.index >= 0);
  });
});
