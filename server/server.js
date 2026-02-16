const express = require('express');
const cors = require('cors');
const path = require('path');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — разрешаем фронтенд
app.use(cors({
    origin: [
        'https://rambaram.github.io',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:8080'
    ],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data', 'X-Dev-User-Id']
}));

app.use(express.json());

// Раздача фронтенда (index.html, css/, js/)
app.use(express.static(path.join(__dirname, '..')));

// Health check (без авторизации)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Публичные роуты (без авторизации)
app.use('/api/invite', require('./routes/invite'));

// Все остальные API-роуты требуют аутентификации
app.use('/api', authMiddleware);

// Роуты (защищённые)
app.use('/api/habits', require('./routes/habits'));
app.use('/api/completions', require('./routes/completions'));
app.use('/api/friends', require('./routes/friends'));

// Запуск
app.listen(PORT, () => {
    console.log(`🚀 Habit Tracker API running on port ${PORT}`);
    console.log(`   App: http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    if (!process.env.BOT_TOKEN) {
        console.log('   ⚠️  BOT_TOKEN not set — running in dev mode');
    }
});
