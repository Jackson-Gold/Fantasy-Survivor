import argon2 from 'argon2';
import { db } from './index.js';
import { users } from './schema.js';

export async function seedAdminIfEmpty(): Promise<void> {
  const username = process.env.ADMIN_SEED_USERNAME;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!username || !password) return;
  const existing = await db.select().from(users).limit(1);
  if (existing.length > 0) return;
  const hash = await argon2.hash(password);
  await db.insert(users).values({
    username,
    passwordHash: hash,
    role: 'admin',
    mustChangePassword: true,
  });
  console.log('Seeded admin user:', username);
}
