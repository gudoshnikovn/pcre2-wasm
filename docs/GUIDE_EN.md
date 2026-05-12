# PCRE2-WASM: Complete Guide

## Overview

`pcre2-wasm` compiles the full [PCRE2](https://github.com/PCRE2Project/pcre2) C library to WebAssembly via Emscripten, then wraps it in a thin JavaScript layer. The result is a Node.js and browser package that gives you the complete PCRE2 regex engine — named groups, Unicode properties, ReDoS protection, substitution — with an ergonomic JS API.

This guide covers two things:
1. **How the library is built** — for contributors and anyone who wants to understand the internals.
2. **How to use the library** — the full public API with working examples.

---

## Architecture

```
src/pcre2_wrapper.c       ← C glue between PCRE2 and WASM
       ↓  emcc
dist/pcre2.js             ← Emscripten output: ES6 module, WASM inlined
       ↓
js/
  constants.js            ← FLAGS, MATCH_FLAGS, REPLACE_FLAGS, EXTRA_FLAGS
  errors.js               ← PCRE2CompileError, PCRE2MatchError
  utils.js                ← encoding helpers, buffer management
  regex.js                ← PCRE2Regex — compiled regex handle
  pcre2.js                ← PCRE2 — one-shot API (compile + run + destroy)
       ↓
lib/index.js              ← public exports: createPCRE2, FLAGS, …
lib/index.d.ts            ← TypeScript declarations
```

The WASM binary is base64-inlined into `dist/pcre2.js` (`SINGLE_FILE=1`), so there is no separate `.wasm` file to serve.

---

## Building from Source

### Prerequisites

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (installed automatically by `make setup`)
- CMake ≥ 3.14
- GNU Make

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/gudoshnikovn/pcre2-wasm.git
cd pcre2-wasm

# 2. Fetch dependencies (emsdk + PCRE2 source) and compile
make build
```

`make build` does everything in order:

| Step | What happens |
|------|--------------|
| Clone `emsdk/` | Fetches Emscripten SDK from GitHub |
| Install emsdk | Runs `./emsdk install latest && ./emsdk activate latest` |
| Clone `pcre2/` | Clones PCRE2 at the pinned version tag |
| `emcmake cmake` | Configures PCRE2 for WASM (8-bit only, no JIT, no tests, static lib) |
| `emmake make` | Compiles PCRE2 → `build/pcre2-cmake/libpcre2-8.a` |
| `emcc` link | Links `src/pcre2_wrapper.c` + the static lib → `dist/pcre2.js` |

Only rebuild PCRE2 (`emmake make`) when the PCRE2 version changes. Wrapper-only changes just need the final `emcc` link step, which `make` handles automatically via dependency tracking.

### Useful targets

```bash
make build      # full build (default)
make clean      # remove build/ and dist/
make distclean  # remove build/, dist/, emsdk/, pcre2/
```

---

## C Layer: src/pcre2_wrapper.c

The wrapper bridges PCRE2's C API to what JavaScript can call via `ccall`. It exports seven functions marked `EMSCRIPTEN_KEEPALIVE`:

| Function | Purpose |
|---|---|
| `pcre2_wasm_compile` | Compile a pattern → opaque pointer. Accepts compile flags, extra flags, writes error message + offset on failure. |
| `pcre2_wasm_match` | First match → JSON object written to a caller-provided buffer. |
| `pcre2_wasm_match_all` | All non-overlapping matches → JSON array. Passing `buf=NULL` just counts without allocating (used by `count()` and `test()`). |
| `pcre2_wasm_replace` | Regex substitution via `pcre2_substitute`. Supports `$1`, `${name}`, `$$`, global flag. |
| `pcre2_wasm_pattern_info` | Pattern metadata → JSON object (capture count, named group count, etc.). |
| `pcre2_wasm_error_message` | Translate a PCRE2 error code to a human-readable string. |
| `pcre2_wasm_free` | Free the compiled code pointer. |

### JSON output format

`pcre2_wasm_match` and each element of `pcre2_wasm_match_all` produce:

```json
{
  "match": "user@example.com",
  "index": 5,
  "groups": ["user", "example.com"],
  "namedGroups": { "user": "user", "host": "example.com" }
}
```

`namedGroups` is omitted when the pattern has no named captures. Unmatched optional groups are `null`.

### Buffer overflow handling

Both `pcre2_wasm_match` and `pcre2_wasm_match_all` write into a buffer pre-allocated by the JS caller. If the result does not fit, the C function returns the sentinel `-999` (`WASM_BUF_OVERFLOW`). The JS layer (`js/utils.js`) catches this, doubles the buffer, and retries — so callers never need to worry about buffer sizing.

### Match context and limits

`match_limit` and `depth_limit` parameters are forwarded to a `pcre2_match_context`. Both default to 0, which means PCRE2's built-in defaults (effectively unlimited). Pass non-zero values to cap backtracking and recursion depth — essential for ReDoS protection when running user-supplied patterns.

### UTF-8 zero-length match advance

When `matchAll` encounters a zero-length match in UTF-8 mode, the offset is advanced by one byte and then skipped forward past any UTF-8 continuation bytes (`0x80–0xBF`). Without this, `pcre2_match` would receive a mid-codepoint offset and return `PCRE2_ERROR_BADUTFOFFSET`.

---

## JS Layer

### js/constants.js

Defines the four flag groups exported to users:

- `FLAGS` — compile-time flags (CASELESS, UTF, MULTILINE, …)
- `MATCH_FLAGS` — match-time flags (NOTBOL, NOTEOL, NOTEMPTY, PARTIAL_SOFT, …)
- `REPLACE_FLAGS` — substitution flags (UNSET_EMPTY, UNKNOWN_UNSET, LITERAL)
- `EXTRA_FLAGS` — extra compile-time options (ASCII_BSW, MATCH_WORD, …)

Also exports `parseFlags(str)` — converts a string like `'im'` to a bitmask.

### js/errors.js

Two typed error classes:

- `PCRE2CompileError` — thrown by `compile()`. Has `.offset` (character position of the error in the pattern).
- `PCRE2MatchError` — thrown when `matchLimit` or `depthLimit` is exceeded. Has `.code` (raw PCRE2 error code).

Both extend `Error` and are exported for `instanceof` checks.

### js/utils.js

Internal helpers used by `regex.js`:

- `strToWasm(mod, str)` — encodes a JS string to WASM heap (UTF-8), returns a pointer. Caller must `_free` it.
- `byteOffsetToCharOffset(str, byteOffset)` — converts a PCRE2 byte offset back to a JS character index. Required because PCRE2 operates on UTF-8 bytes while JS string indices are UTF-16 code units.
- `charOffsetToByteOffset(str, charOffset)` — inverse, used for `startPos`.
- `withBuffer(mod, initialSize, fn)` — allocates a buffer, calls `fn(ptr, size)`, and retries with a larger buffer if `fn` returns `WASM_BUF_OVERFLOW`.
- `throwIfMatchError(mod, rc)` — converts a negative PCRE2 return code into a `PCRE2MatchError`.

### js/regex.js — PCRE2Regex

A compiled regex handle. Holds a pointer to the WASM heap. Provides:
`test`, `match`, `matchAll`, `matchAllIterator`, `count`, `search`, `replace`, `replaceAll`, `split`, `patternInfo`, `destroy`.

Uses a `FinalizationRegistry` as a safety net: if `destroy()` is never called, the GC will eventually free the WASM memory. Always call `destroy()` explicitly when you are done — GC collection is non-deterministic.

### js/pcre2.js — PCRE2

Stateless one-shot API. Each method compiles the pattern, runs the operation, then calls `destroy()` — no handle to manage. Wraps `PCRE2Regex` internally.

---

## Usage

### Installation

```bash
npm install pcre2-wasm
```

### Initialization

```js
import { createPCRE2 } from 'pcre2-wasm';

const pcre2 = await createPCRE2();
```

`createPCRE2()` loads and instantiates the WASM module. Call it once and reuse the returned object everywhere — loading takes ~100–300ms.

---

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

### Named capture groups

```js
const r = pcre2.match('(?P<year>\\d{4})-(?P<month>\\d{2})', '2024-01');
r.namedGroups  // { year: '2024', month: '01' }
r.groups       // ['2024', '01']
```

### replace() / replaceAll()

```js
pcre2.replace('\\d+', 'price: 100', 'X')     // 'price: X'
pcre2.replaceAll('\\d+', '1 and 2', 'N')     // 'N and N'

// Backreferences in replacement
pcre2.replace('(\\w+)@(\\w+)', 'user@host', '$2/$1')  // 'host/user'
```

### split()

```js
pcre2.split(',', 'a,b,c')                     // ['a', 'b', 'c']
pcre2.split('(,)', 'a,b,c')                   // ['a', ',', 'b', ',', 'c']
pcre2.split(',', 'a,b,c,d', 2)               // ['a', 'b', 'c,d']
```

### Compiled regex — compile()

Compile once, use many times. Faster than one-shot calls when the same pattern is used repeatedly.

```js
const re = pcre2.compile('(\\w+)@(\\w+)');

re.test('user@host')            // true
re.match('user@host')           // { match: ..., groups: ['user', 'host'] }
re.matchAll('a@b and c@d')      // array of match objects
re.replace('a@b', '$2/$1')      // 'b/a'

re.destroy();  // free WASM memory when done
```

`instanceof` check:

```js
import { PCRE2Regex } from 'pcre2-wasm';

if (myThing instanceof PCRE2Regex) { /* ... */ }
```

### patternInfo()

Inspect the compiled pattern without running a match.

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

### Flags

```js
import { FLAGS, MATCH_FLAGS, EXTRA_FLAGS, parseFlags } from 'pcre2-wasm';

// Compile-time flags (second argument)
pcre2.match('hello', 'Say HELLO', FLAGS.CASELESS)
pcre2.match('[а-я]+', 'привет', FLAGS.UTF)
pcre2.match('\\w+', 'café', FLAGS.UTF | FLAGS.UCP)

// parseFlags — convert a flag string to a bitmask
pcre2.match('hello', 'Say HELLO', parseFlags('i'))         // FLAGS.CASELESS
pcre2.matchAll('[а-я]+', 'привет мир', parseFlags('u'))    // FLAGS.UTF

// Match-time flags (via options object)
pcre2.match('^hello', 'hello world', 0, { matchFlags: MATCH_FLAGS.NOTBOL })

// Extra compile-time flags
pcre2.compile('\\w+', FLAGS.UCP, { extraFlags: EXTRA_FLAGS.ASCII_BSW })
```

### ReDoS protection

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

### Error handling

```js
import { PCRE2CompileError } from 'pcre2-wasm';

try {
  pcre2.compile('[unclosed');
} catch (e) {
  if (e instanceof PCRE2CompileError) {
    console.log(e.message);  // 'PCRE2 compile error: ... at offset 9'
    console.log(e.offset);   // 9 — character position in the pattern
  }
}
```

### startPos

Start matching from a character offset without slicing the string. The returned `index` is still relative to the full subject.

```js
pcre2.match('\\d+', 'abc 123 456', 0, { startPos: 8 })
// { match: '456', index: 8, groups: [] }

pcre2.matchAll('\\d+', 'a1 b2 c3', 0, { startPos: 3 })
// matches '2' and '3', skipping '1'
```

---

## Usage in a Browser (Vite / webpack)

Install and import normally:

```js
import { createPCRE2, FLAGS } from 'pcre2-wasm';

const pcre2 = await createPCRE2();
const r = pcre2.match('\\d+', 'price: 42');
console.log(r.match);  // '42'
```

The WASM is inlined in the JS bundle — no extra `.wasm` file to host.

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
// pcre2.js — import this everywhere instead of calling createPCRE2() directly
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

If the same patterns are used throughout the app, compile them once at startup:

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

Simple rule: if you called `compile()` yourself, you own the handle and must call `destroy()`. One-shot calls on the `pcre2` object manage memory automatically.

`destroy()` is idempotent — calling it multiple times is safe.
