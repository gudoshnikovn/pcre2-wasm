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

  test(subject) {
    return this.#mod.ccall(
      'pcre2_wasm_match_all', 'number',
      ['number', 'string', 'number', 'number'],
      [this.#ptr, subject, 0, 0]
    ) > 0;
  }

  match(subject) {
    const m = this.#mod;
    const bufSize = 64 * 1024;
    const buf = m._malloc(bufSize);
    const count = m.ccall(
      'pcre2_wasm_match', 'number',
      ['number', 'string', 'number', 'number'],
      [this.#ptr, subject, buf, bufSize]
    );
    const result = count > 0 ? JSON.parse(m.UTF8ToString(buf)) : null;
    m._free(buf);
    return result; // null | ["full_match", "group1", "group2", ...]
  }

  matchAll(subject) {
    const m = this.#mod;
    const bufSize = 64 * 1024;
    const buf = m._malloc(bufSize);
    const count = m.ccall(
      'pcre2_wasm_match_all', 'number',
      ['number', 'string', 'number', 'number'],
      [this.#ptr, subject, buf, bufSize]
    );
    const result = count > 0 ? JSON.parse(m.UTF8ToString(buf)) : [];
    m._free(buf);
    return result; // ["match1", "match2", ...]
  }

  destroy() {
    if (this.#ptr) {
      this.#mod.ccall('pcre2_wasm_free', null, ['number'], [this.#ptr]);
      this.#ptr = 0;
    }
  }
}

export class PCRE2 {
  #mod;

  constructor(mod) {
    this.#mod = mod;
  }

  compile(pattern, flags = 0) {
    const m = this.#mod;
    const errBuf = m._malloc(256);
    const errOffBuf = m._malloc(4);

    const ptr = m.ccall(
      'pcre2_wasm_compile', 'number',
      ['string', 'number', 'number', 'number'],
      [pattern, flags, errBuf, errOffBuf]
    );

    if (ptr === 0) {
      const msg = m.UTF8ToString(errBuf);
      const offset = m.getValue(errOffBuf, 'i32');
      m._free(errBuf);
      m._free(errOffBuf);
      throw new Error(`PCRE2 compile error at offset ${offset}: ${msg}`);
    }

    m._free(errBuf);
    m._free(errOffBuf);
    return new PCRE2Regex(m, ptr, pattern);
  }

  test(pattern, subject, flags = 0) {
    const re = this.compile(pattern, flags);
    const result = re.test(subject);
    re.destroy();
    return result;
  }

  match(pattern, subject, flags = 0) {
    const re = this.compile(pattern, flags);
    const result = re.match(subject);
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

export const FLAGS = {
  CASELESS:  0x00000008,
  MULTILINE: 0x00000400,
  DOTALL:    0x00000020,
  EXTENDED:  0x00000080,
  UTF:       0x00080000,
};

