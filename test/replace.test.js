import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createPCRE2, FLAGS, REPLACE_FLAGS } from '../lib/index.js';

let pcre2;

before(async () => {
  pcre2 = await createPCRE2();
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

/* ── REPLACE_FLAGS ──────────────────────────────────────────────────────── */

describe('REPLACE_FLAGS', () => {
  it('exports UNSET_EMPTY, UNKNOWN_UNSET, LITERAL', () => {
    assert.equal(typeof REPLACE_FLAGS.UNSET_EMPTY, 'number');
    assert.equal(typeof REPLACE_FLAGS.UNKNOWN_UNSET, 'number');
    assert.equal(typeof REPLACE_FLAGS.LITERAL, 'number');
  });

  it('unset optional group substitutes as empty string by default (UNSET_EMPTY always on)', () => {
    assert.equal(pcre2.replace('(a)?b', 'b', '$1X'), 'X');
  });

  it('replaceAll: unset optional group substitutes as empty string', () => {
    assert.equal(pcre2.replaceAll('(a)?b', 'bab', '$1-'), '-a-');
  });

  it('REPLACE_FLAGS.LITERAL: replacement is treated as plain text, no $-syntax', () => {
    assert.equal(
      pcre2.replace('\\d+', 'price 100', '$0 dollars', 0, { replaceFlags: REPLACE_FLAGS.LITERAL }),
      'price $0 dollars',
    );
  });

  it('REPLACE_FLAGS.LITERAL: replaceAll leaves $-tokens unreplaced', () => {
    assert.equal(
      pcre2.replaceAll('\\d+', '1 and 2', '$0!', 0, { replaceFlags: REPLACE_FLAGS.LITERAL }),
      '$0! and $0!',
    );
  });

  it('REPLACE_FLAGS.UNKNOWN_UNSET: unknown group name in replacement does not throw', () => {
    assert.doesNotThrow(() =>
      pcre2.replace('(a)', 'a', '${nosuchgroup}', 0, { replaceFlags: REPLACE_FLAGS.UNKNOWN_UNSET }),
    );
  });

  it('without REPLACE_FLAGS.UNKNOWN_UNSET, unknown group name throws', () => {
    assert.throws(() => pcre2.replace('(a)', 'a', '${nosuchgroup}'));
  });

  it('replace with Unicode subject: Greek characters survive unchanged', () => {
    assert.equal(pcre2.replace('β', 'αβγ', 'B', FLAGS.UTF), 'αBγ');
  });

  it('replaceAll with Unicode subject and named group', () => {
    const result = pcre2.replaceAll('(?P<word>[a-z]+)', 'hello world', '[${word}]', FLAGS.UTF);
    assert.equal(result, '[hello] [world]');
  });

  it('compiled regex: replace() accepts replaceFlags', () => {
    const re = pcre2.compile('\\d+');
    assert.equal(
      re.replace('cost: 42', '$0 units', { replaceFlags: REPLACE_FLAGS.LITERAL }),
      'cost: $0 units',
    );
    re.destroy();
  });

  it('compiled regex: replaceAll() with unset optional group', () => {
    const re = pcre2.compile('(x)?y');
    // (x)?y on 'yxy': first match 'y' (group 1 unset → ''), second 'xy' (group 1 = 'x')
    assert.equal(re.replaceAll('yxy', '$1|'), '|x|');
    re.destroy();
  });

  it('$$ still produces a literal dollar sign with UNSET_EMPTY default', () => {
    assert.equal(pcre2.replace('\\d+', 'cost 42', '$$'), 'cost $');
  });

  it('REPLACE_FLAGS.LITERAL on empty replacement returns string with no matches substituted', () => {
    assert.equal(
      pcre2.replaceAll('[aeiou]', 'hello', '', 0, { replaceFlags: REPLACE_FLAGS.LITERAL }),
      'hll',
    );
  });
});
