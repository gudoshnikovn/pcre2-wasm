import { PCRE2MatchError } from './errors.js';

/* Sentinel returned by C when the output buffer is too small (retry needed). */
export const WASM_BUF_OVERFLOW = -999;

const _encoder = new TextEncoder();
const _decoder = new TextDecoder();

/*
 * Encode a JS string as UTF-8 in WASM heap. Returns { ptr, len } where len is the
 * byte length without the terminator (the string may contain NUL bytes).
 * Caller must _free the returned ptr.
 */
export function strToWasm(m, s) {
  const len = m.lengthBytesUTF8(s);
  const ptr = m._malloc(len + 1);
  m.stringToUTF8(s, ptr, len + 1);
  return { ptr, len };
}

/* Decode len bytes of UTF-8 from WASM heap (unlike UTF8ToString, does not stop at NUL). */
export function wasmToStr(m, ptr, len) {
  return _decoder.decode(m.HEAPU8.subarray(ptr, ptr + len));
}

/*
 * Convert a UTF-8 byte offset to a JS string character offset.
 * PCRE2 reports match positions in bytes; callers expect character positions.
 */
export function byteOffsetToCharOffset(str, byteOffset) {
  if (byteOffset <= 0) return 0;
  const bytes = _encoder.encode(str);
  return _decoder.decode(bytes.subarray(0, byteOffset)).length;
}

/*
 * Like byteOffsetToCharOffset, but for many offsets into the same string:
 * returns a converter that must be called with non-decreasing byte offsets and
 * resumes from the previous position, so converting all matchAll indexes is O(n).
 */
export function byteToCharOffsetConverter(str) {
  const bytes = _encoder.encode(str);
  let b = 0;
  let c = 0;
  return (byteOffset) => {
    for (; b < byteOffset; b++) {
      const x = bytes[b];
      /* Count lead bytes; a 4-byte sequence is a surrogate pair in UTF-16. */
      if ((x & 0xc0) !== 0x80) c += x >= 0xf0 ? 2 : 1;
    }
    return c;
  };
}

/* Convert a JS character offset to a UTF-8 byte offset (needed for startPos). */
export function charOffsetToByteOffset(str, charOffset) {
  if (charOffset <= 0) return 0;
  /* An offset between the halves of a surrogate pair would point into the middle
     of a UTF-8 sequence; move it past the pair. */
  const hi = str.charCodeAt(charOffset - 1);
  const lo = str.charCodeAt(charOffset);
  if (hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff) charOffset++;
  return _encoder.encode(str.slice(0, charOffset)).length;
}

/*
 * Throw a PCRE2MatchError for real PCRE2 errors (rc < -2, e.g. matchlimit, depthlimit).
 * rc ≥ -1 (success/no match), rc = -2 (partial), and WASM_BUF_OVERFLOW are not errors —
 * callers handle them directly.
 */
export function throwIfMatchError(m, rc) {
  if (rc < -2 && rc !== WASM_BUF_OVERFLOW) {
    const errBuf = m._malloc(256);
    m.ccall(
      'pcre2_wasm_error_message',
      'number',
      ['number', 'number', 'number'],
      [rc, errBuf, 256],
    );
    const msg = m.UTF8ToString(errBuf);
    m._free(errBuf);
    throw new PCRE2MatchError(`PCRE2 match error: ${msg}`, rc);
  }
}

/*
 * Call fn(buf, size) repeatedly, quadrupling the buffer on WASM_BUF_OVERFLOW.
 * Returns { rc, text } where text is read(buf, rc) — by default the
 * null-terminated string written by fn.
 * Any rc other than WASM_BUF_OVERFLOW — including error codes — is returned
 * as-is; the caller is responsible for checking it.
 */
export function withBuffer(m, initialSize, fn, read = (buf) => m.UTF8ToString(buf)) {
  let size = initialSize;
  for (let attempt = 0; attempt < 8; attempt++) {
    const buf = m._malloc(size);
    const rc = fn(buf, size);
    if (rc === WASM_BUF_OVERFLOW) {
      m._free(buf);
      size *= 4;
      continue;
    }
    const text = read(buf, rc);
    m._free(buf);
    return { rc, text };
  }
  throw new Error('PCRE2: result too large');
}
