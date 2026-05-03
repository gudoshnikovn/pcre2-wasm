import { useState, useEffect, useRef } from 'react';
import { createPCRE2 } from '../lib/index.js';

let sharedInstance = null;
let sharedPromise = null;

export function usePCRE2() {
  const [ready, setReady] = useState(!!sharedInstance);
  const pcre2 = useRef(sharedInstance);

  useEffect(() => {
    if (sharedInstance) {
      pcre2.current = sharedInstance;
      setReady(true);
      return;
    }

    if (!sharedPromise) {
      sharedPromise = createPCRE2().then((instance) => {
        sharedInstance = instance;
        return instance;
      });
    }

    sharedPromise.then((instance) => {
      pcre2.current = instance;
      setReady(true);
    });
  }, []);

  return { ready, pcre2: pcre2.current };
}
