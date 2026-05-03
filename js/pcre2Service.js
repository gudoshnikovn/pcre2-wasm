import { createPCRE2 } from '../lib/index.js';

let instance = null;
let initPromise = null;

export async function getPCRE2() {
  if (instance) return instance;
  if (initPromise) return initPromise;

  initPromise = createPCRE2().then((pcre2) => {
    instance = pcre2;
    return pcre2;
  });

  return initPromise;
}
