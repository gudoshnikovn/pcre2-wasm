# pcre2-wasm

Full [PCRE2](https://github.com/PCRE2Project/pcre2) regular expressions compiled to WebAssembly.
Works in browser and Node.js — WASM is bundled inline, no extra files to copy.

## Install

```bash
npm install pcre2-wasm
```

## Quick Start

```js
import { createPCRE2, FLAGS } from 'pcre2-wasm';

const pcre2 = await createPCRE2();

pcre2.matchAll('\\d+', 'price: 100, qty: 5');      // ["100", "5"]
pcre2.test('\\d+', 'no digits here');               // false
pcre2.match('(\\w+)@(\\w+)', 'user@example.com');  // ["user@example.com", "user", "example"]
pcre2.matchAll('hello', 'Say HELLO!', FLAGS.CASELESS); // ["HELLO"]
```

## React Hook

```bash
npm install pcre2-wasm react
```

```jsx
import { usePCRE2 } from 'pcre2-wasm/react';

function MyComponent() {
  const { ready, pcre2 } = usePCRE2();
  if (!ready) return <p>Loading PCRE2...</p>;

  const matches = pcre2.matchAll('\\d+', 'abc 123 def 456');
  return <p>{matches.join(', ')}</p>;
}
```

## Compiled Regex (reuse across calls)

```js
const re = pcre2.compile('(\\w+)@(\\w+\\.\\w+)');
re.match('user@example.com');    // ["user@example.com", "user", "example.com"]
re.matchAll('a@b.com c@d.org'); // ["a@b.com", "c@d.org"]
re.destroy(); // free WASM memory when done
```

## Flags

Flags are passed as the last argument to any method:

```js
import { createPCRE2, FLAGS } from 'pcre2-wasm';
const pcre2 = await createPCRE2();

// Single flag
pcre2.test('hello', 'HELLO WORLD', FLAGS.CASELESS);              // true

// Combine flags with |
pcre2.matchAll('^\\w+', 'foo\nbar\nbaz', FLAGS.MULTILINE);       // ["foo", "bar", "baz"]
pcre2.match('hello.world', 'hello\nworld', FLAGS.DOTALL);        // ["hello\nworld"]
pcre2.test('hello', 'HÉLLO', FLAGS.CASELESS | FLAGS.UTF);        // true
```

| Constant           | PCRE2 equivalent | Description                      |
|--------------------|------------------|----------------------------------|
| `FLAGS.CASELESS`   | `(?i)`           | Case-insensitive                 |
| `FLAGS.MULTILINE`  | `(?m)`           | `^`/`$` match line boundaries   |
| `FLAGS.DOTALL`     | `(?s)`           | `.` matches newline              |
| `FLAGS.EXTENDED`   | `(?x)`           | Ignore whitespace in pattern     |
| `FLAGS.UTF`        |                  | Enable UTF-8 mode                |

## TypeScript

Types are included — no `@types/` package needed.

```ts
import { createPCRE2, FLAGS, PCRE2 } from 'pcre2-wasm';

const pcre2: PCRE2 = await createPCRE2();
const result: string[] | null = pcre2.match('(\\d+)', 'abc 123');
```

---

## Building from Source

Requires [Emscripten](https://emscripten.org/).

```bash
git clone https://github.com/your-username/pcre2-wasm.git
cd pcre2-wasm
make
```

`make` will clone Emscripten SDK and PCRE2, then compile everything.
First run takes a few minutes; subsequent runs are fast.

| Command          | Description                               |
|------------------|-------------------------------------------|
| `make`           | Full build (setup + compile)              |
| `make setup`     | Clone emsdk and pcre2 only                |
| `make build`     | Compile WASM (assumes setup already done) |
| `make clean`     | Remove build artifacts                    |
| `make distclean` | Remove everything including cloned deps   |

See [docs/GUIDE_EN.md](docs/GUIDE_EN.md) for the full build walkthrough.
