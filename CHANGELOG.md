# Changelog

## 10.49.1

A correctness release: several bugs fixed and the behaviour of empty matches aligned with
PCRE2 itself. It contains **breaking changes**; the version number follows PCRE2 (10.49), so they
ship in a patch release. Read the first section before upgrading.

### Breaking changes

- **Requirements raised.** The module is now built with Emscripten 6.0.11, which needs
  Node.js ≥ 18.3, Chrome ≥ 85, Firefox ≥ 79 or **Safari ≥ 15** (Safari 14.x is no longer
  supported). `engines` in `package.json` is now `>=18.3.0`.
- **Empty matches follow PCRE2's global-matching rule** in `matchAll()`, `count()` and
  `matchAllIterator()`. After an empty match, a non-empty match at the same position is tried
  before moving on, as in Perl, PHP `preg_match_all` and PCRE2's own `pcre2_substitute`. These
  methods now find exactly the matches that `replaceAll()` replaces (before, they could differ).
  Only patterns that can match an empty string are affected:
  ```js
  pcre2.matchAll('|a', 'a').map((m) => m.match);
  // before: ['', '']   now: ['', 'a', '']
  ```
- **`parseFlags('U')` now means `FLAGS.UNGREEDY`**, as in PHP/PCRE. It used to mean
  `FLAGS.UCP`; pass `FLAGS.UCP` directly if you relied on that.
- **Using a `PCRE2Regex` after `destroy()` throws** `Error('PCRE2Regex has been destroyed')`.
  Before, `test()` silently returned `false`, `match()` returned `null` and `replace()` returned
  garbage.
- **`PCRE2` is a TypeScript interface, not a class.** The class was never exported at runtime,
  so `import { PCRE2 }` type-checked but was `undefined`. `import type { PCRE2 }` keeps working.
- **`patternInfo().minLength` is typed `number`** instead of `number | null`. PCRE2 never reports
  it as unset; it is 0 when no bound was computed.

### Bug fixes

- NUL characters (`\0`) no longer truncate the pattern, the subject or the replacement.
- `split()` no longer drops characters when the pattern matches an empty string:
  `split('', 'abc')` returns `['a', 'b', 'c']` (was `['', '', '', '', '']`).
- `startPos` inside a surrogate pair (e.g. in the middle of an emoji) no longer throws
  `bad offset into UTF string`, and `matchAllIterator()` no longer fails on emoji after an empty
  match.
- `$&` in a replacement stays verbatim with `REPLACE_FLAGS.LITERAL`, and `$$&` is a literal `$&`
  (both used to become `$0`).
- With `FLAGS.DUPNAMES`, `namedGroups` holds the group that actually matched; before, it could be
  `null` although a group with that name had matched.
- `\K` in a lookahead (with `EXTRA_FLAGS.ALLOW_LOOKAROUND_BSK`) that puts the match start after
  its end now throws `PCRE2MatchError` (code -60), as `replaceAll()` does. Before, `match()` and
  `matchAll()` tried to allocate hundreds of megabytes and failed with `result too large`.
- `matchAll()` reports correct indexes when `\K` in a lookbehind moves a match start before the
  previous one.
- `usePCRE2()` returns an `error` field when loading the WASM module fails, instead of staying
  "not ready" forever with an unhandled promise rejection; the next mount retries.

### Performance

- `matchAll()` converts match offsets in linear time (80 000 matches: 671 ms → 44 ms).
- `test()` stops at the first match instead of finding all of them (5 MB subject: 345 ms → 25 ms).
- `matchAllIterator()` keeps the subject in WASM memory for the whole iteration instead of
  copying it on every step (20 000 matches: 2.4 s → 18 ms).

### Documentation

- Without `FLAGS.UTF`, PCRE2 treats each byte as a character, so `.` can match half of a
  non-ASCII character. This is now explained in the README and API reference. Byte mode remains
  the default, as in PCRE2.
- Backslash escapes in replacement strings (`\\`, `\n`, `\U…\E`, …) are documented.
- `FLAGS.ALT_BSUX` is described correctly: it enables `\uHHHH` and `\xHH` and disables `\x{…}`.

### Build

- Emscripten is pinned (6.0.11) in the Makefile instead of `latest`; CI builds with the same
  Makefile-installed toolchain (the separate `setup-emsdk` step was removed).
- `make` reinstalls Emscripten or re-clones PCRE2 when `EMSDK_VERSION` / `PCRE2_VERSION`
  changes, and relinks when the Makefile changes.
- Removed the unused `js/pcre2Service.js`.
