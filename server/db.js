import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import Database from 'better-sqlite3';

const useCloudSQL =
  process.env.DB_HOST &&
  process.env.DB_USER &&
  process.env.DB_PASS &&
  process.env.DB_NAME;

const SQLitePath = process.env.DB_SQLITE_PATH;

let db;

if (useCloudSQL && !SQLitePath) {
  // --- Cloud SQL (Postgres) ---
  const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  // Run schema setup once at startup
  (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          username TEXT,
          bio TEXT,
          avatar_url TEXT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          email_verified INTEGER DEFAULT 0,
          verification_token TEXT,
          is_admin INTEGER DEFAULT 0,
          school TEXT,
          age INTEGER,
          ip TEXT
        );

        CREATE TABLE IF NOT EXISTS changelog (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          author_id TEXT NOT NULL REFERENCES users(id),
          created_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS feedback (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_settings (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          localstorage_data TEXT,
          theme TEXT DEFAULT 'dark',
          updated_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_sessions (
          session_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at BIGINT NOT NULL,
          expires_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS comments (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS likes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at BIGINT NOT NULL,
          UNIQUE(type, target_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
      `);
    } catch (err) {
      console.error('Failed to initialize schema:', err);
      process.exit(1);
    }
  })();

  db = pool;
} else {
  // --- Local SQLite fallback ---
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const dbPath = SQLitePath
    ? path.join(__dirname, SQLitePath)
    : path.join(__dirname, '..', 'data', 'users.db');
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');

  sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        username TEXT,
        bio TEXT,
        avatar_url TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

  try {
    const tableInfo = sqlite.prepare('PRAGMA table_info(users)').all();
    const columnNames = tableInfo.map((col) => col.name);
    const hasExistingUsers = sqlite.prepare('SELECT COUNT(*) as count FROM users').get().count > 0;

    if (!columnNames.includes('email_verified')) {
      sqlite.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0');
      if (hasExistingUsers) {
        sqlite.exec('UPDATE users SET email_verified = 1');
      }
    }
    if (!columnNames.includes('verification_token')) {
      sqlite.exec('ALTER TABLE users ADD COLUMN verification_token TEXT');
    }
    if (!columnNames.includes('is_admin')) {
      sqlite.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
    }
    if (!columnNames.includes('school')) {
      sqlite.exec('ALTER TABLE users ADD COLUMN school TEXT');
    }
    if (!columnNames.includes('age')) {
      sqlite.exec('ALTER TABLE users ADD COLUMN age INTEGER');
    }
    if (!columnNames.includes('ip')) {
      sqlite.exec('ALTER TABLE users ADD COLUMN ip TEXT');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }

  sqlite.exec(`
      CREATE TABLE IF NOT EXISTS changelog (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (author_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        localstorage_data TEXT,
        theme TEXT DEFAULT 'dark',
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS likes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(type, target_id, user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
    `);

  db = sqlite;
};

export default db;
export { useCloudSQL };
