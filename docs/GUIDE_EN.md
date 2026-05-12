# PCRE2-WASM: Usage Guide

Full PCRE2 regex engine in Node.js and the browser via WebAssembly.

For build internals and architecture details see [INTERNALS.md](./INTERNALS.md).

---

## Installation

```bash
npm install pcre2-wasm
```

## Initialization

```js
import { createPCRE2 } from 'pcre2-wasm';

const pcre2 = await createPCRE2();
```

`createPCRE2()` loads and instantiates the WASM module. Call it once and reuse the returned object everywhere — loading takes ~100–300ms.

---

## Methods

### test()

```js
pcre2.test('\\d+', 'abc 123')    // true
pcre2.test('\\d+', 'no digits')  // false
```

### match()

Returns `{ match, index, groups, namedGroups? }` or `null`.

```js
const r = pcre2.match('(\\w+)@(\\w+)', 'user@example');
// { match: 'user@example', index: 0, groups: ['user', 'example'] }

pcre2.match('\\d+', 'no digits')  // null
```

### matchAll()

Returns an array of match objects.

```js
const r = pcre2.matchAll('\\d+', 'abc 123 def 456');
// [
//   { match: '123', index: 4, groups: [] },
//   { match: '456', index: 12, groups: [] }
// ]
```

### matchAllIterator()

Lazy generator — yields one match at a time. Use when you want to stop early or avoid building a full array.

```js
for (const m of pcre2.matchAllIterator('\\d+', 'a1 b2 c3')) {
  console.log(m.match);
  if (m.match === '2') break;  // stops immediately, no extra work
}
```

### count()

Counts matches without allocating result objects.

```js
pcre2.count('\\d+', 'a1 b22 c333')  // 3
```

### search()

Returns the character index of the first match, or `-1`.

```js
pcre2.search('\\d+', 'abc 123')   // 4
pcre2.search('\\d+', 'no digits') // -1
```

### replace() / replaceAll()

```js
pcre2.replace('\\d+', 'price: 100', 'X')           // 'price: X'
pcre2.replaceAll('\\d+', '1 and 2', 'N')           // 'N and N'
pcre2.replace('(\\w+)@(\\w+)', 'user@host', '$2/$1') // 'host/user'
```

Replacement syntax: `$0` or `$&` = whole match, `$1`.`$n` = numbered group, `${name}` = named group, `$$` = literal dollar.

### split()

```js
pcre2.split(',', 'a,b,c')          // ['a', 'b', 'c']
pcre2.split('(,)', 'a,b,c')        // ['a', ',', 'b', ',', 'c']
pcre2.split(',', 'a,b,c,d', 2)    // ['a', 'b', 'c,d']
```

---

## Named Capture Groups

```js
const r = pcre2.match('(?P<year>\\d{4})-(?P<month>\\d{2})', '2024-01');
r.namedGroups  // { year: '2024', month: '01' }
r.groups       // ['2024', '01']
```

---

## Compiled Regex

Compile once, use many times. Faster than one-shot calls when the same pattern is used repeatedly.

```js
const re = pcre2.compile('(\\w+)@(\\w+)');

re.test('user@host')          // true
re.match('user@host')         // { match: ..., groups: ['user', 'host'] }
re.matchAll('a@b and c@d')    // array of match objects
re.replace('a@b', '$2/$1')    // 'b/a'

re.destroy();  // free WASM memory when done
```

`destroy()` is idempotent — calling it multiple times is safe.

### instanceof check

```js
import { PCRE2Regex } from 'pcre2-wasm';

if (myThing instanceof PCRE2Regex) { /* ... */ }
```

### patternInfo()

Inspect a compiled pattern without running a match.

```js
pcre2.patternInfo('(?P<x>\\d+)(\\w)\\1')
// {
//   captureCount: 2,
//   namedGroupCount: 1,
//   hasBackreferences: true,
//   minLength: 3,
//   maxLookbehind: 0
// }
```

---

## Flags

```js
import { FLAGS, MATCH_FLAGS, EXTRA_FLAGS, parseFlags } from 'pcre2-wasm';

// Compile-time flags (second argument)
pcre2.match('hello', 'Say HELLO', FLAGS.CASELESS)
pcre2.match('[а-я]+', 'привет', FLAGS.UTF)
pcre2.match('\\w+', 'café', FLAGS.UTF | FLAGS.UCP)

// parseFlags — convert a flag string to a bitmask
pcre2.match('hello', 'Say HELLO', parseFlags('i'))       // same as FLAGS.CASELESS
pcre2.matchAll('[а-я]+', 'привет мир', parseFlags('u'))  // same as FLAGS.UTF

// Match-time flags
pcre2.match('^hello', 'hello world', 0, { matchFlags: MATCH_FLAGS.NOTBOL })

// Extra compile-time flags
pcre2.compile('\\w+', FLAGS.UCP, { extraFlags: EXTRA_FLAGS.ASCII_BSW })
```

---

## startPos

Start matching from a character offset without slicing the string. The returned `index` is still relative to the full subject.

```js
pcre2.match('\\d+', 'abc 123 456', 0, { startPos: 8 })
// { match: '456', index: 8, groups: [] }

pcre2.matchAll('\\d+', 'a1 b2 c3', 0, { startPos: 3 })
// matches '2' and '3', skipping '1'
```

---

## ReDoS Protection

```js
import { PCRE2MatchError } from 'pcre2-wasm';

try {
  pcre2.test('^(a+)+$', 'a'.repeat(20) + 'c', 0, { matchLimit: 10_000 });
} catch (e) {
  if (e instanceof PCRE2MatchError) {
    console.log(e.message);  // 'match limit exceeded'
    console.log(e.code);     // raw PCRE2 error code (negative integer)
  }
}
```

Pass `matchLimit` and/or `depthLimit` in the options object of any matching call. Both default to 0 (PCRE2 built-in defaults, effectively unlimited).

---

## Error Handling

```js
import { PCRE2CompileError, PCRE2MatchError } from 'pcre2-wasm';

// Compile error
try {
  pcre2.compile('[unclosed');
} catch (e) {
  if (e instanceof PCRE2CompileError) {
    console.log(e.message);  // 'PCRE2 compile error: ... at offset 9'
    console.log(e.offset);   // 9 — character position in the pattern
  }
}

// Match error (limits exceeded)
try {
  pcre2.test('^(a+)+$', 'aaaaaac', 0, { matchLimit: 100 });
} catch (e) {
  if (e instanceof PCRE2MatchError) {
    console.log(e.code);  // negative integer
  }
}
```

---

## Browser (Vite / webpack)

Import normally — the WASM is inlined in the bundle, no extra `.wasm` file to host.

```js
import { createPCRE2, FLAGS } from 'pcre2-wasm';

const pcre2 = await createPCRE2();
const r = pcre2.match('\\d+', 'price: 42');
console.log(r.match);  // '42'
```

### React hook

```js
// usePCRE2.js
import { useState, useEffect, useRef } from 'react';
import { createPCRE2 } from 'pcre2-wasm';

export function usePCRE2() {
  const [ready, setReady] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    createPCRE2().then((pcre2) => {
      ref.current = pcre2;
      setReady(true);
    });
  }, []);

  return { ready, pcre2: ref.current };
}
```

```jsx
import { usePCRE2 } from './usePCRE2';

export default function MyComponent() {
  const { ready, pcre2 } = usePCRE2();

  function run() {
    const matches = pcre2.matchAll('\\d+', 'prices: 10, 20, 30');
    console.log(matches.map((m) => m.match));  // ['10', '20', '30']
  }

  if (!ready) return <p>Loading…</p>;
  return <button onClick={run}>Run</button>;
}
```

---

## Singleton Pattern

Initialize once at app startup; all modules share the same instance.

```js
// pcre2.js
import { createPCRE2 } from 'pcre2-wasm';

const _promise = createPCRE2();
export const getPCRE2 = () => _promise;
```

```js
// anywhere in the app
import { getPCRE2 } from './pcre2.js';

const pcre2 = await getPCRE2();
pcre2.test('\\d+', userInput);
```

### Caching compiled patterns

```js
// patterns.js
import { getPCRE2 } from './pcre2.js';

let _patterns = null;

export async function getPatterns() {
  if (_patterns) return _patterns;
  const pcre2 = await getPCRE2();
  _patterns = {
    email: pcre2.compile('[\\w.+-]+@[\\w-]+\\.[\\w.]+'),
    phone: pcre2.compile('\\+?\\d[\\d\\s\\-]{7,}\\d'),
    url:   pcre2.compile('https?://[^\\s]+'),
  };
  return _patterns;
  // No destroy() — these live for the entire app lifetime
}
```

---

## When to call destroy()

| Situation | Action |
|-----------|--------|
| `compile()` result used permanently (cached pattern) | Never destroy — let it live |
| `compile()` result used temporarily | Call `destroy()` when done |
| One-shot `pcre2.match()`, `pcre2.test()`, etc. | Nothing — handled internally |

If you called `compile()` yourself, you own the handle. One-shot calls on the `pcre2` object manage memory automatically.
