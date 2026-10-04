import type { PCRE2 } from './index.js';

export interface UsePCRE2Result {
  ready: boolean;
  pcre2: PCRE2 | null;
  /** Set if loading the WASM module failed; a later mount of the hook retries. */
  error: Error | null;
}

/**
 * React hook that loads the PCRE2 WASM module once per app lifetime.
 * @example
 * const { ready, pcre2 } = usePCRE2();
 * if (!ready) return <p>Loading...</p>;
 */
export declare function usePCRE2(): UsePCRE2Result;
