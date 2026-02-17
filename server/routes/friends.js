const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');

// GET /api/friends — Список пользователей с публичными привычками
router.get('/', async (req, res) => {
    const userId = req.user.id;

    // Все пользователи с публичными привычками (кроме текущего)
    const { rows: friends } = await pool.query(`
    SELECT DISTINCT u.telegram_id as id, u.first_name, u.last_name, u.username
    FROM users u
    JOIN habits h ON h.owner_id = u.telegram_id AND h.is_public = 1
    WHERE u.telegram_id != $1
    ORDER BY u.first_name
  `, [userId]);

    // Добавляем количество привычек и инициалы
    const result = [];
    for (const f of friends) {
        const { rows: countRows } = await pool.query(
            'SELECT COUNT(*) as count FROM habits WHERE owner_id = $1 AND is_public = 1',
            [f.id]
        );
        const habitCount = parseInt(countRows[0].count);
        const initials = ((f.first_name || '')[0] || '') + ((f.last_name || '')[0] || '');

        result.push({
            ...f,
            initials: initials.toUpperCase() || '?',
            habitCount
        });
    }

    res.json(result);
});

// GET /api/friends/:id/habits — Привычки друга
router.get('/:id/habits', async (req, res) => {
    const friendId = parseInt(req.params.id);
    const userId = req.user.id;

    const { rows: friendRows } = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1', [friendId]
    );

    if (friendRows.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const friend = friendRows[0];

    const { rows: habits } = await pool.query(`
    SELECT h.*,
      (SELECT COUNT(*) FROM subscriptions WHERE habit_id = h.id) as subscriber_count,
      (SELECT 1 FROM subscriptions WHERE habit_id = h.id AND user_id = $1) as is_subscribed
    FROM habits h
    WHERE h.owner_id = $2 AND h.is_public = 1
    ORDER BY h.created_at DESC
  `, [userId, friendId]);

    res.json({
        friend: {
            id: friend.telegram_id,
            first_name: friend.first_name,
            last_name: friend.last_name,
            username: friend.username,
            initials: ((friend.first_name || '')[0] + (friend.last_name || '')[0]).toUpperCase()
        },
        habits: habits.map(h => ({
            ...h,
            is_subscribed: !!h.is_subscribed
        }))
    });
});

// POST /api/friends/subscribe/:habitId — Подписаться
router.post('/subscribe/:habitId', async (req, res) => {
    const habitId = parseInt(req.params.habitId);
    const userId = req.user.id;

    const { rows } = await pool.query(
        'SELECT * FROM habits WHERE id = $1 AND is_public = 1', [habitId]
    );

    if (rows.length === 0) {
        return res.status(404).json({ error: 'Привычка не найдена' });
    }

    if (rows[0].owner_id === userId) {
        return res.status(400).json({ error: 'Нельзя подписаться на свою привычку' });
    }

    try {
        await pool.query(
            'INSERT INTO subscriptions (user_id, habit_id) VALUES ($1, $2)',
            [userId, habitId]
        );
    } catch (e) {
        // Уже подписан — не ошибка
    }

    const { rows: countRows } = await pool.query(
        'SELECT COUNT(*) as count FROM subscriptions WHERE habit_id = $1',
        [habitId]
    );

    res.json({ subscribed: true, subscriber_count: parseInt(countRows[0].count) });
});

// DELETE /api/friends/subscribe/:habitId — Отписаться
router.delete('/subscribe/:habitId', async (req, res) => {
    const habitId = parseInt(req.params.habitId);
    const userId = req.user.id;

    await pool.query(
        'DELETE FROM subscriptions WHERE user_id = $1 AND habit_id = $2',
        [userId, habitId]
    );

    const { rows: countRows } = await pool.query(
        'SELECT COUNT(*) as count FROM subscriptions WHERE habit_id = $1',
        [habitId]
    );

    res.json({ subscribed: false, subscriber_count: parseInt(countRows[0].count) });
});

module.exports = router;
