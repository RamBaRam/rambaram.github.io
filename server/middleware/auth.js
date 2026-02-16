const crypto = require('crypto');
const db = require('../db/init');

const BOT_TOKEN = process.env.BOT_TOKEN || '';

/**
 * Валидация Telegram initData по HMAC-SHA256
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateInitData(initData) {
    if (!initData || !BOT_TOKEN) return null;

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    // Собираем data_check_string (все параметры кроме hash, отсортированные)
    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => `${key}=${val}`)
        .join('\n');

    // Вычисляем секретный ключ
    const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(BOT_TOKEN)
        .digest();

    // Проверяем подпись
    const calculatedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    if (calculatedHash !== hash) return null;

    // Извлекаем данные пользователя
    const userStr = params.get('user');
    if (!userStr) return null;

    try {
        return JSON.parse(userStr);
    } catch {
        return null;
    }
}

/**
 * Express middleware для аутентификации
 */
function authMiddleware(req, res, next) {
    const initData = req.headers['x-telegram-init-data'];

    // Режим разработки — без токена
    if (!BOT_TOKEN) {
        const devId = req.headers['x-dev-user-id'];
        const userId = parseInt(devId) || 12345678;
        console.log(`[Auth] Dev mode: user_id=${userId}, header=${devId}`);
        req.user = {
            id: userId,
            first_name: 'Dev',
            last_name: 'User',
            username: 'dev_user'
        };
        ensureUser(req.user);
        return next();
    }

    const user = validateInitData(initData);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    ensureUser(user);
    req.user = user;
    next();
}

/**
 * Создаёт или обновляет пользователя в БД
 */
function ensureUser(user) {
    db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, username)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      username = excluded.username
  `).run(user.id, user.first_name || '', user.last_name || '', user.username || '');
}

module.exports = { authMiddleware, validateInitData };
