import { AppError, isAppError } from './app-error';

describe('AppError', () => {
  it('carries a code, a message and a cause', () => {
    const cause = new Error('23505');
    const error = new AppError('conflict', 'outra pessoa editou antes', { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe('conflict');
    expect(error.message).toBe('outra pessoa editou antes');
    expect(error.cause).toBe(cause);
    expect(new AppError('network').message).toBe('network');
  });

  it('is recognised by isAppError, optionally by code', () => {
    const error = new AppError('not_found');
    expect(isAppError(error)).toBe(true);
    expect(isAppError(error, 'not_found')).toBe(true);
    expect(isAppError(error, 'conflict')).toBe(false);
    expect(isAppError(new Error('not_found'))).toBe(false);
  });
});
