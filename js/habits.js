/* ═══════════════════════════════════════════════════════════
   Habits Manager — API Client + Local Cache
   ═══════════════════════════════════════════════════════════ */

const HabitsManager = (() => {
    // ⚠️ Замените на URL вашего backend после деплоя
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000/api'
        : 'https://rambaramgithubio-production.up.railway.app/api';

    const CACHE_KEY = 'habit_tracker_cache';
    const HABIT_ICONS = ['🏃', '📚', '💧', '🧘', '✍️', '🎸', '💪', '🥗', '😴', '🧹', '💻', '🎨'];

    // Кэшированные данные
    let cache = {
        habits: { my: [], subscribed: [] },
        friends: [],
        completions: {},   // { habitId: { my: ['2026-02-14'], friends: [] } }
        lastSync: null
    };

    let isOnline = true;

    // ── API helpers ──

    async function apiFetch(path, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': TelegramApp.getInitData(),
            ...options.headers
        };

        // Dev mode: добавляем user id
        if (!TelegramApp.getInitData()) {
            headers['X-Dev-User-Id'] = String(TelegramApp.getUserId());
        }

        try {
            const res = await fetch(API_URL + path, { ...options, headers });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Network error' }));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
            isOnline = true;
            return await res.json();
        } catch (e) {
            console.warn('API error:', e.message);
            isOnline = false;
            throw e;
        }
    }

    // ── Init ──

    async function init() {
        loadCache();
        try {
            await syncFromServer();
        } catch {
            console.log('Using cached data (offline)');
        }
    }

    function loadCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) cache = JSON.parse(raw);
        } catch { /* ignore */ }
    }

    function saveCache() {
        try {
            cache.lastSync = new Date().toISOString();
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch (e) { console.error('Cache save failed', e); }
    }

    // ── Sync ──

    async function syncFromServer() {
        const data = await apiFetch('/habits');
        cache.habits = data;

        // Загружаем выполнения за текущий месяц для всех привычек
        const allHabits = [...data.my, ...data.subscribed];
        const now = new Date();
        const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

        const completionPromises = allHabits.map(h =>
            apiFetch(`/completions/${h.id}?month=${month}`)
                .then(c => ({ habitId: h.id, data: c }))
                .catch(() => null)
        );

        const results = await Promise.all(completionPromises);
        results.forEach(r => {
            if (r) cache.completions[r.habitId] = r.data;
        });

        saveCache();
    }

    // ── Habit CRUD ──

    async function createHabit({ name, description, icon, frequency, isPublic }) {
        try {
            const habit = await apiFetch('/habits', {
                method: 'POST',
                body: JSON.stringify({
                    name, description, icon, frequency,
                    is_public: isPublic
                })
            });
            // Обновляем кэш
            cache.habits.my.unshift({
                ...habit,
                streak: 0,
                completedToday: false,
                subscriber_count: 0
            });
            saveCache();
            return habit;
        } catch (e) {
            console.error('Create habit failed:', e);
            throw e;
        }
    }

    async function deleteHabit(habitId) {
        try {
            await apiFetch(`/habits/${habitId}`, { method: 'DELETE' });
            cache.habits.my = cache.habits.my.filter(h => h.id !== habitId);
            saveCache();
        } catch (e) {
            console.error('Delete habit failed:', e);
        }
    }

    function getMyHabits() {
        return cache.habits.my || [];
    }

    function getSubscribedHabits() {
        return (cache.habits.subscribed || []).map(h => ({
            ...h,
            friendName: h.owner_name,
            ownerName: h.owner_name
        }));
    }

    function getAllMyHabits() {
        return [...getMyHabits(), ...getSubscribedHabits()];
    }

    // ── Completions ──

    async function toggleCompletion(habitId) {
        try {
            const result = await apiFetch('/completions', {
                method: 'POST',
                body: JSON.stringify({ habit_id: habitId })
            });

            // Обновляем кэш
            const today = todayKey();
            if (!cache.completions[habitId]) {
                cache.completions[habitId] = { my: [], friends: [] };
            }

            if (result.completed) {
                if (!cache.completions[habitId].my.includes(today)) {
                    cache.completions[habitId].my.push(today);
                }
                // Обновляем флаг и серию в списке привычек
                updateHabitInCache(habitId, { completedToday: true, streak: result.streak });
            } else {
                cache.completions[habitId].my = cache.completions[habitId].my.filter(d => d !== today);
                updateHabitInCache(habitId, { completedToday: false, streak: result.streak });
            }
            saveCache();
            return result.completed;
        } catch (e) {
            console.error('Toggle completion failed:', e);
            return false;
        }
    }

    function updateHabitInCache(habitId, updates) {
        const idx = cache.habits.my.findIndex(h => h.id === habitId);
        if (idx !== -1) Object.assign(cache.habits.my[idx], updates);
        const sidx = cache.habits.subscribed.findIndex(h => h.id === habitId);
        if (sidx !== -1) Object.assign(cache.habits.subscribed[sidx], updates);
    }

    function isCompletedToday(habitId) {
        // Проверяем из кэша привычек (приходит с сервера)
        const allHabits = getAllMyHabits();
        const habit = allHabits.find(h => h.id === habitId);
        if (habit && habit.completedToday !== undefined) return habit.completedToday;

        // Если нет — проверяем кэш выполнений
        const today = todayKey();
        return cache.completions[habitId]?.my?.includes(today) || false;
    }

    function isCompletedOnDate(habitId, date) {
        const key = dateKey(date);
        return cache.completions[habitId]?.my?.includes(key) || false;
    }

    function getCompletionsForMonth(habitId, year, month) {
        const prefix = year + '-' + String(month + 1).padStart(2, '0');
        const result = {};
        const userId = TelegramApp.getUserId();
        const myDates = cache.completions[habitId]?.my || [];
        const friendData = cache.completions[habitId]?.friends || [];

        myDates.forEach(d => {
            if (d.startsWith(prefix)) {
                if (!result[d]) result[d] = [];
                result[d].push(userId);
            }
        });

        friendData.forEach(f => {
            if (f.date.startsWith(prefix)) {
                if (!result[f.date]) result[f.date] = [];
                result[f.date].push(f.telegram_id);
            }
        });

        return result;
    }

    // ── Streaks ──

    function getStreak(habitId) {
        const allHabits = getAllMyHabits();
        const habit = allHabits.find(h => h.id === habitId);
        return habit?.streak || 0;
    }

    // ── Social / Friends ──

    async function fetchFriends() {
        try {
            const friends = await apiFetch('/friends');
            cache.friends = friends;
            saveCache();
            return friends;
        } catch {
            return cache.friends || [];
        }
    }

    function getFriends() {
        // Возвращаем кэш, но в формате совместимом с app.js
        return (cache.friends || []).map(f => ({
            ...f,
            habits: [] // Привычки загружаются отдельно
        }));
    }

    async function fetchFriendHabits(friendId) {
        try {
            return await apiFetch(`/friends/${friendId}/habits`);
        } catch {
            return null;
        }
    }

    async function subscribeToHabit(friendId, habitId) {
        try {
            const result = await apiFetch(`/friends/subscribe/${habitId}`, {
                method: 'POST'
            });
            return result;
        } catch (e) {
            console.error('Subscribe failed:', e);
            return null;
        }
    }

    async function unsubscribeFromHabit(habitId) {
        try {
            const result = await apiFetch(`/friends/subscribe/${habitId}`, {
                method: 'DELETE'
            });
            return result;
        } catch (e) {
            console.error('Unsubscribe failed:', e);
            return null;
        }
    }

    function isSubscribed(habitId) {
        return (cache.habits.subscribed || []).some(h => h.id === habitId);
    }

    function getFriendCompletionsForDate(habitId, date) {
        const key = dateKey(date);
        const friendData = cache.completions[habitId]?.friends || [];

        return friendData
            .filter(f => f.date === key)
            .map(f => ({
                id: f.telegram_id,
                name: f.first_name || 'Участник',
                initials: (f.first_name?.[0] || '?').toUpperCase()
            }));
    }

    // ── Stats ──

    function getStats() {
        const allHabits = getAllMyHabits();
        let completedToday = 0;
        let maxStreak = 0;

        allHabits.forEach(habit => {
            if (isCompletedToday(habit.id)) completedToday++;
            const streak = getStreak(habit.id);
            if (streak > maxStreak) maxStreak = streak;
        });

        return {
            total: allHabits.length,
            completed: completedToday,
            maxStreak,
            subscribed: getSubscribedHabits().length
        };
    }

    // ── Helpers ──

    function dateKey(date) {
        const d = date instanceof Date ? date : new Date(date);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function todayKey() { return dateKey(new Date()); }

    return {
        HABIT_ICONS, init, createHabit, deleteHabit,
        getMyHabits, getSubscribedHabits, getAllMyHabits,
        toggleCompletion, isCompletedToday, isCompletedOnDate,
        getCompletionsForMonth, getStreak,
        getFriends, fetchFriends, fetchFriendHabits,
        subscribeToHabit, unsubscribeFromHabit, isSubscribed,
        getFriendCompletionsForDate, getStats, dateKey, todayKey,
        syncFromServer, apiFetch
    };
})();
