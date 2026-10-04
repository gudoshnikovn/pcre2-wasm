import { useState, useEffect, useRef } from 'react';
import { createPCRE2 } from '../lib/index.js';

/* Module-level singleton — shared across all hook instances. In HMR environments
   (Vite, webpack) the module may reload and the WASM instance will be recreated. */
let sharedInstance = null;
let sharedPromise = null;

export function usePCRE2() {
  const [ready, setReady] = useState(!!sharedInstance);
  const [error, setError] = useState(null);
  const pcre2 = useRef(sharedInstance);

  useEffect(() => {
    if (sharedInstance) {
      pcre2.current = sharedInstance;
      setReady(true);
      return;
    }

    if (!sharedPromise) {
      sharedPromise = createPCRE2().then(
        (instance) => {
          sharedInstance = instance;
          return instance;
        },
        (err) => {
          /* Forget the failure so that the next mount retries. */
          sharedPromise = null;
          throw err;
        },
      );
    }

    sharedPromise.then(
      (instance) => {
        pcre2.current = instance;
        setReady(true);
      },
      (err) => setError(err),
    );
  }, []);

  return { ready, pcre2: pcre2.current, error };
}
