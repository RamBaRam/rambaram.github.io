const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/habits — Мои привычки + подписки
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;

    // Мои привычки
    const myHabits = db.prepare(`
        SELECT h.*,
          (SELECT COUNT(*) FROM subscriptions WHERE habit_id = h.id) as subscriber_count
        FROM habits h
        WHERE h.owner_id = ?
        ORDER BY h.created_at DESC
      `).all(userId);

    // Подписки
    const subscribed = db.prepare(`
        SELECT h.*, u.first_name as owner_name, u.username as owner_username,
          (SELECT COUNT(*) FROM subscriptions WHERE habit_id = h.id) as subscriber_count
        FROM subscriptions s
        JOIN habits h ON s.habit_id = h.id
        JOIN users u ON h.owner_id = u.telegram_id
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC
      `).all(userId);

    // Выполнения за сегодня
    const today = new Date().toISOString().split('T')[0];
    const todayCompletions = db.prepare(`
        SELECT habit_id FROM completions
        WHERE user_id = ? AND date = ?
      `).all(userId, today).map(r => r.habit_id);

    // Серии для каждой привычки
    const addStreaks = (habits) => habits.map(h => ({
      ...h,
      streak: calculateStreak(h.id, userId),
      completedToday: todayCompletions.includes(h.id)
    }));

    res.json({
      my: addStreaks(myHabits),
      subscribed: addStreaks(subscribed)
    });
  } catch (e) {
    console.error('GET /api/habits error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/habits — Создать привычку
router.post('/', (req, res) => {
  const { name, description, icon, frequency, is_public } = req.body;
  const userId = req.user.id;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название обязательно' });
  }

  const result = db.prepare(`
    INSERT INTO habits (owner_id, name, description, icon, frequency, is_public)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, name.trim(), description || '', icon || '⭐', frequency || 'daily', is_public ? 1 : 0);

  const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(habit);
});

// DELETE /api/habits/:id — Удалить привычку
router.delete('/:id', (req, res) => {
  const habitId = parseInt(req.params.id);
  const userId = req.user.id;

  const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND owner_id = ?').get(habitId, userId);
  if (!habit) {
    return res.status(404).json({ error: 'Привычка не найдена' });
  }

  db.prepare('DELETE FROM habits WHERE id = ?').run(habitId);
  res.json({ success: true });
});

// GET /api/habits/:id/stats — Статистика привычки
router.get('/:id/stats', (req, res) => {
  const habitId = parseInt(req.params.id);
  const userId = req.user.id;

  const totalCompletions = db.prepare(
    'SELECT COUNT(*) as count FROM completions WHERE habit_id = ? AND user_id = ?'
  ).get(habitId, userId);

  const streak = calculateStreak(habitId, userId);

  res.json({
    totalCompletions: totalCompletions.count,
    currentStreak: streak
  });
});

/**
 * Подсчёт текущей серии (streak)
 */
function calculateStreak(habitId, userId) {
  const completions = db.prepare(`
    SELECT date FROM completions
    WHERE habit_id = ? AND user_id = ?
    ORDER BY date DESC
    LIMIT 90
  `).all(habitId, userId).map(r => r.date);

  if (completions.length === 0) return 0;

  let streak = 0;
  const now = new Date();

  for (let i = 0; i < 90; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    if (completions.includes(dateStr)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  return streak;
}

module.exports = router;
