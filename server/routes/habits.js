const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');

// GET /api/habits — Мои привычки + подписки
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    // Мои привычки
    const { rows: myHabits } = await pool.query(`
      SELECT h.*,
        (SELECT COUNT(*) FROM subscriptions WHERE habit_id = h.id) as subscriber_count
      FROM habits h
      WHERE h.owner_id = $1
      ORDER BY h.created_at DESC
    `, [userId]);

    // Подписки
    const { rows: subscribed } = await pool.query(`
      SELECT h.*, u.first_name as owner_name, u.username as owner_username,
        (SELECT COUNT(*) FROM subscriptions WHERE habit_id = h.id) as subscriber_count
      FROM subscriptions s
      JOIN habits h ON s.habit_id = h.id
      JOIN users u ON h.owner_id = u.telegram_id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
    `, [userId]);

    // Выполнения за сегодня
    const today = new Date().toISOString().split('T')[0];
    const { rows: todayRows } = await pool.query(`
      SELECT habit_id FROM completions
      WHERE user_id = $1 AND date = $2
    `, [userId, today]);
    const todayCompletions = todayRows.map(r => r.habit_id);

    // Серии для каждой привычки
    const addStreaks = async (habits) => {
      const result = [];
      for (const h of habits) {
        const streak = await calculateStreak(h.id, userId);
        result.push({
          ...h,
          streak,
          completedToday: todayCompletions.includes(h.id)
        });
      }
      return result;
    };

    res.json({
      my: await addStreaks(myHabits),
      subscribed: await addStreaks(subscribed)
    });
  } catch (e) {
    console.error('GET /api/habits error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/habits — Создать привычку
router.post('/', async (req, res) => {
  const { name, description, icon, frequency, is_public } = req.body;
  const userId = req.user.id;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название обязательно' });
  }

  const { rows } = await pool.query(`
    INSERT INTO habits (owner_id, name, description, icon, frequency, is_public)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [userId, name.trim(), description || '', icon || '⭐', frequency || 'daily', is_public ? 1 : 0]);

  res.status(201).json(rows[0]);
});

// DELETE /api/habits/:id — Удалить привычку
router.delete('/:id', async (req, res) => {
  const habitId = parseInt(req.params.id);
  const userId = req.user.id;

  const { rows } = await pool.query(
    'SELECT * FROM habits WHERE id = $1 AND owner_id = $2', [habitId, userId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Привычка не найдена' });
  }

  await pool.query('DELETE FROM habits WHERE id = $1', [habitId]);
  res.json({ success: true });
});

// GET /api/habits/:id/stats — Статистика привычки
router.get('/:id/stats', async (req, res) => {
  const habitId = parseInt(req.params.id);
  const userId = req.user.id;

  const { rows } = await pool.query(
    'SELECT COUNT(*) as count FROM completions WHERE habit_id = $1 AND user_id = $2',
    [habitId, userId]
  );

  const streak = await calculateStreak(habitId, userId);

  res.json({
    totalCompletions: parseInt(rows[0].count),
    currentStreak: streak
  });
});

/**
 * Подсчёт текущей серии (streak)
 */
async function calculateStreak(habitId, userId) {
  const { rows } = await pool.query(`
    SELECT date FROM completions
    WHERE habit_id = $1 AND user_id = $2
    ORDER BY date DESC
    LIMIT 90
  `, [habitId, userId]);

  const completions = rows.map(r => r.date);
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
