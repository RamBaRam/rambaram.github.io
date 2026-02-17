const { pool } = require('../db/init');
const cron = require('node-cron');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const BOT_USERNAME = process.env.BOT_USERNAME || 'betaHabitsBot';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Отправка сообщения через Telegram Bot API
 */
async function sendMessage(chatId, text, replyMarkup = null) {
    try {
        const body = {
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
        };

        if (replyMarkup) {
            body.reply_markup = JSON.stringify(replyMarkup);
        }

        const res = await fetch(TELEGRAM_API + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!data.ok) {
            console.error(`[Notifier] Failed to send to ${chatId}:`, data.description);
        }
        return data;
    } catch (e) {
        console.error(`[Notifier] Error sending to ${chatId}:`, e.message);
    }
}

/**
 * Проверяет невыполненные привычки и отправляет напоминание
 */
async function checkAndNotify() {
    if (!BOT_TOKEN) {
        return; // Без токена не отправляем
    }

    const now = new Date();
    const currentUTCHour = now.getUTCHours();

    try {
        // Находим пользователей, у которых сейчас время напоминания
        // remind_time хранится в локальном часе пользователя
        // timezone_offset хранится в минутах (например, 180 для UTC+3)
        const { rows: users } = await pool.query(`
      SELECT ns.telegram_id, ns.remind_time, ns.timezone_offset, u.first_name
      FROM notification_settings ns
      JOIN users u ON ns.telegram_id = u.telegram_id
      WHERE ns.enabled = true
    `);

        const today = now.toISOString().split('T')[0];

        for (const user of users) {
            // Проверяем, совпадает ли текущий UTC-час с локальным часом пользователя
            const userLocalHour = (currentUTCHour + Math.floor(user.timezone_offset / 60) + 24) % 24;

            if (userLocalHour !== user.remind_time) continue;

            // Получаем невыполненные привычки
            const { rows: habits } = await pool.query(`
        SELECT h.id, h.name, h.icon FROM habits h
        LEFT JOIN completions c
          ON c.habit_id = h.id AND c.user_id = $1 AND c.date = $2
        WHERE h.owner_id = $1 AND c.id IS NULL

        UNION

        SELECT h.id, h.name, h.icon FROM habits h
        JOIN subscriptions s ON s.habit_id = h.id AND s.user_id = $1
        LEFT JOIN completions c
          ON c.habit_id = h.id AND c.user_id = $1 AND c.date = $2
        WHERE c.id IS NULL
      `, [user.telegram_id, today]);

            if (habits.length === 0) continue;

            // Формируем сообщение
            const habitList = habits.map(h => `  ${h.icon} ${h.name}`).join('\n');
            const text = `⏰ <b>Напоминание о привычках!</b>\n\nСегодня ещё не выполнено:\n${habitList}`;

            // Кнопка для открытия Mini App
            const replyMarkup = {
                inline_keyboard: [[
                    {
                        text: '📱 Открыть трекер',
                        web_app: { url: 'https://rambaram.github.io' }
                    }
                ]]
            };

            await sendMessage(user.telegram_id, text, replyMarkup);
            console.log(`[Notifier] Sent reminder to ${user.first_name} (${user.telegram_id}): ${habits.length} habits`);
        }
    } catch (e) {
        console.error('[Notifier] Error:', e.message);
    }
}

/**
 * Запуск cron-задачи — проверка каждый час в :00
 */
function startNotifier() {
    if (!BOT_TOKEN) {
        console.log('   ⚠️  Notifier disabled (no BOT_TOKEN)');
        return;
    }

    // Каждый час в 0 минут
    cron.schedule('0 * * * *', () => {
        console.log(`[Notifier] Running hourly check at ${new Date().toISOString()}`);
        checkAndNotify();
    });

    console.log('   🔔 Notifier started (hourly checks)');
}

module.exports = { startNotifier, checkAndNotify };
