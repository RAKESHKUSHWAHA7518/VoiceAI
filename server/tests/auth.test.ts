import { authenticate, authorize, requireSession } from '../src/middleware/auth';
import { AuthenticationError } from '../src/types';
import jwt from 'jsonwebtoken';
import config from '../src/config';

describe('Authentication failures', () => {
  const next = jest.fn();
  test('missing credentials produce HTTP 401', () => {
    expect(() => authenticate({ headers: {} } as any, {} as any, next)).toThrow(AuthenticationError);
  });
  test('invalid credentials produce HTTP 401', () => {
    expect(() => authenticate({ headers: { authorization: 'Bearer invalid' } } as any, {} as any, next)).toThrow(AuthenticationError);
  });
  test('expired credentials produce HTTP 401', () => {
    const token = jwt.sign({ id: 'user', roles: [] }, config.jwt.secret, { expiresIn: -1 });
    expect(() => authenticate({ headers: { authorization: `Bearer ${token}` } } as any, {} as any, next)).toThrow(AuthenticationError);
  });
  test('authorization without identity produces HTTP 401', () => {
    expect(() => authorize('admin')({} as any, {} as any, next)).toThrow(AuthenticationError);
  });
  test('missing session produces HTTP 401', () => {
    expect(() => requireSession({ user: { id: 'user' } } as any, {} as any, next)).toThrow(AuthenticationError);
  });
});
