/* ── Heap string helper ─────────────────────────────────────────────────── */

/* Encode a JS string as UTF-8 in WASM heap. Caller must _free the returned ptr. */
function strToWasm(m, s) {
  const len = m.lengthBytesUTF8(s) + 1;
  const ptr = m._malloc(len);
  m.stringToUTF8(s, ptr, len);
  return ptr;
}

/* ── Internal: compiled regex handle ────────────────────────────────────── */

class PCRE2Regex {
  #mod;
  #ptr;
  #pattern;

  constructor(mod, ptr, pattern) {
    this.#mod = mod;
    this.#ptr = ptr;
    this.#pattern = pattern;
  }

  get pattern() {
    return this.#pattern;
  }

  /* Returns true if the pattern matches anywhere in subject. */
  test(subject) {
    const m = this.#mod;
    const subjectPtr = strToWasm(m, subject);
    const rc = m.ccall(
      'pcre2_wasm_match_all', 'number',
      ['number', 'number', 'number', 'number'],
      [this.#ptr, subjectPtr, 0, 0]
    );
    m._free(subjectPtr);
    return rc > 0;
  }

  /*
   * Returns the first match as an object, or null.
   * {
   *   match:       string,          // full match
   *   index:       number,          // byte offset in subject (UTF-8)
   *   groups:      (string|null)[], // numbered capture groups (1-based)
   *   namedGroups: Record<string, string|null> | undefined
   * }
   */
  match(subject) {
    const m = this.#mod;
    const subjectPtr = strToWasm(m, subject);
    let bufSize = 16 * 1024;
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        const buf = m._malloc(bufSize);
        const rc = m.ccall(
          'pcre2_wasm_match', 'number',
          ['number', 'number', 'number', 'number'],
          [this.#ptr, subjectPtr, buf, bufSize]
        );
        if (rc === -2) { m._free(buf); bufSize *= 4; continue; }
        const result = rc > 0 ? JSON.parse(m.UTF8ToString(buf)) : null;
        m._free(buf);
        return result;
      }
      throw new Error('PCRE2 match: result too large');
    } finally {
      m._free(subjectPtr);
    }
  }

  /*
   * Returns all non-overlapping matches as an array of match objects.
   * Each element has the same shape as the result of match().
   */
  matchAll(subject) {
    const m = this.#mod;
    const subjectPtr = strToWasm(m, subject);
    let bufSize = 64 * 1024;
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        const buf = m._malloc(bufSize);
        const rc = m.ccall(
          'pcre2_wasm_match_all', 'number',
          ['number', 'number', 'number', 'number'],
          [this.#ptr, subjectPtr, buf, bufSize]
        );
        if (rc === -2) { m._free(buf); bufSize *= 4; continue; }
        const result = rc > 0 ? JSON.parse(m.UTF8ToString(buf)) : [];
        m._free(buf);
        return result;
      }
      throw new Error('PCRE2 matchAll: result too large');
    } finally {
      m._free(subjectPtr);
    }
  }

  /*
   * Returns the byte offset of the first match, or -1 if no match.
   */
  search(subject) {
    const r = this.match(subject);
    return r !== null ? r.index : -1;
  }

  /*
   * Replaces the first match. Returns the resulting string.
   * Replacement syntax: $0 or $& = whole match, $1..$n = numbered group,
   * ${name} = named group, $$ = literal dollar.
   */
  replace(subject, replacement) {
    return this.#replace(subject, replacement, false);
  }

  /*
   * Replaces all non-overlapping matches. Returns the resulting string.
   * Same replacement syntax as replace().
   */
  replaceAll(subject, replacement) {
    return this.#replace(subject, replacement, true);
  }

  #replace(subject, replacement, global) {
    const m = this.#mod;
    // Convert JS $& (whole match) to PCRE2 extended syntax $0
    const repl = replacement.replace(/\$&/g, '$0');
    const subjectPtr = strToWasm(m, subject);
    const replPtr    = strToWasm(m, repl);
    let bufSize = Math.max(m.lengthBytesUTF8(subject) * 2 + 1024, 16 * 1024);
    try {
      for (let attempt = 0; attempt < 10; attempt++) {
        const buf = m._malloc(bufSize);
        const rc = m.ccall(
          'pcre2_wasm_replace', 'number',
          ['number', 'number', 'number', 'number', 'number', 'number'],
          [this.#ptr, subjectPtr, replPtr, global ? 1 : 0, buf, bufSize]
        );
        if (rc === -2) { m._free(buf); bufSize *= 4; continue; }
        if (rc < 0) { m._free(buf); throw new Error(`PCRE2 replace error: ${rc}`); }
        const result = m.UTF8ToString(buf);
        m._free(buf);
        return result;
      }
      throw new Error('PCRE2 replace: output too large');
    } finally {
      m._free(subjectPtr);
      m._free(replPtr);
    }
  }

  destroy() {
    if (this.#ptr) {
      this.#mod.ccall('pcre2_wasm_free', null, ['number'], [this.#ptr]);
      this.#ptr = 0;
    }
  }
}

/* ── Public factory ─────────────────────────────────────────────────────── */

export class PCRE2 {
  #mod;

  constructor(mod) {
    this.#mod = mod;
  }

  /* Compile a pattern into a reusable PCRE2Regex. Caller must call destroy(). */
  compile(pattern, flags = 0) {
    const m = this.#mod;
    const patternPtr = strToWasm(m, pattern);
    const errBuf     = m._malloc(256);
    const errOffBuf  = m._malloc(4);

    const ptr = m.ccall(
      'pcre2_wasm_compile', 'number',
      ['number', 'number', 'number', 'number'],
      [patternPtr, flags, errBuf, errOffBuf]
    );

    m._free(patternPtr);

    if (ptr === 0) {
      const msg    = m.UTF8ToString(errBuf);
      const offset = m.getValue(errOffBuf, 'i32');
      m._free(errBuf);
      m._free(errOffBuf);
      throw new Error(`PCRE2 compile error at offset ${offset}: ${msg}`);
    }

    m._free(errBuf);
    m._free(errOffBuf);
    return new PCRE2Regex(m, ptr, pattern);
  }

  /* One-shot helpers — compile, operate, destroy. */

  test(pattern, subject, flags = 0) {
    const re = this.compile(pattern, flags);
    const r  = re.test(subject);
    re.destroy();
    return r;
  }

  match(pattern, subject, flags = 0) {
    const re = this.compile(pattern, flags);
    const r  = re.match(subject);
    re.destroy();
    return r;
  }

  matchAll(pattern, subject, flags = 0) {
    const re = this.compile(pattern, flags);
    const r  = re.matchAll(subject);
    re.destroy();
    return r;
  }

  replace(pattern, subject, replacement, flags = 0) {
    const re = this.compile(pattern, flags);
    const r  = re.replace(subject, replacement);
    re.destroy();
    return r;
  }

  replaceAll(pattern, subject, replacement, flags = 0) {
    const re = this.compile(pattern, flags);
    const r  = re.replaceAll(subject, replacement);
    re.destroy();
    return r;
  }

  search(pattern, subject, flags = 0) {
    const re = this.compile(pattern, flags);
    const r  = re.search(subject);
    re.destroy();
    return r;
  }
}

export const FLAGS = {
  CASELESS:        0x00000008,  // (?i) Case-insensitive matching
  MULTILINE:       0x00000400,  // (?m) ^ and $ match line boundaries
  DOTALL:          0x00000020,  // (?s) . matches any character including newline
  EXTENDED:        0x00000080,  // (?x) Ignore unescaped whitespace in pattern
  UTF:             0x00080000,  // Treat pattern and subject as UTF-8
  ANCHORED:        0x80000000,  // Match only at the start of the subject
  UNGREEDY:        0x00040000,  // (?U) Invert greediness of quantifiers
  NO_AUTO_CAPTURE: 0x00002000,  // (?n) Plain () do not capture; use (?:) or named groups
  EXTENDED_MORE:   0x01000000,  // (?xx) Extended mode: also ignore whitespace in character classes
};
