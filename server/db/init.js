const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

// Включаем WAL для лучшей производительности
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Создание таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id  INTEGER PRIMARY KEY,
    first_name   TEXT NOT NULL DEFAULT '',
    last_name    TEXT DEFAULT '',
    username     TEXT DEFAULT '',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS habits (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id     INTEGER NOT NULL REFERENCES users(telegram_id),
    name         TEXT NOT NULL,
    description  TEXT DEFAULT '',
    icon         TEXT DEFAULT '⭐',
    frequency    TEXT DEFAULT 'daily' CHECK(frequency IN ('daily', 'weekly')),
    is_public    INTEGER DEFAULT 1,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS completions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(telegram_id),
    date       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(habit_id, user_id, date)
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id    INTEGER NOT NULL REFERENCES users(telegram_id),
    habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, habit_id)
  );

  CREATE INDEX IF NOT EXISTS idx_habits_owner ON habits(owner_id);
  CREATE INDEX IF NOT EXISTS idx_completions_habit ON completions(habit_id, date);
  CREATE INDEX IF NOT EXISTS idx_completions_user ON completions(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
`);

module.exports = db;
