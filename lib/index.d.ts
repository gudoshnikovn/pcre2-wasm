/**
 * The result of a match operation.
 * `groups` contains numbered capture groups (index 0 = first group).
 * `namedGroups` is present only when the pattern contains named groups.
 * A null entry means the corresponding optional group did not participate.
 */
export interface PCRE2Match {
  match:        string;
  /** Character offset of the match start in the subject string (not a byte offset). */
  index:        number;
  groups:       (string | null)[];
  namedGroups?: Record<string, string | null>;
}

/**
 * Options for match operations. All fields are optional.
 *
 * Use matchLimit and depthLimit to protect against ReDoS on untrusted patterns:
 * if either limit is exceeded PCRE2 throws instead of running indefinitely.
 */
export interface MatchOptions {
  /**
   * Maximum number of backtracking steps before throwing.
   * A value of 0 (default) means no limit beyond PCRE2's built-in default.
   */
  matchLimit?: number;
  /**
   * Maximum depth of the backtracking stack before throwing.
   * A value of 0 (default) means no limit beyond PCRE2's built-in default.
   */
  depthLimit?: number;
}

/**
 * PCRE2 flag constants. Combine with bitwise OR: FLAGS.CASELESS | FLAGS.MULTILINE
 */
export declare const FLAGS: {
  readonly CASELESS:          0x00000008;
  readonly MULTILINE:         0x00000400;
  readonly DOTALL:            0x00000020;
  readonly EXTENDED:          0x00000080;
  readonly EXTENDED_MORE:     0x01000000;
  readonly UTF:               0x00080000;
  /** Use Unicode properties for \d, \w, \s, \b and (?i) case-folding. UTF is enabled automatically when UCP is set. */
  readonly UCP:               0x00020000;
  readonly ANCHORED:          0x80000000;
  /** Anchor the match to the end of the subject. */
  readonly ENDANCHORED:       0x20000000;
  readonly UNGREEDY:          0x00040000;
  readonly NO_AUTO_CAPTURE:   0x00002000;
  /** Allow duplicate named groups: (?<name>...)...(?<name>...). */
  readonly DUPNAMES:          0x00000040;
  /** $ matches only at the absolute end of the string, not before a trailing newline. */
  readonly DOLLAR_ENDONLY:    0x00000010;
  /** Allow [] as an empty character class that never matches. */
  readonly ALLOW_EMPTY_CLASS: 0x00000001;
  /** Enable JavaScript-style \\u{HHHH} and \\x{HH} escape sequences. */
  readonly ALT_BSUX:          0x00000002;
  /** Treat the entire pattern as a literal string — no metacharacters. */
  readonly LITERAL:           0x02000000;
  /** Enable extended character class syntax [[ ]]. */
  readonly ALT_EXTENDED_CLASS:0x08000000;
};

/**
 * A compiled PCRE2 regular expression. Created by PCRE2.compile().
 * Call destroy() when done to free WASM memory.
 */
export declare class PCRE2Regex {
  readonly pattern: string;

  /** Returns true if the pattern matches anywhere in subject. */
  test(subject: string, options?: MatchOptions): boolean;

  /** Returns the first match, or null if no match. */
  match(subject: string, options?: MatchOptions): PCRE2Match | null;

  /** Returns all non-overlapping matches. */
  matchAll(subject: string, options?: MatchOptions): PCRE2Match[];

  /** Returns the character offset of the first match, or -1 if no match. */
  search(subject: string, options?: MatchOptions): number;

  /**
   * Replaces the first match and returns the resulting string.
   * Replacement syntax: $0 or $& = whole match, $1..$n = numbered group,
   * ${name} = named group, $$ = literal dollar.
   */
  replace(subject: string, replacement: string, options?: MatchOptions): string;

  /** Replaces all non-overlapping matches. Same replacement syntax as replace(). */
  replaceAll(subject: string, replacement: string, options?: MatchOptions): string;

  /** Free WASM memory. No-op if already destroyed. */
  destroy(): void;
}

export declare class PCRE2 {
  /** Compile a pattern into a reusable PCRE2Regex. Caller must call destroy() when done. */
  compile(pattern: string, flags?: number): PCRE2Regex;

  test(pattern: string, subject: string, flags?: number, options?: MatchOptions): boolean;
  match(pattern: string, subject: string, flags?: number, options?: MatchOptions): PCRE2Match | null;
  matchAll(pattern: string, subject: string, flags?: number, options?: MatchOptions): PCRE2Match[];
  search(pattern: string, subject: string, flags?: number, options?: MatchOptions): number;
  replace(pattern: string, subject: string, replacement: string, flags?: number, options?: MatchOptions): string;
  replaceAll(pattern: string, subject: string, replacement: string, flags?: number, options?: MatchOptions): string;
}

/**
 * Initialize the PCRE2 WASM module. The binary is embedded — no external files needed.
 * @example
 * const pcre2 = await createPCRE2();
 * const r = pcre2.match('(\\w+)', 'hello');
 * // { match: 'hello', index: 0, groups: ['hello'] }
 */
export declare function createPCRE2(): Promise<PCRE2>;
