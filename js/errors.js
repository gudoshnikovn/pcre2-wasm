export class PCRE2CompileError extends Error {
  constructor(message, offset) {
    super(message);
    this.name = 'PCRE2CompileError';
    this.offset = offset;
  }
}

export class PCRE2MatchError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PCRE2MatchError';
    this.code = code;
  }
}
