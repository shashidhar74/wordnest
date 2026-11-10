/** Roles from the backend's JWT (`role` claim). They decide which buttons a user sees. */
export type UserRole = 'creator' | 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role?: UserRole;
}
