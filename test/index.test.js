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
