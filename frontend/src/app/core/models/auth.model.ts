import { User, UserRole } from './user.model';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
}

/** `POST /auth/users` → 201 `{ message, data: { id, name, email } }` */
export interface SignupResponse {
  message: string;
  data: User;
}

/**
 * `POST /auth/login` → 200. The Node backend sends `{ message, token, userId }`;
 * `user` is optional (the mock sends it). Missing details are read from the JWT.
 */
export interface AuthResponse {
  token: string;
  message?: string;
  userId?: string | number;
  user?: User;
}

/** Claims inside the backend's JWT: jwt.sign({ userId, email, role }, …, { expiresIn: '1h' }) */
export interface TokenPayload {
  userId?: string | number;
  email?: string;
  name?: string;
  role?: UserRole;
  /** Expiry, in seconds since 1970 (added by `expiresIn`). */
  exp?: number;
}
