import PCRE2Module from '../dist/pcre2.js';
import { strToWasm, byteOffsetToCharOffset } from './utils.js';
import { FLAGS, MATCH_FLAGS, REPLACE_FLAGS, EXTRA_FLAGS } from './constants.js';
import { PCRE2Regex } from './regex.js';

export { FLAGS, MATCH_FLAGS, REPLACE_FLAGS, EXTRA_FLAGS, PCRE2Regex };

/* ── Public factory ─────────────────────────────────────────────────────── */

export class PCRE2 {
  #mod;

  constructor(mod) {
    this.#mod = mod;
  }

  /*
   * Compile a pattern into a reusable PCRE2Regex. Caller must call destroy().
   * flags: bitwise OR of FLAGS constants.
   * extraFlags: bitwise OR of EXTRA_FLAGS constants (pass 0 or omit for none).
   */
  compile(pattern, flags = 0, extraFlags = 0) {
    /* UCP requires UTF; enable it automatically so callers need not add UTF explicitly. */
    if (flags & FLAGS.UCP) flags |= FLAGS.UTF;

    const m = this.#mod;
    const patternPtr = strToWasm(m, pattern);
    const errBuf     = m._malloc(256);
    const errOffBuf  = m._malloc(4);

    const ptr = m.ccall(
      'pcre2_wasm_compile', 'number',
      ['number', 'number', 'number', 'number', 'number'],
      [patternPtr, flags, errBuf, errOffBuf, extraFlags]
    );

    m._free(patternPtr);

    if (ptr === 0) {
      const msg        = m.UTF8ToString(errBuf);
      const byteOffset = m.getValue(errOffBuf, 'i32');
      m._free(errBuf);
      m._free(errOffBuf);
      const offset = byteOffsetToCharOffset(pattern, byteOffset);
      throw new Error(`PCRE2 compile error at offset ${offset}: ${msg}`);
    }

    m._free(errBuf);
    m._free(errOffBuf);
    return new PCRE2Regex(m, ptr, pattern);
  }

  /* ── One-shot helpers — compile, operate, destroy ───────────────────── */

  #oneShot(pattern, flags, extraFlags, fn) {
    const re = this.compile(pattern, flags, extraFlags);
    try { return fn(re); } finally { re.destroy(); }
  }

  test(pattern, subject, flags = 0, opts = {}, extraFlags = 0) {
    return this.#oneShot(pattern, flags, extraFlags, re => re.test(subject, opts));
  }

  match(pattern, subject, flags = 0, opts = {}, extraFlags = 0) {
    return this.#oneShot(pattern, flags, extraFlags, re => re.match(subject, opts));
  }

  matchAll(pattern, subject, flags = 0, opts = {}, extraFlags = 0) {
    return this.#oneShot(pattern, flags, extraFlags, re => re.matchAll(subject, opts));
  }

  *matchAllIterator(pattern, subject, flags = 0, opts = {}, extraFlags = 0) {
    const re = this.compile(pattern, flags, extraFlags);
    try {
      yield* re.matchAllIterator(subject, opts);
    } finally {
      re.destroy();
    }
  }

  count(pattern, subject, flags = 0, opts = {}, extraFlags = 0) {
    return this.#oneShot(pattern, flags, extraFlags, re => re.count(subject, opts));
  }

  search(pattern, subject, flags = 0, opts = {}, extraFlags = 0) {
    return this.#oneShot(pattern, flags, extraFlags, re => re.search(subject, opts));
  }

  replace(pattern, subject, replacement, flags = 0, opts = {}, extraFlags = 0) {
    return this.#oneShot(pattern, flags, extraFlags,
      re => re.replace(subject, replacement, opts));
  }

  replaceAll(pattern, subject, replacement, flags = 0, opts = {}, extraFlags = 0) {
    return this.#oneShot(pattern, flags, extraFlags,
      re => re.replaceAll(subject, replacement, opts));
  }

  split(pattern, subject, limit, flags = 0, opts = {}, extraFlags = 0) {
    return this.#oneShot(pattern, flags, extraFlags, re => re.split(subject, limit, opts));
  }

  patternInfo(pattern, flags = 0, extraFlags = 0) {
    return this.#oneShot(pattern, flags, extraFlags, re => re.patternInfo());
  }
}

/*
 * Initialize the PCRE2 WASM module. The binary is embedded — no external files needed.
 */
export async function createPCRE2() {
  const mod = await PCRE2Module();
  return new PCRE2(mod);
}
