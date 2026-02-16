/* ═══════════════════════════════════════════════════════════
   Habits Manager — Data & Logic
   ═══════════════════════════════════════════════════════════ */

const HabitsManager = (() => {
    const STORAGE_KEY = 'habit_tracker_data';

    const HABIT_ICONS = ['🏃', '📚', '💧', '🧘', '✍️', '🎸', '💪', '🥗', '😴', '🧹', '💻', '🎨'];

    const DEFAULT_DATA = {
        habits: [],
        friends: [
            {
                id: 'friend_1', name: 'Анна', initials: 'АН',
                habits: [
                    { id: 'fh_1', name: 'Утренняя зарядка', icon: '💪', ownerId: 'friend_1', ownerName: 'Анна', isPublic: true, frequency: 'daily', subscribers: [], completions: {}, createdAt: '2026-02-01T08:00:00Z' },
                    { id: 'fh_2', name: 'Чтение 30 минут', icon: '📚', ownerId: 'friend_1', ownerName: 'Анна', isPublic: true, frequency: 'daily', subscribers: [], completions: {}, createdAt: '2026-02-05T08:00:00Z' }
                ]
            },
            {
                id: 'friend_2', name: 'Максим', initials: 'МК',
                habits: [
                    { id: 'fh_3', name: 'Бег 5 км', icon: '🏃', ownerId: 'friend_2', ownerName: 'Максим', isPublic: true, frequency: 'daily', subscribers: [], completions: {}, createdAt: '2026-01-15T08:00:00Z' }
                ]
            },
            {
                id: 'friend_3', name: 'Катя', initials: 'КТ',
                habits: [
                    { id: 'fh_4', name: 'Медитация', icon: '🧘', ownerId: 'friend_3', ownerName: 'Катя', isPublic: true, frequency: 'daily', subscribers: [], completions: {}, createdAt: '2026-02-10T08:00:00Z' }
                ]
            }
        ]
    };

    let data = null;

    function init() {
        load();
        generateDemoCompletions();
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            data = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_DATA));
        } catch {
            data = JSON.parse(JSON.stringify(DEFAULT_DATA));
        }
    }

    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
        catch (e) { console.error('Failed to save data', e); }
    }

    function generateDemoCompletions() {
        const today = new Date();
        data.friends.forEach(friend => {
            friend.habits.forEach(habit => {
                if (Object.keys(habit.completions).length > 0) return;
                for (let i = 0; i < 30; i++) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - i);
                    const key = dateKey(d);
                    if (Math.random() > 0.35) {
                        habit.completions[key] = [habit.ownerId];
                    }
                }
            });
        });
        save();
    }

    // ── Helpers ──

    function generateId() {
        return 'h_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    }

    function dateKey(date) {
        const d = date instanceof Date ? date : new Date(date);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function todayKey() { return dateKey(new Date()); }

    // ── Habit CRUD ──

    function createHabit({ name, description, icon, frequency, isPublic }) {
        const habit = {
            id: generateId(),
            name,
            description: description || '',
            icon: icon || '⭐',
            ownerId: TelegramApp.getUserId(),
            ownerName: TelegramApp.getUserName(),
            isPublic: !!isPublic,
            frequency: frequency || 'daily',
            subscribers: [],
            completions: {},
            createdAt: new Date().toISOString()
        };
        data.habits.push(habit);
        save();
        return habit;
    }

    function deleteHabit(habitId) {
        data.habits = data.habits.filter(h => h.id !== habitId);
        save();
    }

    function getMyHabits() {
        const userId = TelegramApp.getUserId();
        return data.habits.filter(h => h.ownerId === userId);
    }

    function getSubscribedHabits() {
        const userId = TelegramApp.getUserId();
        const subscribed = [];
        data.friends.forEach(friend => {
            friend.habits.forEach(habit => {
                if (habit.subscribers.includes(userId)) {
                    subscribed.push({ ...habit, friendName: friend.name, friendInitials: friend.initials });
                }
            });
        });
        return subscribed;
    }

    function getAllMyHabits() {
        return [...getMyHabits(), ...getSubscribedHabits()];
    }

    // ── Completions ──

    function findHabit(habitId) {
        let habit = data.habits.find(h => h.id === habitId);
        if (!habit) {
            for (const friend of data.friends) {
                habit = friend.habits.find(h => h.id === habitId);
                if (habit) break;
            }
        }
        return habit;
    }

    function toggleCompletion(habitId, date) {
        const key = date ? dateKey(date) : todayKey();
        const userId = TelegramApp.getUserId();
        const habit = findHabit(habitId);
        if (!habit) return false;

        if (!habit.completions[key]) habit.completions[key] = [];

        const idx = habit.completions[key].indexOf(userId);
        if (idx === -1) {
            habit.completions[key].push(userId);
        } else {
            habit.completions[key].splice(idx, 1);
        }
        save();
        return idx === -1;
    }

    function isCompletedToday(habitId) {
        return isCompletedOnDate(habitId, new Date());
    }

    function isCompletedOnDate(habitId, date) {
        const key = dateKey(date);
        const userId = TelegramApp.getUserId();
        const habit = findHabit(habitId);
        if (!habit) return false;
        return habit.completions[key]?.includes(userId) || false;
    }

    function getCompletionsForMonth(habitId, year, month) {
        const habit = findHabit(habitId);
        if (!habit) return {};
        const prefix = year + '-' + String(month + 1).padStart(2, '0');
        const result = {};
        Object.keys(habit.completions).forEach(key => {
            if (key.startsWith(prefix)) result[key] = habit.completions[key];
        });
        return result;
    }

    // ── Streaks ──

    function getStreak(habitId) {
        const userId = TelegramApp.getUserId();
        const habit = findHabit(habitId);
        if (!habit) return 0;

        let streak = 0;
        const today = new Date();
        for (let i = 0; i < 365; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const key = dateKey(d);
            if (habit.completions[key]?.includes(userId)) {
                streak++;
            } else if (i > 0) {
                break;
            }
        }
        return streak;
    }

    // ── Social / Friends ──

    function getFriends() { return data.friends; }

    function subscribeToHabit(friendId, habitId) {
        const userId = TelegramApp.getUserId();
        const friend = data.friends.find(f => f.id === friendId);
        if (!friend) return false;
        const habit = friend.habits.find(h => h.id === habitId);
        if (!habit) return false;
        if (!habit.subscribers.includes(userId)) {
            habit.subscribers.push(userId);
            save();
            return true;
        }
        return false;
    }

    function unsubscribeFromHabit(habitId) {
        const userId = TelegramApp.getUserId();
        for (const friend of data.friends) {
            const habit = friend.habits.find(h => h.id === habitId);
            if (habit) {
                habit.subscribers = habit.subscribers.filter(id => id !== userId);
                save();
                return true;
            }
        }
        return false;
    }

    function isSubscribed(habitId) {
        const userId = TelegramApp.getUserId();
        for (const friend of data.friends) {
            const habit = friend.habits.find(h => h.id === habitId);
            if (habit && habit.subscribers.includes(userId)) return true;
        }
        return false;
    }

    function getFriendCompletionsForDate(habitId, date) {
        const key = dateKey(date);
        let habit = null;
        let ownerFriend = null;

        for (const friend of data.friends) {
            const h = friend.habits.find(h => h.id === habitId);
            if (h) { habit = h; ownerFriend = friend; break; }
        }

        if (!habit || !habit.completions[key]) return [];

        return habit.completions[key]
            .filter(id => id !== TelegramApp.getUserId())
            .map(id => {
                if (id === habit.ownerId) return { id, name: ownerFriend.name, initials: ownerFriend.initials };
                return { id, name: 'Участник', initials: '?' };
            });
    }

    // ── Stats ──

    function getStats() {
        const allHabits = getAllMyHabits();
        const today = todayKey();
        const userId = TelegramApp.getUserId();

        let completedToday = 0;
        let maxStreak = 0;

        allHabits.forEach(habit => {
            if (habit.completions[today]?.includes(userId)) completedToday++;
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

    return {
        HABIT_ICONS, init, createHabit, deleteHabit,
        getMyHabits, getSubscribedHabits, getAllMyHabits,
        toggleCompletion, isCompletedToday, isCompletedOnDate,
        getCompletionsForMonth, getStreak,
        getFriends, subscribeToHabit, unsubscribeFromHabit, isSubscribed,
        getFriendCompletionsForDate, getStats, dateKey, todayKey
    };
})();
