import { PCRE2MatchError } from './errors.js';

/* Sentinel returned by C when the output buffer is too small (retry needed). */
export const WASM_BUF_OVERFLOW = -999;

/* Encode a JS string as UTF-8 in WASM heap. Caller must _free the returned ptr. */
export function strToWasm(m, s) {
  const len = m.lengthBytesUTF8(s) + 1;
  const ptr = m._malloc(len);
  m.stringToUTF8(s, ptr, len);
  return ptr;
}

/*
 * Convert a UTF-8 byte offset to a JS string character offset.
 * PCRE2 reports match positions in bytes; callers expect character positions.
 */
export function byteOffsetToCharOffset(str, byteOffset) {
  if (byteOffset <= 0) return 0;
  const bytes = new TextEncoder().encode(str);
  return new TextDecoder().decode(bytes.subarray(0, byteOffset)).length;
}

/* Convert a JS character offset to a UTF-8 byte offset (needed for startPos). */
export function charOffsetToByteOffset(str, charOffset) {
  if (charOffset <= 0) return 0;
  return new TextEncoder().encode(str.slice(0, charOffset)).length;
}

/*
 * Throw a descriptive error for PCRE2 match errors (limit exceeded, etc.).
 * rc = -1 (no match), rc = -2 (partial match), WASM_BUF_OVERFLOW are handled
 * by callers and must not reach this function.
 */
export function throwIfMatchError(m, rc) {
  if (rc >= -1 || rc === -2 || rc === WASM_BUF_OVERFLOW) return;
  const errBuf = m._malloc(256);
  m.ccall('pcre2_wasm_error_message', 'number', ['number', 'number', 'number'], [rc, errBuf, 256]);
  const msg = m.UTF8ToString(errBuf);
  m._free(errBuf);
  throw new PCRE2MatchError(`PCRE2 match error: ${msg}`, rc);
}

/*
 * Call fn(buf, size) repeatedly, doubling the buffer on WASM_BUF_OVERFLOW.
 * Returns { rc, text } where text is the null-terminated string written by fn.
 * Any rc other than WASM_BUF_OVERFLOW — including error codes — is returned
 * as-is; the caller is responsible for checking it.
 */
export function withBuffer(m, initialSize, fn) {
  let size = initialSize;
  for (let attempt = 0; attempt < 8; attempt++) {
    const buf = m._malloc(size);
    const rc = fn(buf, size);
    if (rc === WASM_BUF_OVERFLOW) {
      m._free(buf);
      size *= 4;
      continue;
    }
    const text = m.UTF8ToString(buf);
    m._free(buf);
    return { rc, text };
  }
  throw new Error('PCRE2: result too large');
}
