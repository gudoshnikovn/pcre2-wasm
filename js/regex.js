import {
  strToWasm,
  byteOffsetToCharOffset,
  charOffsetToByteOffset,
  throwIfMatchError,
  withBuffer,
} from './utils.js';

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

  get pattern() {
    return this.#pattern;
  }

  /* Returns true if the pattern matches anywhere in subject. */
  test(subject, { matchLimit = 0, depthLimit = 0, startPos = 0, matchFlags = 0 } = {}) {
    const m = this.#mod;
    const subjectPtr = strToWasm(m, subject);
    const startByte = charOffsetToByteOffset(subject, startPos);
    const rc = m.ccall(
      'pcre2_wasm_match_all',
      'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [this.#ptr, subjectPtr, 0, 0, matchLimit, depthLimit, startByte, matchFlags],
    );
    m._free(subjectPtr);
    throwIfMatchError(m, rc);
    return rc > 0;
  }

  /*
   * Returns the first match as an object, or null.
   * Shape: { match, index, groups, namedGroups? }
   */
  match(subject, { matchLimit = 0, depthLimit = 0, startPos = 0, matchFlags = 0 } = {}) {
    const m = this.#mod;
    const subjectPtr = strToWasm(m, subject);
    const startByte = charOffsetToByteOffset(subject, startPos);
    try {
      const { rc, text } = withBuffer(m, 16 * 1024, (buf, size) =>
        m.ccall(
          'pcre2_wasm_match',
          'number',
          ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [this.#ptr, subjectPtr, buf, size, matchLimit, depthLimit, startByte, matchFlags],
        ),
      );
      throwIfMatchError(m, rc);
      const result = rc > 0 || rc === -2 ? JSON.parse(text) : null;
      if (result) result.index = byteOffsetToCharOffset(subject, result.index);
      return result;
    } finally {
      m._free(subjectPtr);
    }
  }

  /* Lazy generator — yields one match at a time, stopping on break. */
  *matchAllIterator(subject, opts = {}) {
    let startPos = opts.startPos ?? 0;
    while (true) {
      const m = this.match(subject, { ...opts, startPos });
      if (!m) break;
      yield m;
      startPos = m.index + (m.match.length || 1);
      if (startPos > subject.length) break;
    }
  }

  /* Returns all non-overlapping matches as an array of match objects. */
  matchAll(subject, { matchLimit = 0, depthLimit = 0, startPos = 0, matchFlags = 0 } = {}) {
    const m = this.#mod;
    const subjectPtr = strToWasm(m, subject);
    const startByte = charOffsetToByteOffset(subject, startPos);
    try {
      const { rc, text } = withBuffer(m, 64 * 1024, (buf, size) =>
        m.ccall(
          'pcre2_wasm_match_all',
          'number',
          ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [this.#ptr, subjectPtr, buf, size, matchLimit, depthLimit, startByte, matchFlags],
        ),
      );
      throwIfMatchError(m, rc);
      const result = rc > 0 ? JSON.parse(text) : [];
      for (const r of result) r.index = byteOffsetToCharOffset(subject, r.index);
      return result;
    } finally {
      m._free(subjectPtr);
    }
  }

  /* Returns the number of non-overlapping matches without allocating results. */
  count(subject, { matchLimit = 0, depthLimit = 0, startPos = 0, matchFlags = 0 } = {}) {
    const m = this.#mod;
    const subjectPtr = strToWasm(m, subject);
    const startByte = charOffsetToByteOffset(subject, startPos);
    const rc = m.ccall(
      'pcre2_wasm_match_all',
      'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [this.#ptr, subjectPtr, 0, 0, matchLimit, depthLimit, startByte, matchFlags],
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
    for (const m of matches) {
      if (limit !== undefined && parts.length >= limit) break;
      parts.push(subject.slice(pos, m.index));
      for (const g of m.groups) parts.push(g ?? undefined);
      pos = m.index + m.match.length;
      if (m.match.length === 0) {
        if (pos < subject.length) pos++;
        else break;
      }
    }
    if (limit === undefined || parts.length <= limit) parts.push(subject.slice(pos));
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
    const m = this.#mod;
    /* PCRE2 uses $0 for the whole match; JS uses $&. Normalise before passing to C. */
    const repl = replacement.replace(/\$&/g, '$0');
    const subjectPtr = strToWasm(m, subject);
    const replPtr = strToWasm(m, repl);
    const startByte = charOffsetToByteOffset(subject, startPos);
    const initialSize = Math.max(m.lengthBytesUTF8(subject) * 2 + 1024, 16 * 1024);
    try {
      const { rc, text } = withBuffer(m, initialSize, (buf, size) =>
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
          ],
          [
            this.#ptr,
            subjectPtr,
            replPtr,
            global ? 1 : 0,
            buf,
            size,
            matchLimit,
            depthLimit,
            startByte,
            matchFlags,
            replaceFlags,
          ],
        ),
      );
      throwIfMatchError(m, rc);
      return text;
    } finally {
      m._free(subjectPtr);
      m._free(replPtr);
    }
  }

  /*
   * Returns metadata about the compiled pattern:
   * { captureCount, namedGroupCount, hasBackreferences, minLength, maxLookbehind }
   */
  patternInfo() {
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
