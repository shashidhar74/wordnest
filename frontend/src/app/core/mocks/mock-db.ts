import { Post, PostStatus, User } from '../models';

/**
 * In-memory data for the mock backend (development only).
 * Resets on page reload.
 */

export interface MockUser extends User {
  password: string;
}

export const users: MockUser[] = [
  { id: '1', name: 'Maya Chen', email: 'admin@example.com', password: 'admin123' },
  { id: '2', name: 'Kiran Mehta', email: 'user@example.com', password: 'user123' },
];

const samples: [string, PostStatus, string][] = [
  ['Getting started with Node.js', 'published', '1'],
  ['Building a REST API with Express', 'published', '1'],
  ['Understanding middleware in Express', 'published', '2'],
  ['Handling errors in Express 5', 'draft', '1'],
  ['Connecting Node.js to MongoDB', 'published', '2'],
  ['JWT authentication step by step', 'draft', '1'],
  ['Validating request bodies', 'published', '1'],
  ['Pagination in a REST API', 'draft', '2'],
  ['Environment variables with dotenv', 'published', '1'],
  ['Structuring an Express project', 'published', '2'],
  ['Async/await vs callbacks', 'published', '1'],
  ['Writing your first unit test', 'draft', '1'],
];

const DAY = 86_400_000;
const now = Date.now();

export const posts: Post[] = samples.map(([title, status, authorId], i) => {
  const author = users.find((u) => u.id === authorId)!;
  const created = new Date(now - (samples.length - i) * 3 * DAY);
  return {
    id: String(i + 1),
    title,
    content: `This is sample content for "${title}". Replace it by connecting the Node.js API.`,
    status,
    author: { id: author.id, name: author.name },
    createdAt: created.toISOString(),
    updatedAt: new Date(created.getTime() + DAY).toISOString(),
  };
});

export function toPublicUser({ id, name, email }: MockUser): User {
  return { id, name, email };
}
