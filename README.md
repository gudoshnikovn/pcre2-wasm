# pcre2-wasm

Full [PCRE2](https://github.com/PCRE2Project/pcre2) regular expressions compiled to WebAssembly.
Works in browser and Node.js — WASM binary is bundled inline, no extra files to copy.

## Install

```bash
npm install pcre2-wasm
```

Requires Node.js ≥ 18.3 or a browser with WebAssembly support: Chrome ≥ 85, Firefox ≥ 79,
Safari ≥ 15 (the minimums of the Emscripten version the module is built with).

## Quick start

```js
import { createPCRE2 } from 'pcre2-wasm';

const pcre2 = await createPCRE2();

// test — does the pattern match?
pcre2.test('\\d+', 'price: 42'); // true
pcre2.test('\\d+', 'no digits here'); // false

// match — first match with capture groups
pcre2.match('(\\w+)@([\\w.]+)', 'user@example.com');
// { match: 'user@example.com', index: 0, groups: ['user', 'example.com'] }

// matchAll — all matches
pcre2.matchAll('\\d+', 'a1 b22 c333');
// [
//   { match: '1',   index: 1, groups: [] },
//   { match: '22',  index: 4, groups: [] },
//   { match: '333', index: 8, groups: [] },
// ]

// replace / replaceAll
pcre2.replace('\\d+', 'price: 42 qty: 5', 'N'); // 'price: N qty: 5'
pcre2.replaceAll('\\d+', 'price: 42 qty: 5', 'N'); // 'price: N qty: N'

// search — index of first match, or -1
pcre2.search('\\d+', 'abc 123'); // 4
pcre2.search('\\d+', 'no digits'); // -1

// count — number of matches, no allocation
pcre2.count('\\d+', 'a1 b22 c333'); // 3

// split — split subject by pattern
pcre2.split(',\\s*', 'one, two, three'); // ['one', 'two', 'three']
```

## Flags

```js
import { createPCRE2, FLAGS, parseFlags } from 'pcre2-wasm';

const pcre2 = await createPCRE2();

// Using FLAG constants
pcre2.test('hello', 'HELLO world', FLAGS.CASELESS); // true
pcre2.matchAll('^\\w+', 'foo\nbar\nbaz', FLAGS.MULTILINE);
// [
//   { match: 'foo', index: 0, groups: [] },
//   { match: 'bar', index: 4, groups: [] },
//   { match: 'baz', index: 8, groups: [] },
// ]
pcre2.test('héllo', 'HÉLLO', FLAGS.CASELESS | FLAGS.UCP); // true (UCP implies UTF)

// Using parseFlags — convert a string like 'gi' to a bitmask
pcre2.test('hello', 'HELLO world', parseFlags('i')); // true
pcre2.matchAll('^\\w+', 'foo\nbar', parseFlags('mg')); // matches 'foo' and 'bar'
```

| Letter | Flag constant          | Description                            |
| ------ | ---------------------- | -------------------------------------- |
| `i`    | `FLAGS.CASELESS`       | Case-insensitive                       |
| `m`    | `FLAGS.MULTILINE`      | `^`/`$` match line boundaries          |
| `s`    | `FLAGS.DOTALL`         | `.` matches newline                    |
| `x`    | `FLAGS.EXTENDED`       | Ignore unescaped whitespace in pattern |
| `u`    | `FLAGS.UTF`            | UTF-8 mode                             |
| `U`    | `FLAGS.UNGREEDY`       | Invert greediness of quantifiers       |
| `A`    | `FLAGS.ANCHORED`       | Match only at start of subject         |
| `D`    | `FLAGS.DOLLAR_ENDONLY` | `$` matches only at end of string      |
| `g`    | _(ignored)_            | No-op — the API is stateless           |

> **Non-ASCII text needs `FLAGS.UTF`.** Strings are passed to PCRE2 as UTF-8, but without
> `FLAGS.UTF` (or `FLAGS.UCP`, which implies it) PCRE2 treats every byte as a separate character.
> Then `.` or `[^x]` can match half of a multi-byte character and the result is garbled, e.g.
> `pcre2.match('.', 'é')` returns `{ match: '�', … }`. With `FLAGS.UTF` it returns `'é'`.
> Byte mode is kept as the default because it is PCRE2's own default.

## Compiled patterns

Compile once, reuse many times. Faster when the same pattern is used repeatedly.

```js
const re = pcre2.compile('(\\w+)@(\\w+\\.\\w+)');

re.test('user@example.com'); // true
re.match('user@example.com'); // { match: 'user@example.com', ... }
re.matchAll('a@b.com c@d.org'); // [{ match: 'a@b.com', ... }, ...]
re.count('a@b.com c@d.org'); // 2
re.replace('x@y.com', '[email]'); // '[email]'

re.destroy(); // free WASM memory when done
re.test('x'); // throws — a destroyed pattern cannot be used
```

## Lazy iteration — `matchAllIterator()`

Memory-efficient alternative to `matchAll()` for large subjects or early exits.

```js
for (const m of pcre2.matchAllIterator('\\d+', subject)) {
  if (m.match === 'stop') break; // stops immediately — no wasted work
  process(m);
}
```

## Named capture groups

```js
pcre2.match('(?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})', '2024-01-15');
// {
//   match: '2024-01-15',
//   index: 0,
//   groups: ['2024', '01', '15'],
//   namedGroups: { year: '2024', month: '01', day: '15' }
// }
```

## Error handling

```js
import { createPCRE2, PCRE2CompileError, PCRE2MatchError } from 'pcre2-wasm';

const pcre2 = await createPCRE2();

// Compile errors carry the position of the syntax error
try {
  pcre2.compile('[invalid');
} catch (e) {
  if (e instanceof PCRE2CompileError) {
    console.error(`Bad pattern at char ${e.offset}: ${e.message}`);
  }
}

// Match errors carry the raw PCRE2 error code
try {
  pcre2.match('^(a+)+$', 'a'.repeat(30) + 'c', 0, { matchLimit: 1000 });
} catch (e) {
  if (e instanceof PCRE2MatchError) {
    console.warn(`Match aborted (code ${e.code}): ${e.message}`);
  }
}
```

## React hook

```bash
npm install pcre2-wasm react
```

```jsx
import { usePCRE2 } from 'pcre2-wasm/react';

function MyComponent() {
  const { ready, pcre2, error } = usePCRE2();
  if (error) return <p>Failed to load PCRE2: {error.message}</p>;
  if (!ready) return <p>Loading…</p>;

  const matches = pcre2.matchAll('\\d+', 'price: 100 qty: 5');
  return <p>{matches.map((m) => m.match).join(', ')}</p>;
}
```

## ReDoS protection

```js
// Limit backtracking steps — throws PCRE2MatchError (code -47) if exceeded
pcre2.test('^(a+)+$', 'a'.repeat(30) + 'c', 0, { matchLimit: 10_000 });

// Limit recursion depth
pcre2.match(pattern, subject, 0, { depthLimit: 500 });
```

## TypeScript

Types are included — no `@types/` package needed.

```ts
import { createPCRE2, type PCRE2, type PCRE2Match } from 'pcre2-wasm';

const pcre2: PCRE2 = await createPCRE2();
const result: PCRE2Match | null = pcre2.match('(\\d+)', 'abc 123');
```

## Differences from JavaScript RegExp

PCRE2 is not the JS regex engine, and this library follows PCRE2 where the two differ:

- **Byte mode by default.** Pass `FLAGS.UTF` (or `FLAGS.UCP`) for non-ASCII text — see [Flags](#flags).
- **Empty matches.** After an empty match, a non-empty match at the same position is tried
  before moving on (as in Perl and PHP), so `matchAll('|a', 'a')` yields `''`, `'a'`, `''`
  where JS yields `''`, `''`. `replaceAll()` substitutes exactly the matches `matchAll()` finds.
- **Replacement strings.** `$1`, `$<name>`, `$&` and `$$` work as in JS (`${name}` works too), but a backslash is an
  escape character: `\\` is a literal backslash and `\U$1` upper-cases the group. Pass
  `REPLACE_FLAGS.LITERAL` to insert the replacement verbatim.
- **`split(subject, limit)`.** `limit` is the maximum number of splits (as in Python), not of
  result elements.
- **Flag letters** follow PCRE/PHP: `U` is ungreedy, not Unicode.

---

See [docs/api.md](docs/api.md) for the full API reference and [CHANGELOG.md](CHANGELOG.md) for
changes between versions.

## Building from source

Requires [Emscripten](https://emscripten.org/) 6.0.11 — `make` installs it into `emsdk/`.

```bash
git clone https://github.com/gudoshnikovn/pcre2-wasm.git
cd pcre2-wasm
make
```

| Command          | Description                                                      |
| ---------------- | ---------------------------------------------------------------- |
| `make`           | Full build: install Emscripten and PCRE2 if needed, then compile |
| `make build`     | Same as `make`                                                   |
| `make clean`     | Remove build artifacts                                           |
| `make distclean` | Also remove the downloaded Emscripten SDK and PCRE2 sources      |

See [docs/INTERNALS.md](docs/INTERNALS.md) for the full build walkthrough and architecture overview.
