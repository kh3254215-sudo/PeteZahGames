import argon2 from 'argon2';
import { randomUUID } from 'crypto';
import db from './db.js';
/**
 * Supabase user record structure.
 * @typedef {Object} SupabaseUser
 * @property {string} id - Original Supabase user ID.
 * @property {string} email - User's email address.
 * @property {string} [encrypted_password] - Optional pre-hashed password from Supabase.
 * @property {Object} [user_metadata] - Optional metadata object.
 * @property {string} [user_metadata.name] - Display name.
 * @property {string} [user_metadata.bio] - User biography.
 * @property {string} [user_metadata.avatar_url] - Avatar image URL.
 * @property {string|Date} created_at - Creation timestamp.
 */

/**
 * Supabase settings record structure.
 * @typedef {Object} SupabaseSettings
 * @property {string} user_id - ID of the user this settings record belongs to.
 * @property {string} [localstorage_data] - Serialized local storage data.
 */

/**
 * Migrates a single user from Supabase to the local database.
 *
 * Inserts the user into the `users` table and optionally their settings into
 * the `user_settings` table. Generates a new UUID for the local user ID.
 *
 * @param {SupabaseUser} userData - The Supabase user record to migrate.
 * @param {SupabaseSettings} [settingsData] - Optional settings record for the user.
 * @returns {Promise<string|null>} Resolves to the new local user ID, or `null` if migration failed.
 */
async function migrateUser(userData, settingsData) {
  try {
    const userId = randomUUID();
    const now = Date.now();

    let passwordHash = null;
    if (userData.encrypted_password) {
      passwordHash = userData.encrypted_password;
    } else {
      passwordHash = argon2.hash('temp_password_' + randomUUID(), {
        type: argon2.argon2id,
        memoryCost: 65565, // 64 MB
        timeCost: 5, // iterations
        parallelism: 1 // threads
      });
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
      new Date(userData.created_at).getTime() || now,
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
    console.error(`Error migrating user ${userData.email}:`, error);
    return null;
  }
}

/**
 * Migrates multiple users and their settings from Supabase to the local database.
 *
 * Iterates through all provided Supabase users, migrating each one and tracking
 * successes and failures.
 *
 * @param {SupabaseUser[]} supabaseUsers - Array of Supabase user records.
 * @param {SupabaseSettings[]} [supabaseSettings] - Array of Supabase settings records.
 * @returns {Promise<{migrated:number, failed:number}>} Summary of migration results.
 */
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
