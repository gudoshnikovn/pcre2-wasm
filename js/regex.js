import {
  strToWasm,
  byteOffsetToCharOffset,
  byteToCharOffsetConverter,
  charOffsetToByteOffset,
  throwIfMatchError,
  withBuffer,
  wasmToStr,
} from './utils.js';
import { REPLACE_FLAGS } from './constants.js';

/* ── Automatic WASM memory cleanup ─────────────────────────────────────── */

/*
 * Safety net for forgotten destroy() calls: when a PCRE2Regex is GC'd, this
 * registry frees its compiled pattern in WASM heap.
 *
 * The held token { mod, ptr } must not reference the PCRE2Regex instance
 * itself, otherwise the instance can never be collected. mod is a module-level
 * singleton; ptr is a plain integer — no circular reference.
 *
 * This is non-deterministic. Always call destroy() when you know you are done.
 */
const _registry = new FinalizationRegistry(({ mod, ptr }) => {
  if (ptr) mod.ccall('pcre2_wasm_free', null, ['number'], [ptr]);
});

/* Frees the WASM buffers of matchAllIterator() iterators dropped before finishing. */
const _bufferRegistry = new FinalizationRegistry(({ mod, ptrs }) => {
  for (const p of ptrs) mod._free(p);
});

/* ── Compiled regex handle ──────────────────────────────────────────────── */

export class PCRE2Regex {
  #mod;
  #ptr;
  #pattern;

  constructor(mod, ptr, pattern) {
    this.#mod = mod;
    this.#ptr = ptr;
    this.#pattern = pattern;
    _registry.register(this, { mod, ptr }, this);
  }

  #assertAlive() {
    if (!this.#ptr) throw new Error('PCRE2Regex has been destroyed');
  }

  get pattern() {
    return this.#pattern;
  }

  /* Returns true if the pattern matches anywhere in subject. */
  test(subject, { matchLimit = 0, depthLimit = 0, startPos = 0, matchFlags = 0 } = {}) {
    this.#assertAlive();
    const m = this.#mod;
    const { ptr: subjectPtr, len: subjectLen } = strToWasm(m, subject);
    const startByte = charOffsetToByteOffset(subject, startPos);
    const rc = m.ccall(
      'pcre2_wasm_match',
      'number',
      [
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
      ],
      [
        this.#ptr,
        subjectPtr,
        subjectLen,
        0,
        0,
        matchLimit,
        depthLimit,
        startByte,
        matchFlags,
        0,
        0,
      ],
    );
    m._free(subjectPtr);
    throwIfMatchError(m, rc);
    return rc > 0 || rc === -2;
  }

  /*
   * Returns the first match as an object, or null.
   * Shape: { match, index, groups, namedGroups? }
   */
  match(subject, opts = {}) {
    this.#assertAlive();
    const m = this.#mod;
    const { ptr: subjectPtr, len: subjectLen } = strToWasm(m, subject);
    try {
      const startByte = charOffsetToByteOffset(subject, opts.startPos ?? 0);
      const result = this.#matchBytes(subjectPtr, subjectLen, startByte, opts, false, 0);
      if (result) result.index = byteOffsetToCharOffset(subject, result.index);
      return result;
    } finally {
      m._free(subjectPtr);
    }
  }

  /*
   * Runs pcre2_wasm_match on a subject already in WASM memory. Returns the parsed
   * match with index as a byte offset, or null. afterEmpty: the previous match
   * ended at startByte and was empty (see match_next in C). endPtr, if not 0,
   * receives the byte offset where the match ends.
   */
  #matchBytes(
    subjectPtr,
    subjectLen,
    startByte,
    { matchLimit = 0, depthLimit = 0, matchFlags = 0 },
    afterEmpty,
    endPtr,
  ) {
    this.#assertAlive();
    const m = this.#mod;
    const { rc, text } = withBuffer(m, 16 * 1024, (buf, size) =>
      m.ccall(
        'pcre2_wasm_match',
        'number',
        [
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
        ],
        [
          this.#ptr,
          subjectPtr,
          subjectLen,
          buf,
          size,
          matchLimit,
          depthLimit,
          startByte,
          matchFlags,
          afterEmpty ? 1 : 0,
          endPtr,
        ],
      ),
    );
    throwIfMatchError(m, rc);
    return rc > 0 || rc === -2 ? JSON.parse(text) : null;
  }

  /*
   * Lazy generator — yields one match at a time, stopping on break.
   * Yields the same matches as matchAll(); like matchAll() it stops after a partial match.
   */
  matchAllIterator(subject, opts = {}) {
    this.#assertAlive();
    /* The generator keeps the subject in WASM memory between steps and frees it in
       its finally block (on completion, break or return()). If an unfinished
       iterator is dropped without being closed, the registry frees it instead. */
    const held = { mod: this.#mod, ptrs: [] };
    const iterator = this.#iterate(subject, opts, held);
    _bufferRegistry.register(iterator, held);
    return iterator;
  }

  *#iterate(subject, opts, held) {
    const m = this.#mod;
    const { ptr: subjectPtr, len: subjectLen } = strToWasm(m, subject);
    const endPtr = m._malloc(4);
    held.ptrs = [subjectPtr, endPtr];
    try {
      const toCharOffset = byteToCharOffsetConverter(subject);
      let startByte = charOffsetToByteOffset(subject, opts.startPos ?? 0);
      let afterEmpty = false;
      while (true) {
        const r = this.#matchBytes(subjectPtr, subjectLen, startByte, opts, afterEmpty, endPtr);
        if (!r) break;
        const endByte = m.getValue(endPtr, 'i32') >>> 0;
        afterEmpty = endByte === r.index;
        startByte = endByte;
        r.index = toCharOffset(r.index);
        yield r;
        if (r.partial) break;
      }
    } finally {
      m._free(subjectPtr);
      m._free(endPtr);
      held.ptrs = [];
    }
  }

  /* Returns all non-overlapping matches as an array of match objects. */
  matchAll(subject, { matchLimit = 0, depthLimit = 0, startPos = 0, matchFlags = 0 } = {}) {
    this.#assertAlive();
    const m = this.#mod;
    const { ptr: subjectPtr, len: subjectLen } = strToWasm(m, subject);
    const startByte = charOffsetToByteOffset(subject, startPos);
    try {
      const { rc, text } = withBuffer(m, 64 * 1024, (buf, size) =>
        m.ccall(
          'pcre2_wasm_match_all',
          'number',
          [
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
            'number',
          ],
          [
            this.#ptr,
            subjectPtr,
            subjectLen,
            buf,
            size,
            matchLimit,
            depthLimit,
            startByte,
            matchFlags,
          ],
        ),
      );
      throwIfMatchError(m, rc);
      const result = rc > 0 ? JSON.parse(text) : [];
      const toCharOffset = byteToCharOffsetConverter(subject);
      for (const r of result) r.index = toCharOffset(r.index);
      return result;
    } finally {
      m._free(subjectPtr);
    }
  }

  /* Returns the number of non-overlapping matches without allocating results. */
  count(subject, { matchLimit = 0, depthLimit = 0, startPos = 0, matchFlags = 0 } = {}) {
    this.#assertAlive();
    const m = this.#mod;
    const { ptr: subjectPtr, len: subjectLen } = strToWasm(m, subject);
    const startByte = charOffsetToByteOffset(subject, startPos);
    const rc = m.ccall(
      'pcre2_wasm_match_all',
      'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [this.#ptr, subjectPtr, subjectLen, 0, 0, matchLimit, depthLimit, startByte, matchFlags],
    );
    m._free(subjectPtr);
    throwIfMatchError(m, rc);
    return rc;
  }

  /* Returns the character offset of the first match, or -1 if no match. */
  search(subject, opts = {}) {
    const r = this.match(subject, opts);
    return r !== null ? r.index : -1;
  }

  /*
   * Splits subject by the pattern. When the pattern has capture groups, the
   * captured text is included between the parts (same semantics as JS
   * String.prototype.split with RegExp, or Python re.split).
   *
   * limit — max number of splits; remaining subject is the last element.
   */
  split(subject, limit, opts = {}) {
    if (limit === 0) return [];
    const matches = this.matchAll(subject, opts);
    const parts = [];
    let pos = 0;
    let splits = 0;
    for (const m of matches) {
      if (limit !== undefined && splits >= limit) break;
      const end = m.index + m.match.length;
      /* As in JS split: a match ending at the previous split point, or one at the
         very end of the subject, does not produce a split. */
      if (end === pos || m.index === subject.length) continue;
      parts.push(subject.slice(pos, m.index));
      for (const g of m.groups) parts.push(g ?? undefined);
      pos = end;
      splits++;
    }
    parts.push(subject.slice(pos));
    return parts;
  }

  /*
   * Replaces the first match. Returns the resulting string.
   * Replacement syntax: $0 or $& = whole match, $1..$n = numbered group,
   * ${name} = named group, $$ = literal dollar.
   */
  replace(subject, replacement, opts = {}) {
    return this.#replace(subject, replacement, false, opts);
  }

  /* Replaces all non-overlapping matches. Same replacement syntax as replace(). */
  replaceAll(subject, replacement, opts = {}) {
    return this.#replace(subject, replacement, true, opts);
  }

  #replace(
    subject,
    replacement,
    global,
    { matchLimit = 0, depthLimit = 0, startPos = 0, matchFlags = 0, replaceFlags = 0 } = {},
  ) {
    this.#assertAlive();
    const m = this.#mod;
    /* PCRE2 uses $0 for the whole match; JS uses $&. Normalise before passing to C,
       skipping escaped $$ and leaving LITERAL replacements untouched. */
    const repl =
      replaceFlags & REPLACE_FLAGS.LITERAL
        ? replacement
        : replacement.replace(/\$[$&]/g, (s) => (s === '$&' ? '$0' : s));
    const { ptr: subjectPtr, len: subjectLen } = strToWasm(m, subject);
    const { ptr: replPtr, len: replLen } = strToWasm(m, repl);
    const outLenPtr = m._malloc(4);
    const startByte = charOffsetToByteOffset(subject, startPos);
    const initialSize = Math.max(subjectLen * 2 + 1024, 16 * 1024);
    try {
      const { rc, text } = withBuffer(
        m,
        initialSize,
        (buf, size) =>
          m.ccall(
            'pcre2_wasm_replace',
            'number',
            [
              'number',
              'number',
              'number',
              'number',
              'number',
              'number',
              'number',
              'number',
              'number',
              'number',
              'number',
              'number',
              'number',
              'number',
            ],
            [
              this.#ptr,
              subjectPtr,
              subjectLen,
              replPtr,
              replLen,
              global ? 1 : 0,
              buf,
              size,
              outLenPtr,
              matchLimit,
              depthLimit,
              startByte,
              matchFlags,
              replaceFlags,
            ],
          ),
        /* Read by length: the result may contain NUL bytes. */
        (buf, rc) => (rc >= 0 ? wasmToStr(m, buf, m.getValue(outLenPtr, 'i32') >>> 0) : ''),
      );
      throwIfMatchError(m, rc);
      return text;
    } finally {
      m._free(subjectPtr);
      m._free(replPtr);
      m._free(outLenPtr);
    }
  }

  /*
   * Returns metadata about the compiled pattern:
   * { captureCount, namedGroupCount, hasBackreferences, minLength, maxLookbehind }
   */
  patternInfo() {
    this.#assertAlive();
    const m = this.#mod;
    const bufSize = 256;
    const buf = m._malloc(bufSize);
    const rc = m.ccall(
      'pcre2_wasm_pattern_info',
      'number',
      ['number', 'number', 'number'],
      [this.#ptr, buf, bufSize],
    );
    if (rc < 0) {
      m._free(buf);
      throw new Error('PCRE2 patternInfo failed');
    }
    const result = JSON.parse(m.UTF8ToString(buf));
    m._free(buf);
    return result;
  }

  /* Free WASM memory. No-op if already destroyed. */
  destroy() {
    if (this.#ptr) {
      this.#mod.ccall('pcre2_wasm_free', null, ['number'], [this.#ptr]);
      this.#ptr = 0;
      _registry.unregister(this);
    }
  }
}
