# PCRE2-WASM: Internals & Build Guide

For contributors and anyone who wants to understand how the library is built and how the layers fit together.

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

The WASM binary is base64-inlined into `dist/pcre2.js` (`SINGLE_FILE=1`), so there is no separate `.wasm` file to serve or host.

---

## Building from Source

### Prerequisites

- CMake ≥ 3.14
- GNU Make
- Emscripten SDK — installed automatically by `make setup`

### Steps

```bash
git clone https://github.com/gudoshnikovn/pcre2-wasm.git
cd pcre2-wasm
make build
```

`make build` does everything in order:

| Step | What happens |
|------|--------------|
| Clone `emsdk/` | Fetches Emscripten SDK from GitHub |
| Install emsdk | Runs `./emsdk install latest && ./emsdk activate latest` |
| Clone `pcre2/` | Clones PCRE2 at the pinned version tag |
| `emcmake cmake` | Configures PCRE2 for WASM: 8-bit only, no JIT, no tests, static lib |
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

The wrapper bridges PCRE2's C API to what JavaScript can call via Emscripten's `ccall`. It exports seven functions marked `EMSCRIPTEN_KEEPALIVE`:

| Function | Purpose |
|---|---|
| `pcre2_wasm_compile` | Compile a pattern → opaque pointer. Accepts compile flags and extra flags; writes error message + offset on failure. |
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

Both `pcre2_wasm_match` and `pcre2_wasm_match_all` write into a buffer pre-allocated by the JS caller. If the result does not fit, the C function returns the sentinel `-999` (`WASM_BUF_OVERFLOW`). The JS layer (`js/utils.js → withBuffer`) catches this, doubles the buffer size, and retries — callers never need to worry about sizing.

### Match limits

`match_limit` and `depth_limit` parameters are forwarded to a `pcre2_match_context`. Both default to 0 (PCRE2 built-in defaults, effectively unlimited). Pass non-zero values to cap backtracking and recursion depth — essential for ReDoS protection when running user-supplied patterns.

### UTF-8 zero-length match advance

When `pcre2_wasm_match_all` encounters a zero-length match in UTF-8 mode, the offset is advanced by one byte and then skipped forward past any UTF-8 continuation bytes (`0x80–0xBF`). Without this, the next `pcre2_match` call would receive a mid-codepoint offset and return `PCRE2_ERROR_BADUTFOFFSET`.

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

Both extend `Error` and are exported from `lib/index.js` for `instanceof` checks.

### js/utils.js

Internal helpers:

- `strToWasm(mod, str)` — encodes a JS string to the WASM heap as UTF-8, returns a pointer. Caller must `_free` it.
- `byteOffsetToCharOffset(str, byteOffset)` — converts a PCRE2 byte offset back to a JS character index. Necessary because PCRE2 operates on UTF-8 bytes while JS string indices are UTF-16 code units.
- `charOffsetToByteOffset(str, charOffset)` — inverse, used for `startPos`.
- `withBuffer(mod, initialSize, fn)` — allocates a buffer, calls `fn(ptr, size)`, and retries with a doubled buffer if `fn` returns `WASM_BUF_OVERFLOW`.
- `throwIfMatchError(mod, rc)` — converts a negative PCRE2 return code into a `PCRE2MatchError`.

### js/regex.js — PCRE2Regex

A compiled regex handle. Holds a pointer into the WASM heap. Provides all public methods:
`test`, `match`, `matchAll`, `matchAllIterator`, `count`, `search`, `replace`, `replaceAll`, `split`, `patternInfo`, `destroy`.

Uses a `FinalizationRegistry` as a safety net: if `destroy()` is never called, the GC will eventually free the WASM memory. Always call `destroy()` explicitly — GC collection is non-deterministic.

### js/pcre2.js — PCRE2

Stateless one-shot API. Each method compiles the pattern, runs the operation, then calls `destroy()` — no handle for the caller to manage. Wraps `PCRE2Regex` internally.
