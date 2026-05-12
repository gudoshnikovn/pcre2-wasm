# pcre2-wasm

Full [PCRE2](https://github.com/PCRE2Project/pcre2) regular expressions compiled to WebAssembly.
Works in browser and Node.js — WASM binary is bundled inline, no extra files to copy.

## Install

```bash
npm install pcre2-wasm
```

## Quick start

```js
import { createPCRE2 } from 'pcre2-wasm';

const pcre2 = await createPCRE2();

// test — does the pattern match?
pcre2.test('\\d+', 'price: 42'); // true
pcre2.test('\\d+', 'no digits here'); // false

// match — first match with capture groups
pcre2.match('(\\w+)@(\\w+)', 'user@example.com');
// { match: 'user@example.com', index: 0, groups: ['user', 'example'] }

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
pcre2.matchAll('^\\w+', 'foo\nbar\nbaz', FLAGS.MULTILINE); // ['foo', 'bar', 'baz']
pcre2.test('hello', 'HÉLLO', FLAGS.CASELESS | FLAGS.UTF | FLAGS.UCP); // true

// Using parseFlags — convert a string like 'gi' to a bitmask
pcre2.test('hello', 'HELLO world', parseFlags('i')); // true
pcre2.matchAll('^\\w+', 'foo\nbar', parseFlags('mg')); // ['foo', 'bar']
```

| Letter | Flag constant          | Description                            |
| ------ | ---------------------- | -------------------------------------- |
| `i`    | `FLAGS.CASELESS`       | Case-insensitive                       |
| `m`    | `FLAGS.MULTILINE`      | `^`/`$` match line boundaries          |
| `s`    | `FLAGS.DOTALL`         | `.` matches newline                    |
| `x`    | `FLAGS.EXTENDED`       | Ignore unescaped whitespace in pattern |
| `u`    | `FLAGS.UTF`            | UTF-8 mode                             |
| `U`    | `FLAGS.UCP`            | Unicode properties, auto-enables UTF   |
| `A`    | `FLAGS.ANCHORED`       | Match only at start of subject         |
| `D`    | `FLAGS.DOLLAR_ENDONLY` | `$` matches only at end of string      |
| `g`    | _(ignored)_            | No-op — the API is stateless           |

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
  pcre2.match('^(a+)+$', 'aaaa...c', 0, { matchLimit: 1000 });
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
  const { ready, pcre2 } = usePCRE2();
  if (!ready) return <p>Loading…</p>;

  const matches = pcre2.matchAll('\\d+', 'price: 100 qty: 5');
  return <p>{matches.map((m) => m.match).join(', ')}</p>;
}
```

## ReDoS protection

```js
// Limit backtracking steps — throws PCRE2MatchError if exceeded
pcre2.test('^(a+)+$', 'aaaa...c', 0, { matchLimit: 10_000 });

// Limit recursion depth
pcre2.match(pattern, subject, 0, { depthLimit: 500 });
```

## TypeScript

Types are included — no `@types/` package needed.

```ts
import { createPCRE2, PCRE2, PCRE2Match, parseFlags } from 'pcre2-wasm';

const pcre2: PCRE2 = await createPCRE2();
const result: PCRE2Match | null = pcre2.match('(\\d+)', 'abc 123');
```

---

See [docs/api.md](docs/api.md) for the full API reference.

## Building from source

Requires [Emscripten](https://emscripten.org/).

```bash
git clone https://github.com/your-username/pcre2-wasm.git
cd pcre2-wasm
make
```

| Command      | Description                               |
| ------------ | ----------------------------------------- |
| `make`       | Full build (setup + compile)              |
| `make build` | Compile WASM (assumes setup already done) |
| `make clean` | Remove build artifacts                    |

See [docs/GUIDE_EN.md](docs/GUIDE_EN.md) for the full build walkthrough.
