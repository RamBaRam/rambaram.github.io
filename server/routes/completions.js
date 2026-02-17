const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');

// POST /api/completions — Отметить/снять выполнение
router.post('/', async (req, res) => {
    const { habit_id } = req.body;
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    if (!habit_id) {
        return res.status(400).json({ error: 'habit_id обязателен' });
    }

    // Проверяем доступ: привычка моя или я подписан
    const { rows: accessRows } = await pool.query(`
    SELECT 1 FROM habits WHERE id = $1 AND owner_id = $2
    UNION
    SELECT 1 FROM subscriptions WHERE habit_id = $1 AND user_id = $2
  `, [habit_id, userId]);

    if (accessRows.length === 0) {
        return res.status(403).json({ error: 'Нет доступа к привычке' });
    }

    // Toggle: если уже выполнена — снять, иначе — отметить
    const { rows: existing } = await pool.query(
        'SELECT id FROM completions WHERE habit_id = $1 AND user_id = $2 AND date = $3',
        [habit_id, userId, today]
    );

    if (existing.length > 0) {
        await pool.query('DELETE FROM completions WHERE id = $1', [existing[0].id]);
    } else {
        await pool.query(
            'INSERT INTO completions (habit_id, user_id, date) VALUES ($1, $2, $3)',
            [habit_id, userId, today]
        );
    }

    // Пересчитываем серию после изменения
    const streak = await calculateStreak(habit_id, userId);
    res.json({ completed: existing.length === 0, date: today, streak });
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

// GET /api/completions/:habitId — Выполнения за месяц
router.get('/:habitId', async (req, res) => {
    const habitId = parseInt(req.params.habitId);
    const month = req.query.month; // формат: 'YYYY-MM'
    const userId = req.user.id;

    let dateFilter = '';
    const myParams = [habitId, userId];
    const friendParams = [habitId, userId];

    if (month) {
        dateFilter = `AND date LIKE $3 || '%'`;
        myParams.push(month);
        friendParams.push(month);
    }

    // Мои выполнения
    const { rows: myRows } = await pool.query(`
    SELECT date FROM completions
    WHERE habit_id = $1 AND user_id = $2 ${dateFilter}
    ORDER BY date
  `, myParams);
    const myCompletions = myRows.map(r => r.date);

    // Выполнения друзей (для общих привычек)
    const { rows: friendCompletions } = await pool.query(`
    SELECT c.date, u.first_name, u.telegram_id
    FROM completions c
    JOIN users u ON c.user_id = u.telegram_id
    WHERE c.habit_id = $1 AND c.user_id != $2 ${dateFilter}
    ORDER BY c.date
  `, friendParams);

    res.json({
        my: myCompletions,
        friends: friendCompletions
    });
});

module.exports = router;
