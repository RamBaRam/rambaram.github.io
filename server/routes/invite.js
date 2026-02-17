const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');

// GET /api/invite/:habitId — Публичная информация о привычке для приглашения
// Этот роут НЕ требует авторизации
router.get('/:habitId', async (req, res) => {
  const habitId = parseInt(req.params.habitId);

  const { rows } = await pool.query(`
    SELECT h.id, h.name, h.icon, h.frequency, h.description,
      u.first_name as owner_name, u.telegram_id as owner_id,
      (SELECT COUNT(*) FROM subscriptions WHERE habit_id = h.id) as subscriber_count
    FROM habits h
    JOIN users u ON h.owner_id = u.telegram_id
    WHERE h.id = $1 AND h.is_public = 1
  `, [habitId]);

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Привычка не найдена или не публичная' });
  }

  const habit = rows[0];
  res.json({
    id: habit.id,
    name: habit.name,
    icon: habit.icon,
    frequency: habit.frequency,
    description: habit.description,
    owner_name: habit.owner_name,
    owner_id: habit.owner_id,
    subscriber_count: parseInt(habit.subscriber_count)
  });
});

module.exports = router;
