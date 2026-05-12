import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createPCRE2, FLAGS, MATCH_FLAGS } from '../lib/index.js';

let pcre2;

before(async () => {
  pcre2 = await createPCRE2();
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
