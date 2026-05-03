import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createPCRE2, FLAGS } from '../lib/index.js';

let pcre2;

before(async () => {
  pcre2 = await createPCRE2();
});

describe('test()', () => {
  it('returns true on match', () => assert.equal(pcre2.test('\\d+', 'abc 123'), true));
  it('returns false on no match', () => assert.equal(pcre2.test('\\d+', 'no digits'), false));
});

describe('match()', () => {
  it('returns full match and capture groups', () => {
    assert.deepEqual(pcre2.match('(\\w+)@(\\w+)', 'user@example'), ['user@example', 'user', 'example']);
  });
  it('returns null on no match', () => assert.equal(pcre2.match('\\d+', 'no digits'), null));
});

describe('matchAll()', () => {
  it('finds all matches', () => {
    assert.deepEqual(pcre2.matchAll('\\d+', 'abc 123 def 456'), ['123', '456']);
  });
  it('returns empty array on no match', () => {
    assert.deepEqual(pcre2.matchAll('\\d+', 'no digits'), []);
  });
});

describe('flags', () => {
  it('CASELESS', () => assert.equal(pcre2.test('hello', 'HELLO', FLAGS.CASELESS), true));
  it('MULTILINE', () => {
    assert.deepEqual(pcre2.matchAll('^\\w+', 'foo\nbar\nbaz', FLAGS.MULTILINE), ['foo', 'bar', 'baz']);
  });
  it('DOTALL', () => assert.ok(pcre2.match('a.b', 'a\nb', FLAGS.DOTALL)));
  it('combined flags', () => {
    assert.equal(pcre2.test('hello', 'HELLO', FLAGS.CASELESS | FLAGS.UTF), true);
  });
});

describe('compile()', () => {
  it('compiled regex is reusable', () => {
    const re = pcre2.compile('\\d+');
    assert.equal(re.test('abc 123'), true);
    assert.deepEqual(re.matchAll('1 2 3'), ['1', '2', '3']);
    re.destroy();
  });
  it('throws on invalid pattern', () => {
    assert.throws(() => pcre2.compile('[invalid'), /PCRE2 compile error/);
  });
});

describe('inline flags in pattern', () => {
  it('(?i) works without FLAGS constant', () => {
    assert.equal(pcre2.test('(?i)hello', 'HELLO'), true);
  });
  it('(?m) works without FLAGS constant', () => {
    assert.deepEqual(pcre2.matchAll('(?m)^\\w+', 'foo\nbar'), ['foo', 'bar']);
  });
});
