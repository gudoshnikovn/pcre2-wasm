/* Match-time flags — passed via MatchOptions.matchFlags. */
export const MATCH_FLAGS = {
  NOTBOL:           0x00000001,  // Subject is not at a line beginning; ^ won't match at start
  NOTEOL:           0x00000002,  // Subject is not at a line end; $ won't match at end
  NOTEMPTY:         0x00000004,  // Empty string is not a valid match
  NOTEMPTY_ATSTART: 0x00000008,  // Empty string at start of subject is not a valid match
  PARTIAL_SOFT:     0x00000010,  // Return partial match if no full match; prefer full match
  PARTIAL_HARD:     0x00000020,  // Return partial match if no full match; prefer partial match
};

/* Compile-time flags — passed as the flags argument to compile(). */
export const FLAGS = {
  CASELESS:          0x00000008,  // (?i) Case-insensitive matching
  MULTILINE:         0x00000400,  // (?m) ^ and $ match line boundaries
  DOTALL:            0x00000020,  // (?s) . matches any character including newline
  EXTENDED:          0x00000080,  // (?x) Ignore unescaped whitespace in pattern
  EXTENDED_MORE:     0x01000000,  // (?xx) Also ignore whitespace inside character classes
  UTF:               0x00080000,  // Treat pattern and subject as UTF-8
  UCP:               0x00020000,  // Unicode properties for \d, \w, \s, \b and (?i); enables UTF
  ANCHORED:          0x80000000,  // Match only at the start of the subject
  ENDANCHORED:       0x20000000,  // Match only at the end of the subject
  UNGREEDY:          0x00040000,  // (?U) Invert greediness of all quantifiers
  NO_AUTO_CAPTURE:   0x00002000,  // (?n) Plain () do not capture; use (?:) or named groups
  DUPNAMES:          0x00000040,  // Allow duplicate named groups: (?<name>...)...(?<name>...)
  DOLLAR_ENDONLY:    0x00000010,  // $ matches only at end of string, not before trailing newline
  ALLOW_EMPTY_CLASS: 0x00000001,  // Allow [] as an empty character class (never matches)
  ALT_BSUX:          0x00000002,  // JavaScript-style \u{HHHH} and \x{HH} escape sequences
  LITERAL:           0x02000000,  // Treat the entire pattern as a literal string
  ALT_EXTENDED_CLASS:0x08000000,  // Enable extended character class syntax [[ ]]
};

/*
 * Substitution flags — passed via MatchOptions.replaceFlags.
 * Note: UNSET_EMPTY is always active by default (unmatched groups → "").
 */
export const REPLACE_FLAGS = {
  UNSET_EMPTY:   0x00000400,  // Unmatched groups → "" — already the default; documented for clarity
  UNKNOWN_UNSET: 0x00000800,  // Unknown group name reference → "" instead of an error
  LITERAL:       0x00008000,  // Replacement string is plain text; no $-substitution
};

/* Extra compile-time flags — passed as the extraFlags argument to compile(). */
export const EXTRA_FLAGS = {
  ALLOW_LOOKAROUND_BSK: 0x00000040,  // Allow \K inside lookaround assertions
  MATCH_WORD:           0x00000004,  // Pattern is implicitly wrapped in \b...\b
  MATCH_LINE:           0x00000008,  // Pattern is implicitly anchored to ^...$
  CASELESS_RESTRICT:    0x00000080,  // ASCII-only case folding even when UCP is on
  ASCII_BSD:            0x00000100,  // \d matches only ASCII digits [0-9]
  ASCII_BSS:            0x00000200,  // \s matches only ASCII whitespace
  ASCII_BSW:            0x00000400,  // \w matches only ASCII word characters [A-Za-z0-9_]
  TURKISH_CASING:       0x00010000,  // Turkish/Azerbaijani I/İ casing rules under (?i)
};
