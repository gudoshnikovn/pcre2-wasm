/**
 * PCRE2 flag constants. Combine with bitwise OR: FLAGS.CASELESS | FLAGS.MULTILINE
 */
export declare const FLAGS: {
  readonly CASELESS:  0x00000008;
  readonly MULTILINE: 0x00000400;
  readonly DOTALL:    0x00000020;
  readonly EXTENDED:  0x00000080;
  readonly UTF:       0x00080000;
};

/**
 * A compiled PCRE2 regular expression. Created by PCRE2.compile().
 * Call destroy() when done to free WASM memory.
 */
export declare class PCRE2Regex {
  readonly pattern: string;
  test(subject: string): boolean;
  match(subject: string): string[] | null;
  matchAll(subject: string): string[];
  destroy(): void;
}

export declare class PCRE2 {
  /** Compile a pattern into a reusable regex. Caller must call destroy() when done. */
  compile(pattern: string, flags?: number): PCRE2Regex;
  test(pattern: string, subject: string, flags?: number): boolean;
  match(pattern: string, subject: string, flags?: number): string[] | null;
  matchAll(pattern: string, subject: string, flags?: number): string[];
}

/**
 * Initialize the PCRE2 WASM module. The binary is embedded — no external files needed.
 * @example
 * const pcre2 = await createPCRE2();
 * pcre2.matchAll('\\d+', 'abc 123'); // ["123"]
 */
export declare function createPCRE2(): Promise<PCRE2>;
