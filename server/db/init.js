const { Pool } = require('pg');

// Railway автоматически устанавливает DATABASE_URL при подключении PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway')
    ? { rejectUnauthorized: false }
    : false
});

// Создание таблиц
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id  BIGINT PRIMARY KEY,
      first_name   TEXT NOT NULL DEFAULT '',
      last_name    TEXT DEFAULT '',
      username     TEXT DEFAULT '',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS habits (
      id           SERIAL PRIMARY KEY,
      owner_id     BIGINT NOT NULL REFERENCES users(telegram_id),
      name         TEXT NOT NULL,
      description  TEXT DEFAULT '',
      icon         TEXT DEFAULT '⭐',
      frequency    TEXT DEFAULT 'daily' CHECK(frequency IN ('daily', 'weekly')),
      is_public    INTEGER DEFAULT 1,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS completions (
      id         SERIAL PRIMARY KEY,
      habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      user_id    BIGINT NOT NULL REFERENCES users(telegram_id),
      date       TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(habit_id, user_id, date)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id    BIGINT NOT NULL REFERENCES users(telegram_id),
      habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(user_id, habit_id)
    );

    CREATE INDEX IF NOT EXISTS idx_habits_owner ON habits(owner_id);
    CREATE INDEX IF NOT EXISTS idx_completions_habit ON completions(habit_id, date);
    CREATE INDEX IF NOT EXISTS idx_completions_user ON completions(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
  `);

  console.log('✅ Database tables initialized');
}

module.exports = { pool, initDB };
