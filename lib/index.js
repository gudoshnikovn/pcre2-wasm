import PCRE2Module from '../dist/pcre2.js';
import { PCRE2, FLAGS } from '../js/pcre2.js';

export async function createPCRE2() {
  const mod = await PCRE2Module();
  return new PCRE2(mod);
}

export { FLAGS };
