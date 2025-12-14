import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import db from './db.js';

async function migrateUser(userData, settingsData) {
  try {
    const userId = randomUUID();
    const now = Date.now();

    let passwordHash = null;
    if (userData.encrypted_password) {
      passwordHash = userData.encrypted_password;
    } else {
      passwordHash = null;
    }

    db.prepare(
      `
      INSERT INTO users (id, email, password_hash, username, bio, avatar_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      userId,
      userData.email,
      passwordHash,
      userData.user_metadata?.name || null,
      userData.user_metadata?.bio || null,
      userData.user_metadata?.avatar_url || null,
      (() => {
        const createdAtTime = new Date(userData.created_at).getTime();
        return Number.isNaN(createdAtTime) ? now : createdAtTime;
      })(),
      now
    );

    if (settingsData && settingsData.localstorage_data) {
      db.prepare(
        `
        INSERT INTO user_settings (user_id, localstorage_data, updated_at)
        VALUES (?, ?, ?)
      `
      ).run(userId, settingsData.localstorage_data, now);
    }

    console.log(`Migrated user: ${userData.email} -> ${userId}`);
    return userId;
  } catch (error) {
    console.error(`Error migrating user ${userId}:`, error);
    return null;
  }
}

export async function migrateFromSupabase(supabaseUsers, supabaseSettings) {
  console.log('Starting migration from Supabase...');
  let migrated = 0;
  let failed = 0;

  for (const user of supabaseUsers) {
    const settings = supabaseSettings?.find((s) => s.user_id === user.id);
    const result = await migrateUser(user, settings);
    if (result) {
      migrated++;
    } else {
      failed++;
    }
  }

  console.log(`Migration complete: ${migrated} migrated, ${failed} failed`);
  return { migrated, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Migration script ready.');
  console.log('To use this script, import it and call migrateFromSupabase() with your Supabase data.');
  console.log('Example:');
  console.log('  const users = [...]; // Array of user objects from Supabase');
  console.log('  const settings = [...]; // Array of user_settings from Supabase');
  console.log('  await migrateFromSupabase(users, settings);');
}
