#define PCRE2_CODE_UNIT_WIDTH 8
#include <emscripten.h>
#include <string.h>
#include <stdlib.h>
#include "pcre2.h"

// Returns compiled regex pointer, or 0 on error.
// error_buf must be >= 256 bytes, error_offset is output param.
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

// Returns number of matches (>0), -1 for no match, <-1 for error.
// match_buf receives null-terminated JSON array of matches: ["m0","m1",...]
EMSCRIPTEN_KEEPALIVE
int pcre2_wasm_match(pcre2_code* re, const char* subject,
                     char* match_buf, uint32_t match_buf_size) {
    if (!re || !subject) return -1;

    PCRE2_SIZE subj_len = strlen(subject);
    pcre2_match_data* md = pcre2_match_data_create_from_pattern(re, NULL);
    if (!md) return -48;

    int rc = pcre2_match(re, (PCRE2_SPTR)subject, subj_len, 0, 0, md, NULL);

    if (rc > 0 && match_buf && match_buf_size > 2) {
        PCRE2_SIZE* ovector = pcre2_get_ovector_pointer(md);
        uint32_t pos = 0;
        match_buf[pos++] = '[';
        for (int i = 0; i < rc; i++) {
            if (i > 0 && pos < match_buf_size - 1) match_buf[pos++] = ',';
            PCRE2_SIZE start = ovector[2 * i];
            PCRE2_SIZE end   = ovector[2 * i + 1];
            uint32_t len = (uint32_t)(end - start);
            if (pos + len + 4 >= match_buf_size) break;
            match_buf[pos++] = '"';
            memcpy(match_buf + pos, subject + start, len);
            pos += len;
            match_buf[pos++] = '"';
        }
        if (pos < match_buf_size - 1) match_buf[pos++] = ']';
        match_buf[pos] = '\0';
    }

    pcre2_match_data_free(md);
    return rc;
}

// Global search — finds all non-overlapping matches, returns count.
// match_buf receives JSON array of all full matches: ["m1","m2",...]
EMSCRIPTEN_KEEPALIVE
int pcre2_wasm_match_all(pcre2_code* re, const char* subject,
                          char* match_buf, uint32_t match_buf_size) {
    if (!re || !subject) return -1;

    PCRE2_SIZE subj_len = strlen(subject);
    pcre2_match_data* md = pcre2_match_data_create_from_pattern(re, NULL);
    if (!md) return -48;

    uint32_t pos = 0;
    int total = 0;
    PCRE2_SIZE offset = 0;

    if (match_buf && match_buf_size > 2) match_buf[pos++] = '[';

    while (offset <= subj_len) {
        int rc = pcre2_match(re, (PCRE2_SPTR)subject, subj_len, offset, 0, md, NULL);
        if (rc <= 0) break;

        PCRE2_SIZE* ovector = pcre2_get_ovector_pointer(md);
        PCRE2_SIZE start = ovector[0];
        PCRE2_SIZE end   = ovector[1];
        uint32_t len = (uint32_t)(end - start);

        if (match_buf && pos + len + 5 < match_buf_size) {
            if (total > 0) match_buf[pos++] = ',';
            match_buf[pos++] = '"';
            memcpy(match_buf + pos, subject + start, len);
            pos += len;
            match_buf[pos++] = '"';
        }

        total++;
        offset = (end > start) ? end : end + 1;
    }

    if (match_buf && match_buf_size > 2) {
        match_buf[pos++] = ']';
        match_buf[pos] = '\0';
    }

    pcre2_match_data_free(md);
    return total;
}

EMSCRIPTEN_KEEPALIVE
void pcre2_wasm_free(pcre2_code* re) {
    if (re) pcre2_code_free(re);
}
