#define PCRE2_CODE_UNIT_WIDTH 8
#include <emscripten.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "pcre2.h"

/* Sentinel returned to JS when our output buffer is too small (retry needed).
   Must not collide with any PCRE2 error code (all are > -200). */
#define WASM_BUF_OVERFLOW (-999)

/* ── JSON write helpers ─────────────────────────────────────────────────── */

typedef struct {
    char*    buf;
    uint32_t pos;
    uint32_t max;
    int      overflow;
} JsonBuf;

static void jb_char(JsonBuf* b, char c) {
    if (!b->buf || b->overflow || b->pos + 2 >= b->max) { b->overflow = 1; return; }
    b->buf[b->pos++] = c;
}

static void jb_raw(JsonBuf* b, const char* s, uint32_t len) {
    for (uint32_t i = 0; i < len; i++) jb_char(b, s[i]);
}

static void jb_lit(JsonBuf* b, const char* s) {
    jb_raw(b, s, (uint32_t)strlen(s));
}

static void jb_uint(JsonBuf* b, uint32_t n) {
    char tmp[12];
    jb_raw(b, tmp, (uint32_t)snprintf(tmp, sizeof(tmp), "%u", n));
}

static void jb_string(JsonBuf* b, const char* src, uint32_t len) {
    jb_char(b, '"');
    for (uint32_t i = 0; i < len; i++) {
        if (b->overflow) return;
        unsigned char c = (unsigned char)src[i];
        if      (c == '"')  { jb_char(b, '\\'); jb_char(b, '"');  }
        else if (c == '\\') { jb_char(b, '\\'); jb_char(b, '\\'); }
        else if (c == '\n') { jb_char(b, '\\'); jb_char(b, 'n');  }
        else if (c == '\r') { jb_char(b, '\\'); jb_char(b, 'r');  }
        else if (c == '\t') { jb_char(b, '\\'); jb_char(b, 't');  }
        else if (c < 0x20)  {
            char tmp[8];
            jb_raw(b, tmp, (uint32_t)snprintf(tmp, sizeof(tmp), "\\u%04x", c));
        }
        else { jb_char(b, c); }
    }
    jb_char(b, '"');
}

/* ── Name-table cache ───────────────────────────────────────────────────── */

typedef struct {
    uint32_t     namecount;
    uint32_t     entry_size;   /* bytes per entry                           */
    PCRE2_SPTR   table;        /* points into compiled code; not owned      */
} NameTable;

static void nt_load(pcre2_code* re, NameTable* nt) {
    nt->namecount  = 0;
    nt->entry_size = 0;
    nt->table      = NULL;
    pcre2_pattern_info(re, PCRE2_INFO_NAMECOUNT,     &nt->namecount);
    if (nt->namecount == 0) return;
    pcre2_pattern_info(re, PCRE2_INFO_NAMEENTRYSIZE, &nt->entry_size);
    pcre2_pattern_info(re, PCRE2_INFO_NAMETABLE,     &nt->table);
}

/* ── Core: write one match as a JSON object ─────────────────────────────── */

static void jb_match_object(JsonBuf* b, const char* subject,
                             PCRE2_SIZE* ov, int rc, const NameTable* nt,
                             int partial) {
    jb_char(b, '{');

    /* "match":"..." */
    jb_lit(b, "\"match\":");
    jb_string(b, subject + ov[0], (uint32_t)(ov[1] - ov[0]));

    /* ,"index":N */
    jb_lit(b, ",\"index\":");
    jb_uint(b, (uint32_t)ov[0]);

    /* ,"groups":[...] — numbered capture groups, starting at 1 */
    jb_lit(b, ",\"groups\":[");
    for (int i = 1; i < rc; i++) {
        if (i > 1) jb_char(b, ',');
        if (ov[2*i] == PCRE2_UNSET) {
            jb_lit(b, "null");
        } else {
            jb_string(b, subject + ov[2*i], (uint32_t)(ov[2*i+1] - ov[2*i]));
        }
    }
    jb_char(b, ']');

    /* ,"namedGroups":{...} — omitted entirely when no named groups */
    if (nt->namecount > 0) {
        jb_lit(b, ",\"namedGroups\":{");
        for (uint32_t ni = 0; ni < nt->namecount; ni++) {
            if (ni > 0) jb_char(b, ',');
            const unsigned char* e =
                (const unsigned char*)((const char*)nt->table + ni * nt->entry_size);
            uint32_t gn = ((uint32_t)e[0] << 8) | e[1];
            const char* name = (const char*)(e + 2);

            jb_string(b, name, (uint32_t)strlen(name));
            jb_char(b, ':');

            /* gn is a valid index into ov even if >= rc: create_from_pattern
               allocates enough slots and fills them with PCRE2_UNSET */
            PCRE2_SIZE gs = ov[2*gn], ge = ov[2*gn+1];
            if (gs == PCRE2_UNSET) {
                jb_lit(b, "null");
            } else {
                jb_string(b, subject + gs, (uint32_t)(ge - gs));
            }
        }
        jb_char(b, '}');
    }

    if (partial) jb_lit(b, ",\"partial\":true");

    jb_char(b, '}');
}

/* ── Match context helper ───────────────────────────────────────────────── */

/*
 * Creates a match context with the given limits, or returns NULL if both
 * limits are 0 (no context needed — PCRE2 uses its built-in defaults).
 */
static pcre2_match_context* make_mctx(uint32_t match_limit, uint32_t depth_limit) {
    if (match_limit == 0 && depth_limit == 0) return NULL;
    pcre2_match_context* ctx = pcre2_match_context_create(NULL);
    if (!ctx) return NULL;
    if (match_limit > 0) pcre2_set_match_limit(ctx, match_limit);
    if (depth_limit > 0) pcre2_set_depth_limit(ctx, depth_limit);
    return ctx;
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/*
 * Compile a pattern. Returns compiled code pointer or NULL on error.
 * error_buf must be >= 256 bytes; error_offset receives the error position.
 */
EMSCRIPTEN_KEEPALIVE
pcre2_code* pcre2_wasm_compile(const char* pattern, uint32_t flags,
                                char* error_buf, uint32_t* error_offset) {
    int errcode = 0;
    PCRE2_SIZE erroffset = 0;
    pcre2_code* re = pcre2_compile(
        (PCRE2_SPTR)pattern, PCRE2_ZERO_TERMINATED,
        flags, &errcode, &erroffset, NULL
    );
    if (!re && error_buf) {
        pcre2_get_error_message(errcode, (PCRE2_UCHAR*)error_buf, 256);
        if (error_offset) *error_offset = (uint32_t)erroffset;
    }
    return re;
}

/*
 * Translate a PCRE2 error code into a human-readable message.
 * Wraps pcre2_get_error_message for use from JS when match/matchAll fail.
 */
EMSCRIPTEN_KEEPALIVE
int pcre2_wasm_error_message(int errcode, char* buf, uint32_t bufsize) {
    return (int)pcre2_get_error_message(errcode, (PCRE2_UCHAR*)buf, (PCRE2_SIZE)bufsize);
}

/*
 * First match. Returns:
 *   > 0                match found; match_buf contains JSON object
 *   -1                 no match (PCRE2_ERROR_NOMATCH)
 *   -2                 partial match (PCRE2_ERROR_PARTIAL); JSON written with "partial":true
 *   WASM_BUF_OVERFLOW  match_buf too small — retry with a larger buffer
 *   other negative     PCRE2 error (e.g. matchlimit, depthlimit)
 *
 * match_limit / depth_limit: 0 means use PCRE2 built-in defaults (no cap).
 *
 * JSON format: {"match":"...","index":N,"groups":[...],"namedGroups":{...}}
 * namedGroups is omitted when the pattern has no named groups.
 */
EMSCRIPTEN_KEEPALIVE
int pcre2_wasm_match(pcre2_code* re, const char* subject,
                     char* match_buf, uint32_t match_buf_size,
                     uint32_t match_limit, uint32_t depth_limit,
                     uint32_t start_offset, uint32_t match_flags) {
    if (!re || !subject) return -1;

    PCRE2_SIZE subj_len = strlen(subject);
    pcre2_match_data* md = pcre2_match_data_create_from_pattern(re, NULL);
    if (!md) return -48;

    pcre2_match_context* mctx = make_mctx(match_limit, depth_limit);
    int rc = pcre2_match(re, (PCRE2_SPTR)subject, subj_len,
                         (PCRE2_SIZE)start_offset, (uint32_t)match_flags, md, mctx);
    if (mctx) pcre2_match_context_free(mctx);

    int is_partial = (rc == PCRE2_ERROR_PARTIAL);
    if ((rc > 0 || is_partial) && match_buf && match_buf_size > 2) {
        NameTable nt;
        nt_load(re, &nt);
        /* For partial matches PCRE2 fills ovector[0..1] only; treat as rc=1. */
        int ser_rc = is_partial ? 1 : rc;
        JsonBuf b = { match_buf, 0, match_buf_size, 0 };
        jb_match_object(&b, subject, pcre2_get_ovector_pointer(md), ser_rc, &nt, is_partial);
        if (b.overflow) {
            pcre2_match_data_free(md);
            return WASM_BUF_OVERFLOW;
        }
        b.buf[b.pos] = '\0';
    }

    pcre2_match_data_free(md);
    return rc;
}

/*
 * Global search — finds all non-overlapping matches. Returns:
 *   >= 0  number of matches; match_buf contains JSON array of match objects
 *   -2    match_buf too small — retry with a larger buffer
 *   < -2  PCRE2 error (e.g. -47 matchlimit, -53 depthlimit)
 *
 * match_limit / depth_limit: 0 means use PCRE2 built-in defaults (no cap).
 * Passing match_buf=0 / match_buf_size=0 is valid: counts matches without
 * writing JSON (used by test()).
 *
 * JSON format: [{"match":"...","index":N,"groups":[...]},...]
 */
EMSCRIPTEN_KEEPALIVE
int pcre2_wasm_match_all(pcre2_code* re, const char* subject,
                          char* match_buf, uint32_t match_buf_size,
                          uint32_t match_limit, uint32_t depth_limit,
                          uint32_t start_offset, uint32_t match_flags) {
    if (!re || !subject) return -1;

    PCRE2_SIZE subj_len = strlen(subject);
    pcre2_match_data* md = pcre2_match_data_create_from_pattern(re, NULL);
    if (!md) return -48;

    pcre2_match_context* mctx = make_mctx(match_limit, depth_limit);

    int write_json = (match_buf != NULL && match_buf_size > 2);
    NameTable nt;
    if (write_json) nt_load(re, &nt);

    JsonBuf b = { match_buf, 0, match_buf_size, 0 };
    if (write_json) jb_char(&b, '[');

    int total = 0;
    int match_rc = 0;
    PCRE2_SIZE offset = (PCRE2_SIZE)start_offset;

    while (offset <= subj_len) {
        int rc = pcre2_match(re, (PCRE2_SPTR)subject, subj_len,
                             offset, (uint32_t)match_flags, md, mctx);
        if (rc == PCRE2_ERROR_NOMATCH) break;
        if (rc == PCRE2_ERROR_PARTIAL) {
            /* Partial match at end of subject — include it and stop. */
            if (write_json) {
                PCRE2_SIZE* ov = pcre2_get_ovector_pointer(md);
                if (total > 0) jb_char(&b, ',');
                jb_match_object(&b, subject, ov, 1, &nt, 1);
                if (b.overflow) {
                    if (mctx) pcre2_match_context_free(mctx);
                    pcre2_match_data_free(md);
                    return WASM_BUF_OVERFLOW;
                }
            }
            total++;
            break;
        }
        if (rc < 0) { match_rc = rc; break; }  /* propagate errors (limits, etc.) */

        PCRE2_SIZE* ov = pcre2_get_ovector_pointer(md);
        PCRE2_SIZE  start = ov[0], end = ov[1];

        if (write_json) {
            if (total > 0) jb_char(&b, ',');
            jb_match_object(&b, subject, ov, rc, &nt, 0);
            if (b.overflow) {
                if (mctx) pcre2_match_context_free(mctx);
                pcre2_match_data_free(md);
                return WASM_BUF_OVERFLOW;
            }
        }

        total++;
        offset = (end > start) ? end : end + 1;
    }

    if (mctx) pcre2_match_context_free(mctx);

    if (match_rc < 0) {
        pcre2_match_data_free(md);
        return match_rc;
    }

    if (write_json) {
        jb_char(&b, ']');
        b.buf[b.pos] = '\0';
    }

    pcre2_match_data_free(md);
    return total;
}

/*
 * Regex-based string replacement using pcre2_substitute (extended mode).
 * Replacement syntax: $0 or $& = whole match, $1..$n = numbered groups,
 * ${name} = named group, $$ = literal dollar.
 *
 * match_limit / depth_limit: 0 means use PCRE2 built-in defaults (no cap).
 *
 * Returns:
 *   >= 0  number of substitutions; out_buf contains the result string
 *   -2    out_buf too small — retry with a larger buffer
 *   < -2  PCRE2 error
 */
EMSCRIPTEN_KEEPALIVE
int pcre2_wasm_replace(pcre2_code* re, const char* subject,
                        const char* replacement, int global,
                        char* out_buf, uint32_t out_buf_size,
                        uint32_t match_limit, uint32_t depth_limit,
                        uint32_t start_offset, uint32_t match_flags) {
    if (!re || !subject || !replacement || !out_buf) return -1;

    pcre2_match_context* mctx = make_mctx(match_limit, depth_limit);

    PCRE2_SIZE out_len = (PCRE2_SIZE)out_buf_size;
    uint32_t opts = PCRE2_SUBSTITUTE_EXTENDED | PCRE2_SUBSTITUTE_OVERFLOW_LENGTH
                    | (uint32_t)match_flags;
    if (global) opts |= PCRE2_SUBSTITUTE_GLOBAL;

    int rc = pcre2_substitute(
        re,
        (PCRE2_SPTR)subject, PCRE2_ZERO_TERMINATED,
        (PCRE2_SIZE)start_offset, opts,
        NULL, mctx,
        (PCRE2_SPTR)replacement, PCRE2_ZERO_TERMINATED,
        (PCRE2_UCHAR*)out_buf, &out_len
    );

    if (mctx) pcre2_match_context_free(mctx);
    return (rc == PCRE2_ERROR_NOMEMORY) ? WASM_BUF_OVERFLOW : rc;
}

EMSCRIPTEN_KEEPALIVE
void pcre2_wasm_free(pcre2_code* re) {
    if (re) pcre2_code_free(re);
}
