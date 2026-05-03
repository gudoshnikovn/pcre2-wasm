# PCRE2 → WASM: Complete Guide

## Project Structure

```
project/
├── emsdk/              ← Emscripten SDK (clone from GitHub)
├── pcre2/              ← PCRE2 source code (clone from GitHub)
├── wasm-build/
│   ├── pcre2_wrapper.c ← our C wrapper (see below)
│   ├── pcre2-cmake/    ← created during build
│   ├── pcre2.js        ← build output (JS glue)
│   └── pcre2.wasm      ← build output (binary WASM)
└── your-app/
    └── public/
        ├── pcre2.js
        └── pcre2.wasm
```

---

## Step 1 — Install Emscripten

```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

Add to `~/.zshrc` or `~/.bashrc` to avoid running this every session:
```bash
source ~/path/to/emsdk/emsdk_env.sh
```

Verify:
```bash
emcc --version
# emcc (Emscripten) 5.x.x
```

---

## Step 2 — Clone PCRE2

```bash
git clone https://github.com/PCRE2Project/pcre2.git
```

---

## Step 3 — Create the C Wrapper

Create file `wasm-build/pcre2_wrapper.c`:

```c
#define PCRE2_CODE_UNIT_WIDTH 8
#include <emscripten.h>
#include <string.h>
#include <stdlib.h>
#include "pcre2.h"

// Compiles a pattern. Returns a pointer to the compiled regex, or 0 on error.
// error_buf — output buffer >= 256 bytes for the error message.
// error_offset — output pointer to uint32 for the error position in the pattern.
EMSCRIPTEN_KEEPALIVE
pcre2_code* pcre2_wasm_compile(const char* pattern, uint32_t flags,
                                char* error_buf, uint32_t* error_offset) {
    int errcode = 0;
    PCRE2_SIZE erroffset = 0;
    pcre2_code* re = pcre2_compile(
        (PCRE2_SPTR)pattern, PCRE2_ZERO_TERMINATED,
        flags, &errcode, &erroffset, NULL
    );
    if (!re && error_buf) {
        pcre2_get_error_message(errcode, (PCRE2_UCHAR*)error_buf, 256);
        if (error_offset) *error_offset = (uint32_t)erroffset;
    }
    return re;
}

// First match + capture groups. Returns group count or -1 for no match.
// match_buf receives a JSON array: ["full_match", "group1", "group2", ...]
EMSCRIPTEN_KEEPALIVE
int pcre2_wasm_match(pcre2_code* re, const char* subject,
                     char* match_buf, uint32_t match_buf_size) {
    if (!re || !subject) return -1;

    PCRE2_SIZE subj_len = strlen(subject);
    pcre2_match_data* md = pcre2_match_data_create_from_pattern(re, NULL);
    if (!md) return -48;

    int rc = pcre2_match(re, (PCRE2_SPTR)subject, subj_len, 0, 0, md, NULL);

    if (rc > 0 && match_buf && match_buf_size > 2) {
        PCRE2_SIZE* ovector = pcre2_get_ovector_pointer(md);
        uint32_t pos = 0;
        match_buf[pos++] = '[';
        for (int i = 0; i < rc; i++) {
            if (i > 0 && pos < match_buf_size - 1) match_buf[pos++] = ',';
            PCRE2_SIZE start = ovector[2 * i];
            PCRE2_SIZE end   = ovector[2 * i + 1];
            uint32_t len = (uint32_t)(end - start);
            if (pos + len + 4 >= match_buf_size) break;
            match_buf[pos++] = '"';
            memcpy(match_buf + pos, subject + start, len);
            pos += len;
            match_buf[pos++] = '"';
        }
        if (pos < match_buf_size - 1) match_buf[pos++] = ']';
        match_buf[pos] = '\0';
    }

    pcre2_match_data_free(md);
    return rc;
}

// Global search — all non-overlapping matches. Returns total count.
// match_buf receives a JSON array of all full matches: ["m1", "m2", ...]
EMSCRIPTEN_KEEPALIVE
int pcre2_wasm_match_all(pcre2_code* re, const char* subject,
                          char* match_buf, uint32_t match_buf_size) {
    if (!re || !subject) return -1;

    PCRE2_SIZE subj_len = strlen(subject);
    pcre2_match_data* md = pcre2_match_data_create_from_pattern(re, NULL);
    if (!md) return -48;

    uint32_t pos = 0;
    int total = 0;
    PCRE2_SIZE offset = 0;

    if (match_buf && match_buf_size > 2) match_buf[pos++] = '[';

    while (offset <= subj_len) {
        int rc = pcre2_match(re, (PCRE2_SPTR)subject, subj_len, offset, 0, md, NULL);
        if (rc <= 0) break;

        PCRE2_SIZE* ovector = pcre2_get_ovector_pointer(md);
        PCRE2_SIZE start = ovector[0];
        PCRE2_SIZE end   = ovector[1];
        uint32_t len = (uint32_t)(end - start);

        if (match_buf && pos + len + 5 < match_buf_size) {
            if (total > 0) match_buf[pos++] = ',';
            match_buf[pos++] = '"';
            memcpy(match_buf + pos, subject + start, len);
            pos += len;
            match_buf[pos++] = '"';
        }

        total++;
        offset = (end > start) ? end : end + 1;
    }

    if (match_buf && match_buf_size > 2) {
        match_buf[pos++] = ']';
        match_buf[pos] = '\0';
    }

    pcre2_match_data_free(md);
    return total;
}

// Frees a compiled regex.
EMSCRIPTEN_KEEPALIVE
void pcre2_wasm_free(pcre2_code* re) {
    if (re) pcre2_code_free(re);
}
```

---

## Step 4 — Build PCRE2 with Emscripten

```bash
# Make sure emsdk is activated
source path/to/emsdk/emsdk_env.sh

# Create the cmake build directory
mkdir -p wasm-build/pcre2-cmake

# Configure (one time only)
cd wasm-build/pcre2-cmake
emcmake cmake ../../pcre2 \
  -DPCRE2_BUILD_PCRE2_8=ON \
  -DPCRE2_BUILD_PCRE2_16=OFF \
  -DPCRE2_BUILD_PCRE2_32=OFF \
  -DPCRE2_BUILD_PCRE2GREP=OFF \
  -DPCRE2_BUILD_TESTS=OFF \
  -DPCRE2_SUPPORT_JIT=OFF \
  -DBUILD_SHARED_LIBS=OFF

# Build
emmake make -j4
cd ../..
```

Output: `wasm-build/pcre2-cmake/libpcre2-8.a`

---

## Step 5 — Link the Wrapper with the Library

```bash
emcc wasm-build/pcre2_wrapper.c \
  wasm-build/pcre2-cmake/libpcre2-8.a \
  -I pcre2/src \
  -I wasm-build/pcre2-cmake \
  -I wasm-build/pcre2-cmake/interface \
  -o wasm-build/pcre2.js \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=PCRE2Module \
  -s EXPORTED_FUNCTIONS='["_malloc","_free","_pcre2_wasm_compile","_pcre2_wasm_match","_pcre2_wasm_match_all","_pcre2_wasm_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["cwrap","ccall","UTF8ToString","getValue"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ENVIRONMENT=web \
  --no-entry \
  -O2
```

Output: `wasm-build/pcre2.js` (11KB) + `wasm-build/pcre2.wasm` (408KB)

> Only re-run this step when changing `pcre2_wrapper.c`. Step 4 is only needed when updating PCRE2 itself.

---

## PCRE2 Flags

| Constant          | Hex          | Description                          |
|-------------------|--------------|--------------------------------------|
| PCRE2_CASELESS    | `0x00000008` | Case-insensitive matching (i)        |
| PCRE2_MULTILINE   | `0x00000400` | `^`/`$` match start/end of lines (m) |
| PCRE2_DOTALL      | `0x00000020` | `.` matches `\n` as well (s)         |
| PCRE2_EXTENDED    | `0x00000080` | Ignore whitespace in pattern (x)     |
| PCRE2_UTF         | `0x00080000` | Enable UTF-8 support                 |

Flags can be combined with `|`:
```js
const flags = 0x00000008 | 0x00000400; // CASELESS + MULTILINE
```

---

## Usage in Plain JS (no framework)

Copy `pcre2.js` and `pcre2.wasm` into your project folder.

### HTML

```html
<!DOCTYPE html>
<html>
<head>
  <script src="./pcre2.js"></script>
</head>
<body>
  <script src="./app.js" type="module"></script>
</body>
</html>
```

### app.js

```js
// JS wrapper class on top of the raw WASM API
class PCRE2Regex {
  #mod; #ptr; #pattern;

  constructor(mod, ptr, pattern) {
    this.#mod = mod;
    this.#ptr = ptr;
    this.#pattern = pattern;
  }

  get pattern() { return this.#pattern; }

  test(subject) {
    return this.#mod.ccall('pcre2_wasm_match_all', 'number',
      ['number', 'string', 'number', 'number'],
      [this.#ptr, subject, 0, 0]
    ) > 0;
  }

  matchAll(subject) {
    const m = this.#mod;
    const bufSize = 64 * 1024;
    const buf = m._malloc(bufSize);
    const count = m.ccall('pcre2_wasm_match_all', 'number',
      ['number', 'string', 'number', 'number'],
      [this.#ptr, subject, buf, bufSize]
    );
    const result = count > 0 ? JSON.parse(m.UTF8ToString(buf)) : [];
    m._free(buf);
    return result;
  }

  match(subject) {
    const m = this.#mod;
    const bufSize = 64 * 1024;
    const buf = m._malloc(bufSize);
    const count = m.ccall('pcre2_wasm_match', 'number',
      ['number', 'string', 'number', 'number'],
      [this.#ptr, subject, buf, bufSize]
    );
    const result = count > 0 ? JSON.parse(m.UTF8ToString(buf)) : null;
    m._free(buf);
    return result; // null | ["full_match", "group1", "group2"]
  }

  destroy() {
    if (this.#ptr) {
      this.#mod.ccall('pcre2_wasm_free', null, ['number'], [this.#ptr]);
      this.#ptr = 0;
    }
  }
}

class PCRE2 {
  #mod;

  constructor(mod) { this.#mod = mod; }

  compile(pattern, flags = 0) {
    const m = this.#mod;
    const errBuf = m._malloc(256);
    const errOffBuf = m._malloc(4);
    const ptr = m.ccall('pcre2_wasm_compile', 'number',
      ['string', 'number', 'number', 'number'],
      [pattern, flags, errBuf, errOffBuf]
    );
    if (ptr === 0) {
      const msg = m.UTF8ToString(errBuf);
      const offset = m.getValue(errOffBuf, 'i32');
      m._free(errBuf); m._free(errOffBuf);
      throw new Error(`PCRE2 error at offset ${offset}: ${msg}`);
    }
    m._free(errBuf); m._free(errOffBuf);
    return new PCRE2Regex(m, ptr, pattern);
  }

  test(pattern, subject, flags = 0) {
    const re = this.compile(pattern, flags);
    const result = re.test(subject);
    re.destroy();
    return result;
  }

  matchAll(pattern, subject, flags = 0) {
    const re = this.compile(pattern, flags);
    const result = re.matchAll(subject);
    re.destroy();
    return result;
  }
}

// Initialization — wait for WASM to load
async function init() {
  const mod = await PCRE2Module({ locateFile: () => './pcre2.wasm' });
  return new PCRE2(mod);
}

// Usage
init().then((pcre2) => {
  // One-shot calls (compile + match + destroy handled internally)
  console.log(pcre2.matchAll('\\d+', 'abc 123 def 456'));
  // → ["123", "456"]

  console.log(pcre2.test('\\d+', 'no digits here'));
  // → false

  // Reusable compiled regex
  const re = pcre2.compile('(\\w+)@(\\w+\\.\\w+)');
  console.log(re.match('user@example.com'));
  // → ["user@example.com", "user", "example.com"]

  console.log(re.matchAll('a@b.com and c@d.org'));
  // → ["a@b.com", "c@d.org"]

  re.destroy(); // free memory when no longer needed

  // With flags
  const CASELESS = 0x00000008;
  console.log(pcre2.matchAll('hello', 'Say HELLO world', CASELESS));
  // → ["HELLO"]
});
```

---

## Usage in React (Vite)

Copy `pcre2.js` and `pcre2.wasm` into the `public/` folder of your Vite project.

### src/usePCRE2.js

```js
import { useState, useEffect, useRef } from 'react';

class PCRE2Regex {
  #mod; #ptr; #pattern;

  constructor(mod, ptr, pattern) {
    this.#mod = mod;
    this.#ptr = ptr;
    this.#pattern = pattern;
  }

  get pattern() { return this.#pattern; }

  test(subject) {
    return this.#mod.ccall('pcre2_wasm_match_all', 'number',
      ['number', 'string', 'number', 'number'],
      [this.#ptr, subject, 0, 0]
    ) > 0;
  }

  matchAll(subject) {
    const m = this.#mod;
    const bufSize = 64 * 1024;
    const buf = m._malloc(bufSize);
    const count = m.ccall('pcre2_wasm_match_all', 'number',
      ['number', 'string', 'number', 'number'],
      [this.#ptr, subject, buf, bufSize]
    );
    const result = count > 0 ? JSON.parse(m.UTF8ToString(buf)) : [];
    m._free(buf);
    return result;
  }

  match(subject) {
    const m = this.#mod;
    const bufSize = 64 * 1024;
    const buf = m._malloc(bufSize);
    const count = m.ccall('pcre2_wasm_match', 'number',
      ['number', 'string', 'number', 'number'],
      [this.#ptr, subject, buf, bufSize]
    );
    const result = count > 0 ? JSON.parse(m.UTF8ToString(buf)) : null;
    m._free(buf);
    return result; // null | ["full_match", "group1", "group2"]
  }

  destroy() {
    if (this.#ptr) {
      this.#mod.ccall('pcre2_wasm_free', null, ['number'], [this.#ptr]);
      this.#ptr = 0;
    }
  }
}

class PCRE2 {
  #mod;

  constructor(mod) { this.#mod = mod; }

  compile(pattern, flags = 0) {
    const m = this.#mod;
    const errBuf = m._malloc(256);
    const errOffBuf = m._malloc(4);
    const ptr = m.ccall('pcre2_wasm_compile', 'number',
      ['string', 'number', 'number', 'number'],
      [pattern, flags, errBuf, errOffBuf]
    );
    if (ptr === 0) {
      const msg = m.UTF8ToString(errBuf);
      const offset = m.getValue(errOffBuf, 'i32');
      m._free(errBuf); m._free(errOffBuf);
      throw new Error(`PCRE2 error at offset ${offset}: ${msg}`);
    }
    m._free(errBuf); m._free(errOffBuf);
    return new PCRE2Regex(m, ptr, pattern);
  }

  test(pattern, subject, flags = 0) {
    const re = this.compile(pattern, flags);
    const result = re.test(subject);
    re.destroy();
    return result;
  }

  matchAll(pattern, subject, flags = 0) {
    const re = this.compile(pattern, flags);
    const result = re.matchAll(subject);
    re.destroy();
    return result;
  }
}

export function usePCRE2() {
  const [ready, setReady] = useState(false);
  const pcre2 = useRef(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/pcre2.js';
    script.onload = () => {
      window.PCRE2Module({ locateFile: () => '/pcre2.wasm' }).then((mod) => {
        pcre2.current = new PCRE2(mod);
        setReady(true);
      });
    };
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

  return { ready, pcre2: pcre2.current };
}
```

### Usage in a component

```jsx
import { usePCRE2 } from './usePCRE2';

export default function MyComponent() {
  const { ready, pcre2 } = usePCRE2();

  function handleMatch() {
    if (!ready) return;

    // One-shot
    const matches = pcre2.matchAll('\\d+', 'price: 100, qty: 5');
    console.log(matches); // ["100", "5"]

    // With flags
    const CASELESS = 0x00000008;
    const found = pcre2.test('hello', 'Say HELLO!', CASELESS);
    console.log(found); // true

    // Compiled regex for reuse
    const re = pcre2.compile('(\\w+)=(\\w+)');
    console.log(re.match('foo=bar'));     // ["foo=bar", "foo", "bar"]
    console.log(re.matchAll('a=1 b=2')); // ["a=1", "b=2"]
    re.destroy();
  }

  if (!ready) return <p>Loading PCRE2...</p>;

  return <button onClick={handleMatch}>Run</button>;
}
```

---

## Usage in a Service (initialize once)

The WASM module takes ~100–300ms to load. In a real application, initialize it once at startup and reuse it everywhere via a singleton.

### pcre2Service.js

```js
let pcre2Instance = null;
let initPromise = null;

export async function getPCRE2() {
  if (pcre2Instance) return pcre2Instance; // already ready — instant
  if (initPromise) return initPromise;     // loading — wait for the same promise

  initPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = '/pcre2.js';
    script.onload = () => {
      window.PCRE2Module({ locateFile: () => '/pcre2.wasm' }).then((mod) => {
        pcre2Instance = new PCRE2(mod);
        resolve(pcre2Instance);
      });
    };
    document.head.appendChild(script);
  });

  return initPromise;
}
```

Call from anywhere in the app:
```js
const pcre2 = await getPCRE2(); // first call waits for load, subsequent calls are instant
pcre2.matchAll('\\d+', text);
```

### Caching compiled patterns

If the same patterns are used repeatedly — compile them once too:

```js
// patterns.js — initialized once at startup
let patterns = null;

export async function getPatterns() {
  if (patterns) return patterns;
  const pcre2 = await getPCRE2();
  patterns = {
    email: pcre2.compile('\\w+@\\w+\\.\\w+'),
    phone: pcre2.compile('\\+?\\d[\\d\\s\\-]{7,}\\d'),
    url:   pcre2.compile('https?://[^\\s]+'),
  };
  return patterns;
}

// No need to call destroy() — these live for the entire lifetime of the app
```

---

## When to call destroy()

| What | When to destroy |
|------|----------------|
| WASM module | Never — lives for the entire app lifetime |
| `compile()` for a permanent pattern | Never — cache and reuse it |
| `compile()` for a one-off pattern | Immediately after use |
| `pcre2.matchAll()` / `pcre2.test()` shortcuts | Not needed — handled automatically |

Simple rule: if you called `compile()` yourself — it's your responsibility to call `destroy()`. If you use the `pcre2.matchAll()` / `pcre2.test()` shortcuts — they clean up internally.

---

## Notes

**64KB buffer** — maximum total size of all matches in a single call. Increase `bufSize` in the class if you expect very large results.

**`match()` vs `matchAll()`**:
- `match(subject)` — first match + capture groups → `["full", "g1", "g2"]`
- `matchAll(subject)` — all full matches → `["m1", "m2", "m3"]`
