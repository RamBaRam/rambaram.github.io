const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/friends — Список пользователей с публичными привычками
router.get('/', (req, res) => {
    const userId = req.user.id;

    // Все пользователи с публичными привычками (кроме текущего)
    const friends = db.prepare(`
    SELECT DISTINCT u.telegram_id as id, u.first_name, u.last_name, u.username
    FROM users u
    JOIN habits h ON h.owner_id = u.telegram_id AND h.is_public = 1
    WHERE u.telegram_id != ?
    ORDER BY u.first_name
  `).all(userId);

    // Добавляем количество привычек и инициалы
    const result = friends.map(f => {
        const habitCount = db.prepare(
            'SELECT COUNT(*) as count FROM habits WHERE owner_id = ? AND is_public = 1'
        ).get(f.id).count;

        const initials = ((f.first_name || '')[0] || '') + ((f.last_name || '')[0] || '');

        return {
            ...f,
            initials: initials.toUpperCase() || '?',
            habitCount
        };
    });

    res.json(result);
});

// GET /api/friends/:id/habits — Привычки друга
router.get('/:id/habits', (req, res) => {
    const friendId = parseInt(req.params.id);
    const userId = req.user.id;

    const friend = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(friendId);
    if (!friend) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const habits = db.prepare(`
    SELECT h.*,
      (SELECT COUNT(*) FROM subscriptions WHERE habit_id = h.id) as subscriber_count,
      (SELECT 1 FROM subscriptions WHERE habit_id = h.id AND user_id = ?) as is_subscribed
    FROM habits h
    WHERE h.owner_id = ? AND h.is_public = 1
    ORDER BY h.created_at DESC
  `).all(userId, friendId);

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
router.post('/subscribe/:habitId', (req, res) => {
    const habitId = parseInt(req.params.habitId);
    const userId = req.user.id;

    const habit = db.prepare(
        'SELECT * FROM habits WHERE id = ? AND is_public = 1'
    ).get(habitId);

    if (!habit) {
        return res.status(404).json({ error: 'Привычка не найдена' });
    }

    if (habit.owner_id === userId) {
        return res.status(400).json({ error: 'Нельзя подписаться на свою привычку' });
    }

    try {
        db.prepare(
            'INSERT INTO subscriptions (user_id, habit_id) VALUES (?, ?)'
        ).run(userId, habitId);
    } catch (e) {
        // Уже подписан — не ошибка
    }

    const count = db.prepare(
        'SELECT COUNT(*) as count FROM subscriptions WHERE habit_id = ?'
    ).get(habitId).count;

    res.json({ subscribed: true, subscriber_count: count });
});

// DELETE /api/friends/subscribe/:habitId — Отписаться
router.delete('/subscribe/:habitId', (req, res) => {
    const habitId = parseInt(req.params.habitId);
    const userId = req.user.id;

    db.prepare(
        'DELETE FROM subscriptions WHERE user_id = ? AND habit_id = ?'
    ).run(userId, habitId);

    const count = db.prepare(
        'SELECT COUNT(*) as count FROM subscriptions WHERE habit_id = ?'
    ).get(habitId).count;

    res.json({ subscribed: false, subscriber_count: count });
});

module.exports = router;
