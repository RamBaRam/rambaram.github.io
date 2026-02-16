/* ═══════════════════════════════════════════════════════════
   Main App Controller
   ═══════════════════════════════════════════════════════════ */

const HabitApp = (() => {
    let currentView = 'habits';

    function init() {
        TelegramApp.init();
        HabitsManager.init();
        CalendarComponent.init();

        const greeting = document.getElementById('user-greeting');
        if (greeting) greeting.textContent = getGreeting();

        switchView('habits');
    }

    function getGreeting() {
        const hour = new Date().getHours();
        let period = 'Добрый день';
        if (hour < 6) period = 'Доброй ночи';
        else if (hour < 12) period = 'Доброе утро';
        else if (hour >= 18) period = 'Добрый вечер';
        return `${period}, ${TelegramApp.getUserName()}!`;
    }

    // ── Navigation ──

    function switchView(viewName) {
        currentView = viewName;
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });
        document.querySelectorAll('.view').forEach(v => {
            v.classList.toggle('active', v.id === viewName + '-view');
        });

        switch (viewName) {
            case 'habits': renderHabitsView(); break;
            case 'calendar': CalendarComponent.render('calendar-view'); break;
            case 'friends': renderFriendsView(); break;
        }
        TelegramApp.hapticFeedback('selection');
    }

    // ── Habits View ──

    function renderHabitsView() {
        const container = document.getElementById('habits-view');
        if (!container) return;

        const stats = HabitsManager.getStats();
        const myHabits = HabitsManager.getMyHabits();
        const subscribedHabits = HabitsManager.getSubscribedHabits();

        let html = `
      <div class="stats-bar">
        <div class="stat-card">
          <div class="stat-value">${stats.completed}/${stats.total}</div>
          <div class="stat-label">Сегодня</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">🔥 ${stats.maxStreak}</div>
          <div class="stat-label">Макс. серия</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.subscribed}</div>
          <div class="stat-label">Совместные</div>
        </div>
      </div>`;

        if (myHabits.length === 0 && subscribedHabits.length === 0) {
            html += `
        <div class="empty-state">
          <div class="empty-state-icon">🎯</div>
          <div class="empty-state-title">Начните свой путь!</div>
          <div class="empty-state-text">Создайте свою первую привычку, нажав на кнопку «+» внизу</div>
        </div>`;
        }

        if (myHabits.length > 0) {
            html += '<div class="friends-section-title">Мои привычки</div>';
            myHabits.forEach(h => { html += renderHabitCard(h, false); });
        }

        if (subscribedHabits.length > 0) {
            html += '<div class="friends-section-title">Совместные привычки</div>';
            subscribedHabits.forEach(h => { html += renderHabitCard(h, true); });
        }

        container.innerHTML = html;
    }

    function renderHabitCard(habit, isShared) {
        const completed = HabitsManager.isCompletedToday(habit.id);
        const streak = HabitsManager.getStreak(habit.id);

        let sharedBadge = '';
        let friendsSection = '';

        if (isShared) {
            sharedBadge = `<span class="shared-badge">👥 ${habit.friendName || habit.ownerName}</span>`;
            const friendComps = HabitsManager.getFriendCompletionsForDate(habit.id, new Date());
            if (friendComps.length > 0) {
                friendsSection = `
          <div class="habit-friends">
            <div class="avatar-stack">
              ${friendComps.slice(0, 3).map(f => `<div class="avatar">${f.initials}</div>`).join('')}
            </div>
            <span class="friends-label">${friendComps.map(f => f.name).join(', ')} — выполнили сегодня</span>
          </div>`;
            }
        }

        return `
      <div class="habit-card" id="card-${habit.id}">
        <div class="habit-card-header">
          <div class="habit-icon">${habit.icon}</div>
          <div class="habit-info">
            <div class="habit-name">${habit.name}</div>
            <div class="habit-meta">
              ${sharedBadge}
              ${streak > 0 ? `<span class="habit-streak">🔥 ${streak} д.</span>` : ''}
              <span>${habit.frequency === 'daily' ? 'Ежедневно' : 'Еженедельно'}</span>
            </div>
          </div>
          <button class="habit-check-btn ${completed ? 'checked' : ''}" 
            onclick="event.stopPropagation(); HabitApp.toggleHabit('${habit.id}')">
            ${completed ? '✓' : ''}
          </button>
        </div>
        ${friendsSection}
      </div>`;
    }

    function toggleHabit(habitId) {
        const wasCompleted = HabitsManager.toggleCompletion(habitId);
        if (wasCompleted) {
            TelegramApp.hapticFeedback('success');
            showToast('✅ Привычка выполнена!');
        } else {
            TelegramApp.hapticFeedback('impact');
        }
        renderHabitsView();
    }

    // ── Friends View ──

    function renderFriendsView() {
        const container = document.getElementById('friends-view');
        if (!container) return;

        const friends = HabitsManager.getFriends();
        let html = '<div class="friends-section-title">Привычки друзей</div>';

        friends.forEach(friend => {
            html += `
        <div class="friend-card" onclick="HabitApp.showFriendHabits('${friend.id}')">
          <div class="friend-avatar">${friend.initials}</div>
          <div class="friend-info">
            <div class="friend-name">${friend.name}</div>
            <div class="friend-habits-count">${friend.habits.length} ${pluralHabits(friend.habits.length)}</div>
          </div>
        </div>`;
        });

        container.innerHTML = html;
    }

    function showFriendHabits(friendId) {
        const friends = HabitsManager.getFriends();
        const friend = friends.find(f => f.id === friendId);
        if (!friend) return;

        const container = document.getElementById('friends-view');
        let html = `
      <button class="tab-btn" onclick="HabitApp.switchView('friends')" style="margin-bottom: 16px;">◀ Назад</button>
      <div class="friends-section-title">Привычки — ${friend.name}</div>`;

        friend.habits.forEach(habit => {
            const isSubscribed = HabitsManager.isSubscribed(habit.id);
            const streak = HabitsManager.getStreak(habit.id);

            html += `
        <div class="habit-card">
          <div class="habit-card-header">
            <div class="habit-icon">${habit.icon}</div>
            <div class="habit-info">
              <div class="habit-name">${habit.name}</div>
              <div class="habit-meta">
                ${streak > 0 ? `<span class="habit-streak">🔥 ${streak} д.</span>` : ''}
                <span>${habit.frequency === 'daily' ? 'Ежедневно' : 'Еженедельно'}</span>
              </div>
            </div>
            <button class="subscribe-btn ${isSubscribed ? 'subscribed' : ''}"
              onclick="event.stopPropagation(); HabitApp.toggleSubscription('${friend.id}', '${habit.id}')">
              ${isSubscribed ? 'Отписаться' : 'Вступить'}
            </button>
          </div>
          ${habit.subscribers.length > 0 ? `
            <div class="habit-friends">
              <span class="friends-label">👥 ${habit.subscribers.length} ${pluralSubscribers(habit.subscribers.length)}</span>
            </div>` : ''}
        </div>`;
        });

        container.innerHTML = html;
        TelegramApp.hapticFeedback('impact');
    }

    function toggleSubscription(friendId, habitId) {
        const isSubscribed = HabitsManager.isSubscribed(habitId);
        if (isSubscribed) {
            HabitsManager.unsubscribeFromHabit(habitId);
            showToast('Вы отписались от привычки');
        } else {
            HabitsManager.subscribeToHabit(friendId, habitId);
            TelegramApp.hapticFeedback('success');
            showToast('🎉 Вы подписались! Выполняйте вместе');
        }
        showFriendHabits(friendId);
    }

    // ── Modal ──

    function openModal() {
        const modal = document.getElementById('create-modal');
        modal.classList.add('visible');
        TelegramApp.hapticFeedback('impact');

        document.getElementById('habit-name-input').value = '';
        document.getElementById('habit-desc-input').value = '';
        document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('selected'));
        document.querySelector('.icon-option')?.classList.add('selected');
        document.querySelectorAll('.frequency-btn').forEach(el => el.classList.remove('selected'));
        document.querySelector('.frequency-btn[data-freq="daily"]')?.classList.add('selected');
        document.getElementById('public-toggle')?.classList.add('on');
    }

    function closeModal() {
        document.getElementById('create-modal').classList.remove('visible');
    }

    function selectIcon(el) {
        document.querySelectorAll('.icon-option').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        TelegramApp.hapticFeedback('selection');
    }

    function selectFrequency(el) {
        document.querySelectorAll('.frequency-btn').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        TelegramApp.hapticFeedback('selection');
    }

    function togglePublic() {
        document.getElementById('public-toggle').classList.toggle('on');
        TelegramApp.hapticFeedback('selection');
    }

    function createHabit() {
        const name = document.getElementById('habit-name-input').value.trim();
        if (!name) {
            TelegramApp.hapticFeedback('error');
            showToast('⚠️ Введите название привычки');
            return;
        }

        const selectedIcon = document.querySelector('.icon-option.selected');
        const icon = selectedIcon ? selectedIcon.textContent : '⭐';
        const selectedFreq = document.querySelector('.frequency-btn.selected');
        const frequency = selectedFreq ? selectedFreq.dataset.freq : 'daily';
        const description = document.getElementById('habit-desc-input').value.trim();
        const isPublic = document.getElementById('public-toggle').classList.contains('on');

        HabitsManager.createHabit({ name, description, icon, frequency, isPublic });
        TelegramApp.hapticFeedback('success');
        showToast('🎉 Привычка создана!');
        closeModal();
        renderHabitsView();
    }

    // ── Helpers ──

    function showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }

    function pluralHabits(n) {
        if (n % 10 === 1 && n % 100 !== 11) return 'привычка';
        if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'привычки';
        return 'привычек';
    }

    function pluralSubscribers(n) {
        if (n % 10 === 1 && n % 100 !== 11) return 'участник';
        if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'участника';
        return 'участников';
    }

    return {
        init, switchView, toggleHabit,
        showFriendHabits, toggleSubscription,
        openModal, closeModal, selectIcon, selectFrequency,
        togglePublic, createHabit
    };
})();

document.addEventListener('DOMContentLoaded', HabitApp.init);
