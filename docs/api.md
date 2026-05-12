# API Reference

## Table of contents

- [Initialization](#initialization)
- [PCRE2 — one-shot methods](#pcre2--one-shot-methods)
- [PCRE2Regex — compiled pattern](#pcre2regex--compiled-pattern)
- [parseFlags()](#parseflags)
- [Error classes](#error-classes)
- [MatchOptions](#matchoptions)
- [PCRE2Match](#pcre2match)
- [PCRE2PatternInfo](#pcre2patterninfo)
- [FLAG constants](#flag-constants)

---

## Initialization

### `createPCRE2(): Promise<PCRE2>`

Loads and initializes the WASM module. Call once per application — the module takes ~100–300 ms to
load and should be reused. All subsequent calls are instant.

```js
import { createPCRE2 } from 'pcre2-wasm';

const pcre2 = await createPCRE2();
```

---

## PCRE2 — one-shot methods

These methods compile the pattern, run the operation, and destroy the compiled regex automatically.
Use them for one-off calls. For repeated use of the same pattern, prefer
[`compile()`](#compile) to avoid recompiling on every call.

### `compile(pattern, flags?, extraFlags?): PCRE2Regex`

Compiles a pattern into a reusable [`PCRE2Regex`](#pcre2regex--compiled-pattern).
You must call [`destroy()`](#destroy) when done.

```js
const re = pcre2.compile('\\d+');
re.matchAll('a1 b22 c333');  // [{ match: '1', ... }, ...]
re.destroy();
```

Throws [`PCRE2CompileError`](#pcre2compileerror) if the pattern is invalid.

### `test(pattern, subject, flags?, options?, extraFlags?): boolean`

Returns `true` if the pattern matches anywhere in `subject`.

```js
pcre2.test('\\d+', 'abc 123');       // true
pcre2.test('\\d+', 'no digits');     // false
pcre2.test('hello', 'HELLO', FLAGS.CASELESS);  // true
```

### `match(pattern, subject, flags?, options?, extraFlags?): PCRE2Match | null`

Returns the first match as a [`PCRE2Match`](#pcre2match) object, or `null` if no match.

```js
pcre2.match('(\\w+)@(\\w+)', 'user@example.com');
// { match: 'user@example.com', index: 0, groups: ['user', 'example'] }

pcre2.match('\\d+', 'no digits');  // null
```

### `matchAll(pattern, subject, flags?, options?, extraFlags?): PCRE2Match[]`

Returns all non-overlapping matches as an array of [`PCRE2Match`](#pcre2match) objects.
Returns `[]` if there are no matches.

```js
pcre2.matchAll('\\d+', 'a1 b22 c333');
// [
//   { match: '1',   index: 1, groups: [] },
//   { match: '22',  index: 4, groups: [] },
//   { match: '333', index: 8, groups: [] },
// ]
```

### `matchAllIterator(pattern, subject, flags?, options?, extraFlags?): Generator<PCRE2Match>`

Lazy alternative to `matchAll()` — yields one match at a time. Use when:
- The subject is large and you don't need all matches at once.
- You may exit early with `break`.

The compiled regex is destroyed automatically when the loop completes or when the caller breaks.

```js
for (const m of pcre2.matchAllIterator('\\d+', 'a1 b22 c333')) {
  console.log(m.match);  // '1', then '22', then '333'
}

// Early exit — stops after the second match, no further matching is done
for (const m of pcre2.matchAllIterator('\\d+', bigSubject)) {
  if (m.index > limit) break;
  process(m);
}
```

### `count(pattern, subject, flags?, options?, extraFlags?): number`

Returns the number of non-overlapping matches without allocating match result objects.
More efficient than `matchAll().length` when you only need a count.

```js
pcre2.count('\\d+', 'a1 b22 c333');  // 3
pcre2.count('\\d+', 'no digits');    // 0
```

### `search(pattern, subject, flags?, options?, extraFlags?): number`

Returns the character index of the first match, or `-1` if no match.

```js
pcre2.search('\\d+', 'abc 123');   // 4
pcre2.search('\\d+', 'no digits'); // -1
```

### `replace(pattern, subject, replacement, flags?, options?, extraFlags?): string`

Replaces the **first** match and returns the resulting string.

**Replacement syntax:**

| Token       | Meaning                        |
|-------------|--------------------------------|
| `$0` or `$&` | Whole match                   |
| `$1`…`$n`   | Numbered capture group         |
| `${name}`   | Named capture group            |
| `$$`        | Literal `$`                    |

```js
pcre2.replace('(\\w+)', 'hello world', '[$1]');  // '[hello] world'
pcre2.replace('\\d+', 'price: 42', 'N');         // 'price: N'
```

### `replaceAll(pattern, subject, replacement, flags?, options?, extraFlags?): string`

Same as `replace()` but replaces all non-overlapping matches.

```js
pcre2.replaceAll('\\d+', 'a1 b22 c333', 'N');   // 'aN bNN cNNN' — no, actually:
pcre2.replaceAll('\\d+', 'a1 b22 c333', 'N');   // 'aN bN cN'
```

### `split(pattern, subject, limit?, flags?, options?, extraFlags?): (string | undefined)[]`

Splits `subject` by the pattern. If the pattern contains capture groups, the captured text is
included between the surrounding parts (same behaviour as `String.prototype.split` with `RegExp`).

```js
pcre2.split(',\\s*', 'one, two, three');          // ['one', 'two', 'three']
pcre2.split('(,)', 'a,b,c');                      // ['a', ',', 'b', ',', 'c']
pcre2.split(',\\s*', 'one, two, three', 2);       // ['one', 'two, three']
```

Unmatched optional groups appear as `undefined` in the result, matching JS native behaviour.

### `patternInfo(pattern, flags?, extraFlags?): PCRE2PatternInfo`

Returns metadata about the compiled pattern without running a match.

```js
pcre2.patternInfo('(?P<year>\\d{4})-(\\d{2})');
// { captureCount: 2, namedGroupCount: 1, hasBackreferences: false, minLength: 7, maxLookbehind: 0 }
```

---

## PCRE2Regex — compiled pattern

Returned by [`compile()`](#compile). All methods accept the same
[`MatchOptions`](#matchoptions) as their one-shot counterparts.

**Always call [`destroy()`](#destroy) when you are done.** If you forget, the `FinalizationRegistry`
will clean up when the object is garbage collected, but this is non-deterministic.

### `re.pattern: string`

The original pattern string passed to `compile()`.

### `re.test(subject, options?): boolean`

### `re.match(subject, options?): PCRE2Match | null`

### `re.matchAll(subject, options?): PCRE2Match[]`

### `re.matchAllIterator(subject, options?): Generator<PCRE2Match>`

### `re.count(subject, options?): number`

### `re.search(subject, options?): number`

### `re.replace(subject, replacement, options?): string`

### `re.replaceAll(subject, replacement, options?): string`

### `re.split(subject, limit?, options?): (string | undefined)[]`

### `re.patternInfo(): PCRE2PatternInfo`

### `re.destroy(): void`

Frees the WASM memory held by this compiled regex. Safe to call more than once. After `destroy()`,
the object must not be used again.

---

## parseFlags()

### `parseFlags(str): number`

Converts a flag string (like `'gi'` or `'imsu'`) to a numeric bitmask suitable for passing as the
`flags` argument to any method.

```js
import { parseFlags } from 'pcre2-wasm';

parseFlags('i')    // FLAGS.CASELESS
parseFlags('im')   // FLAGS.CASELESS | FLAGS.MULTILINE
parseFlags('g')    // 0  — silently ignored, the API is stateless
parseFlags('')     // 0
```

Throws `TypeError` for any unrecognised letter.

| Letter | Mapped to              |
|--------|------------------------|
| `i`    | `FLAGS.CASELESS`       |
| `m`    | `FLAGS.MULTILINE`      |
| `s`    | `FLAGS.DOTALL`         |
| `x`    | `FLAGS.EXTENDED`       |
| `u`    | `FLAGS.UTF`            |
| `U`    | `FLAGS.UCP`            |
| `A`    | `FLAGS.ANCHORED`       |
| `D`    | `FLAGS.DOLLAR_ENDONLY` |
| `g`    | `0` (no-op)            |

---

## Error classes

### `PCRE2CompileError`

Thrown by `compile()` (and any one-shot method) when the pattern has a syntax error.

```js
import { PCRE2CompileError } from 'pcre2-wasm';

try {
  pcre2.compile('[unclosed');
} catch (e) {
  if (e instanceof PCRE2CompileError) {
    console.error(e.message);  // 'PCRE2 compile error at offset 9: ...'
    console.error(e.offset);   // 9 — character position in the pattern
  }
}
```

| Property  | Type     | Description                                          |
|-----------|----------|------------------------------------------------------|
| `message` | `string` | Human-readable error description including offset    |
| `offset`  | `number` | Character position in the pattern where error starts |
| `name`    | `string` | `'PCRE2CompileError'`                                |

`PCRE2CompileError` extends `Error`, so existing `catch (e)` blocks that handle `Error` continue
to work without changes.

### `PCRE2MatchError`

Thrown when a match operation exceeds a resource limit (e.g. `matchLimit` or `depthLimit`).

```js
import { PCRE2MatchError } from 'pcre2-wasm';

try {
  pcre2.test('^(a+)+$', 'aaaa...c', 0, { matchLimit: 10_000 });
} catch (e) {
  if (e instanceof PCRE2MatchError) {
    console.warn(e.message);  // 'PCRE2 match error: match limit exceeded'
    console.warn(e.code);     // -47 — raw PCRE2 error code
  }
}
```

| Property  | Type     | Description                                    |
|-----------|----------|------------------------------------------------|
| `message` | `string` | Human-readable error description               |
| `code`    | `number` | Raw PCRE2 error code (negative integer)        |
| `name`    | `string` | `'PCRE2MatchError'`                            |

`PCRE2MatchError` extends `Error`.

---

## MatchOptions

Optional object accepted by all match, replace, split, and count methods.

```ts
interface MatchOptions {
  matchLimit?:   number;  // max backtracking steps (0 = no extra limit)
  depthLimit?:   number;  // max backtracking stack depth (0 = no extra limit)
  startPos?:     number;  // character offset to start matching from (default 0)
  matchFlags?:   number;  // bitwise OR of MATCH_FLAGS constants
  replaceFlags?: number;  // bitwise OR of REPLACE_FLAGS constants (replace/replaceAll only)
}
```

### `matchLimit` and `depthLimit`

Protect against [ReDoS](https://owasp.org/www-community/attacks/ReDoS) when running patterns on
untrusted input. Both default to `0` (PCRE2's built-in defaults apply).

```js
// Throws PCRE2MatchError if the pattern takes more than 10 000 backtracking steps
pcre2.test('^(a+)+$', untrustedInput, 0, { matchLimit: 10_000 });
```

### `startPos`

Character offset at which matching begins. Unlike slicing the subject string, `startPos` preserves
correct `^`/`$`/`\b` behaviour when combined with `MATCH_FLAGS.NOTBOL`/`NOTEOL`.

```js
pcre2.match('\\d+', 'abc 123', 0, { startPos: 4 });
// { match: '123', index: 4, groups: [] }
```

### `matchFlags`

Bitwise OR of [`MATCH_FLAGS`](#match_flags) constants passed to `pcre2_match` at match time.

```js
import { MATCH_FLAGS } from 'pcre2-wasm';

pcre2.match('\\d+', subject, 0, { matchFlags: MATCH_FLAGS.PARTIAL_SOFT });
// Returns a partial match if no full match is found, with result.partial === true
```

### `replaceFlags`

Bitwise OR of [`REPLACE_FLAGS`](#replace_flags) constants. Only effective with `replace()` /
`replaceAll()`.

---

## PCRE2Match

The object returned by `match()` and yielded by `matchAll()` / `matchAllIterator()`.

```ts
interface PCRE2Match {
  match:        string;                       // the matched substring
  index:        number;                       // character offset in the subject
  groups:       (string | null)[];            // capture groups (index 0 = first group)
  namedGroups?: Record<string, string | null>; // only present when pattern has named groups
  partial?:     true;                         // only present on partial matches
}
```

`groups` and `namedGroups` entries are `null` when the corresponding optional group did not
participate in the match.

```js
pcre2.match('(?P<a>x)?(?P<b>y)', 'y');
// { match: 'y', index: 0, groups: [null, 'y'], namedGroups: { a: null, b: 'y' } }
```

---

## PCRE2PatternInfo

Returned by `patternInfo()`.

```ts
interface PCRE2PatternInfo {
  captureCount:      number;        // total number of capture groups
  namedGroupCount:   number;        // number of named capture groups
  hasBackreferences: boolean;       // true if the pattern uses \1, \k<name>, etc.
  minLength:         number | null; // minimum subject length that could match, or null
  maxLookbehind:     number;        // maximum lookbehind length (0 if none)
}
```

```js
pcre2.patternInfo('(?P<year>\\d{4})-(\\w)\\1');
// { captureCount: 2, namedGroupCount: 1, hasBackreferences: true, minLength: 6, maxLookbehind: 0 }
```

---

## FLAG constants

### `FLAGS`

Compile-time flags. Pass as the `flags` argument to any method or to `parseFlags()`.

| Constant                 | Description                                                    |
|--------------------------|----------------------------------------------------------------|
| `FLAGS.CASELESS`         | Case-insensitive matching (`(?i)`)                             |
| `FLAGS.MULTILINE`        | `^`/`$` match at line boundaries (`(?m)`)                      |
| `FLAGS.DOTALL`           | `.` matches any character including newline (`(?s)`)           |
| `FLAGS.EXTENDED`         | Ignore unescaped whitespace in pattern (`(?x)`)                |
| `FLAGS.UTF`              | Treat pattern and subject as UTF-8                             |
| `FLAGS.UCP`              | Unicode properties for `\d`, `\w`, `\s`, `\b`; enables UTF    |
| `FLAGS.ANCHORED`         | Match only at the start of the subject                         |
| `FLAGS.ENDANCHORED`      | Match only at the end of the subject                           |
| `FLAGS.UNGREEDY`         | Invert greediness of all quantifiers (`(?U)`)                  |
| `FLAGS.NO_AUTO_CAPTURE`  | Plain `()` do not capture; use `(?:)` or named groups (`(?n)`) |
| `FLAGS.DUPNAMES`         | Allow duplicate named groups                                   |
| `FLAGS.DOLLAR_ENDONLY`   | `$` matches only at the absolute end of the string             |
| `FLAGS.ALLOW_EMPTY_CLASS`| Allow `[]` as an empty character class that never matches      |
| `FLAGS.ALT_BSUX`         | JavaScript-style `\u{HHHH}` escape sequences                  |
| `FLAGS.LITERAL`          | Treat the entire pattern as a literal string                    |
| `FLAGS.ALT_EXTENDED_CLASS`| Enable extended character class syntax `[[ ]]`               |

### `MATCH_FLAGS`

Match-time flags. Pass as `options.matchFlags`.

| Constant                    | Description                                                   |
|-----------------------------|---------------------------------------------------------------|
| `MATCH_FLAGS.NOTBOL`        | `^` does not match at the start of the subject                |
| `MATCH_FLAGS.NOTEOL`        | `$` does not match at the end of the subject                  |
| `MATCH_FLAGS.NOTEMPTY`      | An empty string is not a valid match                          |
| `MATCH_FLAGS.NOTEMPTY_ATSTART` | An empty string at the start of the subject is not valid   |
| `MATCH_FLAGS.PARTIAL_SOFT`  | Return a partial match if no full match; prefer full match    |
| `MATCH_FLAGS.PARTIAL_HARD`  | Return a partial match if no full match; prefer partial match |

**Partial matching** — when `PARTIAL_SOFT` or `PARTIAL_HARD` is set and only part of the subject
matches, the result has `partial: true`. Useful for validating input as the user types.

### `REPLACE_FLAGS`

Flags for `replace()` / `replaceAll()`. Pass as `options.replaceFlags`.

| Constant                   | Description                                                       |
|----------------------------|-------------------------------------------------------------------|
| `REPLACE_FLAGS.UNSET_EMPTY`   | Unmatched optional groups produce `""` — already the default  |
| `REPLACE_FLAGS.UNKNOWN_UNSET` | Unknown group name references in replacement produce `""`      |
| `REPLACE_FLAGS.LITERAL`       | Replacement string is plain text; no `$`-substitution          |

### `EXTRA_FLAGS`

Extra compile-time flags. Pass as the `extraFlags` argument to any method.

| Constant                      | Description                                              |
|-------------------------------|----------------------------------------------------------|
| `EXTRA_FLAGS.MATCH_WORD`      | Pattern is implicitly wrapped in `\b…\b` (whole-word)    |
| `EXTRA_FLAGS.MATCH_LINE`      | Pattern is implicitly anchored to `^…$` (whole-line)     |
| `EXTRA_FLAGS.ALLOW_LOOKAROUND_BSK` | Allow `\K` inside lookaround assertions             |
| `EXTRA_FLAGS.CASELESS_RESTRICT`    | ASCII-only case folding even when UCP is on          |
| `EXTRA_FLAGS.ASCII_BSD`       | `\d` matches only ASCII digits `[0-9]`                   |
| `EXTRA_FLAGS.ASCII_BSS`       | `\s` matches only ASCII whitespace                       |
| `EXTRA_FLAGS.ASCII_BSW`       | `\w` matches only ASCII word characters `[A-Za-z0-9_]`  |
| `EXTRA_FLAGS.TURKISH_CASING`  | Turkish/Azerbaijani I/İ casing rules under `(?i)`        |
