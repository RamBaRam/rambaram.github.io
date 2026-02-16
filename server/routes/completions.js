const express = require('express');
const router = express.Router();
const db = require('../db/init');

// POST /api/completions — Отметить/снять выполнение
router.post('/', (req, res) => {
    const { habit_id } = req.body;
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    if (!habit_id) {
        return res.status(400).json({ error: 'habit_id обязателен' });
    }

    // Проверяем доступ: привычка моя или я подписан
    const hasAccess = db.prepare(`
    SELECT 1 FROM habits WHERE id = ? AND owner_id = ?
    UNION
    SELECT 1 FROM subscriptions WHERE habit_id = ? AND user_id = ?
  `).get(habit_id, userId, habit_id, userId);

    if (!hasAccess) {
        return res.status(403).json({ error: 'Нет доступа к привычке' });
    }

    // Toggle: если уже выполнена — снять, иначе — отметить
    const existing = db.prepare(
        'SELECT id FROM completions WHERE habit_id = ? AND user_id = ? AND date = ?'
    ).get(habit_id, userId, today);

    if (existing) {
        db.prepare('DELETE FROM completions WHERE id = ?').run(existing.id);
    } else {
        db.prepare(
            'INSERT INTO completions (habit_id, user_id, date) VALUES (?, ?, ?)'
        ).run(habit_id, userId, today);
    }

    // Пересчитываем серию после изменения
    const streak = calculateStreak(habit_id, userId);
    res.json({ completed: !existing, date: today, streak });
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

// GET /api/completions/:habitId — Выполнения за месяц
router.get('/:habitId', (req, res) => {
    const habitId = parseInt(req.params.habitId);
    const month = req.query.month; // формат: 'YYYY-MM'
    const userId = req.user.id;

    let dateFilter = '';
    let params = [habitId];

    if (month) {
        dateFilter = "AND date LIKE ? || '%'";
        params.push(month);
    }

    // Мои выполнения
    const myCompletions = db.prepare(`
    SELECT date FROM completions
    WHERE habit_id = ? AND user_id = ? ${dateFilter}
    ORDER BY date
  `).all(...[habitId, userId, ...(month ? [month] : [])]).map(r => r.date);

    // Выполнения друзей (для общих привычек)
    const friendCompletions = db.prepare(`
    SELECT c.date, u.first_name, u.telegram_id
    FROM completions c
    JOIN users u ON c.user_id = u.telegram_id
    WHERE c.habit_id = ? AND c.user_id != ? ${dateFilter}
    ORDER BY c.date
  `).all(...[habitId, userId, ...(month ? [month] : [])]);

    res.json({
        my: myCompletions,
        friends: friendCompletions
    });
});

module.exports = router;
