const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');

// GET /api/notifications — Получить настройки уведомлений
router.get('/', async (req, res) => {
    const userId = req.user.id;

    const { rows } = await pool.query(
        'SELECT * FROM notification_settings WHERE telegram_id = $1',
        [userId]
    );

    if (rows.length === 0) {
        // Возвращаем дефолтные настройки
        return res.json({
            enabled: true,
            remind_time: 20,
            timezone_offset: 180
        });
    }

    res.json({
        enabled: rows[0].enabled,
        remind_time: rows[0].remind_time,
        timezone_offset: rows[0].timezone_offset
    });
});

// POST /api/notifications — Обновить настройки уведомлений
router.post('/', async (req, res) => {
    const userId = req.user.id;
    const { enabled, remind_time, timezone_offset } = req.body;

    const enabledVal = enabled !== undefined ? enabled : true;
    const timeVal = remind_time !== undefined ? Math.min(23, Math.max(0, parseInt(remind_time))) : 20;
    const tzVal = timezone_offset !== undefined ? parseInt(timezone_offset) : 180;

    await pool.query(`
    INSERT INTO notification_settings (telegram_id, enabled, remind_time, timezone_offset, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (telegram_id) DO UPDATE SET
      enabled = $2,
      remind_time = $3,
      timezone_offset = $4,
      updated_at = NOW()
  `, [userId, enabledVal, timeVal, tzVal]);

    res.json({
        enabled: enabledVal,
        remind_time: timeVal,
        timezone_offset: tzVal
    });
});

module.exports = router;
