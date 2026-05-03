/**
 * The result of a match operation.
 * `groups` contains numbered capture groups (index 0 = first group).
 * `namedGroups` is present only when the pattern contains named groups.
 * A null entry means the corresponding optional group did not participate.
 */
export interface PCRE2Match {
  match:        string;
  index:        number;
  groups:       (string | null)[];
  namedGroups?: Record<string, string | null>;
}

/**
 * PCRE2 flag constants. Combine with bitwise OR: FLAGS.CASELESS | FLAGS.MULTILINE
 */
export declare const FLAGS: {
  readonly CASELESS:        0x00000008;
  readonly MULTILINE:       0x00000400;
  readonly DOTALL:          0x00000020;
  readonly EXTENDED:        0x00000080;
  readonly UTF:             0x00080000;
  readonly ANCHORED:        0x80000000;
  readonly UNGREEDY:        0x00040000;
  readonly NO_AUTO_CAPTURE: 0x00002000;
  readonly EXTENDED_MORE:   0x01000000;
};

/**
 * A compiled PCRE2 regular expression. Created by PCRE2.compile().
 * Call destroy() when done to free WASM memory.
 */
export declare class PCRE2Regex {
  readonly pattern: string;

  /** Returns true if the pattern matches anywhere in subject. */
  test(subject: string): boolean;

  /** Returns the first match, or null if no match. */
  match(subject: string): PCRE2Match | null;

  /** Returns all non-overlapping matches. */
  matchAll(subject: string): PCRE2Match[];

  /**
   * Returns the byte offset of the first match, or -1 if no match.
   * Note: offset is in UTF-8 bytes when the UTF flag is used.
   */
  search(subject: string): number;

  /**
   * Replaces the first match and returns the resulting string.
   * Replacement syntax: $0 or $& = whole match, $1..$n = numbered group,
   * ${name} = named group, $$ = literal dollar.
   */
  replace(subject: string, replacement: string): string;

  /** Replaces all non-overlapping matches. Same replacement syntax as replace(). */
  replaceAll(subject: string, replacement: string): string;

  /** Free WASM memory. No-op if already destroyed. */
  destroy(): void;
}

export declare class PCRE2 {
  /** Compile a pattern into a reusable PCRE2Regex. Caller must call destroy() when done. */
  compile(pattern: string, flags?: number): PCRE2Regex;

  test(pattern: string, subject: string, flags?: number): boolean;
  match(pattern: string, subject: string, flags?: number): PCRE2Match | null;
  matchAll(pattern: string, subject: string, flags?: number): PCRE2Match[];
  search(pattern: string, subject: string, flags?: number): number;
  replace(pattern: string, subject: string, replacement: string, flags?: number): string;
  replaceAll(pattern: string, subject: string, replacement: string, flags?: number): string;
}

/**
 * Initialize the PCRE2 WASM module. The binary is embedded — no external files needed.
 * @example
 * const pcre2 = await createPCRE2();
 * const r = pcre2.match('(\\w+)', 'hello');
 * // { match: 'hello', index: 0, groups: ['hello'] }
 */
export declare function createPCRE2(): Promise<PCRE2>;
