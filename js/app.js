/* ═══════════════════════════════════════════════════════════
   Main App Controller
   ═══════════════════════════════════════════════════════════ */

const HabitApp = (() => {
  let currentView = 'habits';

  async function init() {
    TelegramApp.init();
    await HabitsManager.init();
    CalendarComponent.init();

    const greeting = document.getElementById('user-greeting');
    if (greeting) greeting.textContent = getGreeting();

    // Проверяем deep link — приглашение в привычку
    const startParam = TelegramApp.getStartParam();
    if (startParam && startParam.startsWith('habit_')) {
      const habitId = parseInt(startParam.replace('habit_', ''));
      if (habitId) {
        showInviteModal(habitId);
      }
    }

    switchView('habits');

    // Загружаем настройки уведомлений в фоне
    loadNotificationSettings();
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

    container.innerHTML = html + renderNotificationSettings();
  }

  function renderHabitCard(habit, isShared) {
    const completed = HabitsManager.isCompletedToday(habit.id);
    const streak = HabitsManager.getStreak(habit.id);

    let sharedBadge = '';
    let friendsSection = '';

    if (isShared) {
      sharedBadge = `<span class="shared-badge">👥 ${habit.friendName || habit.ownerName || habit.owner_name}</span>`;
    }

    // Показываем кто выполнил — и для своих, и для совместных привычек
    const friendComps = HabitsManager.getFriendCompletionsForDate(habit.id, new Date());
    if (friendComps.length > 0) {
      friendsSection = `
        <div class="habit-friends">
          <div class="avatar-stack">
            ${friendComps.slice(0, 3).map(f => `<div class="avatar">${f.initials}</div>`).join('')}
          </div>
          <span class="friends-label">${friendComps.map(f => f.name).join(', ')} — ✅ выполнено сегодня</span>
        </div>`;
    }

    // Раскрываемая панель: описание + действия
    const description = habit.description ? `<p class="habit-description">${habit.description}</p>` : '';

    let actions = '';
    if (!isShared) {
      const shareAction = habit.is_public
        ? `<button class="action-btn share-btn" onclick="event.stopPropagation(); HabitApp.shareHabit(${habit.id}, '${habit.name.replace(/'/g, '\\&#39;')}', '${habit.icon}')">
            📤 Пригласить
          </button>`
        : '';
      actions = `
        <div class="habit-actions">
          ${shareAction}
          <button class="action-btn delete-btn" onclick="event.stopPropagation(); HabitApp.confirmDeleteHabit(${habit.id}, '${habit.name.replace(/'/g, '\\&#39;')}')">
            🗑 Удалить
          </button>
        </div>`;
    } else {
      actions = `
        <div class="habit-actions">
          <button class="action-btn delete-btn" onclick="event.stopPropagation(); HabitApp.confirmUnsubscribe(${habit.id}, '${habit.name.replace(/'/g, '\\&#39;')}')">
            ❌ Отписаться
          </button>
        </div>`;
    }

    const expandContent = (description || actions) ? `
      <div class="habit-expand">
        ${description}
        ${habit.is_public && !isShared && habit.subscriber_count > 0 ? `<span class="subscriber-count">👥 ${habit.subscriber_count} ${pluralSubscribers(habit.subscriber_count)}</span>` : ''}
        ${actions}
      </div>` : '';

    return `
      <div class="habit-card" id="card-${habit.id}" onclick="HabitApp.toggleExpand(${habit.id})">
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
            onclick="event.stopPropagation(); HabitApp.toggleHabit(${habit.id})">
            ${completed ? '✓' : ''}
          </button>
        </div>
        ${friendsSection}
        ${expandContent}
      </div>`;
  }

  async function toggleHabit(habitId) {
    const wasCompleted = await HabitsManager.toggleCompletion(habitId);
    if (wasCompleted) {
      TelegramApp.hapticFeedback('success');
      showToast('✅ Привычка выполнена!');
    } else {
      TelegramApp.hapticFeedback('impact');
    }
    renderHabitsView();
  }

  // ── Friends View ──

  async function renderFriendsView() {
    const container = document.getElementById('friends-view');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--tg-theme-hint-color);">Загрузка...</div>';

    const friends = await HabitsManager.fetchFriends();
    let html = '<div class="friends-section-title">Привычки друзей</div>';

    if (friends.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <div class="empty-state-title">Пока никого нет</div>
          <div class="empty-state-text">Другие пользователи появятся здесь, когда создадут публичные привычки</div>
        </div>`;
    } else {
      friends.forEach(friend => {
        html += `
          <div class="friend-card" onclick="HabitApp.showFriendHabits(${friend.id})">
            <div class="friend-avatar">${friend.initials}</div>
            <div class="friend-info">
              <div class="friend-name">${friend.first_name} ${friend.last_name || ''}</div>
              <div class="friend-habits-count">${friend.habitCount} ${pluralHabits(friend.habitCount)}</div>
            </div>
          </div>`;
      });
    }

    container.innerHTML = html;
  }

  async function showFriendHabits(friendId) {
    const container = document.getElementById('friends-view');
    container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--tg-theme-hint-color);">Загрузка...</div>';

    const data = await HabitsManager.fetchFriendHabits(friendId);
    if (!data) {
      showToast('⚠️ Не удалось загрузить');
      renderFriendsView();
      return;
    }

    const { friend, habits } = data;

    let html = `
      <button class="tab-btn" onclick="HabitApp.switchView('friends')" style="margin-bottom: 16px;">◀ Назад</button>
      <div class="friends-section-title">Привычки — ${friend.first_name}</div>`;

    habits.forEach(habit => {
      html += `
        <div class="habit-card">
          <div class="habit-card-header">
            <div class="habit-icon">${habit.icon}</div>
            <div class="habit-info">
              <div class="habit-name">${habit.name}</div>
              <div class="habit-meta">
                <span>${habit.frequency === 'daily' ? 'Ежедневно' : 'Еженедельно'}</span>
              </div>
            </div>
            <button class="subscribe-btn ${habit.is_subscribed ? 'subscribed' : ''}"
              onclick="event.stopPropagation(); HabitApp.toggleSubscription(${friend.id}, ${habit.id})">
              ${habit.is_subscribed ? 'Отписаться' : 'Вступить'}
            </button>
          </div>
          ${habit.subscriber_count > 0 ? `
            <div class="habit-friends">
              <span class="friends-label">👥 ${habit.subscriber_count} ${pluralSubscribers(habit.subscriber_count)}</span>
            </div>` : ''}
        </div>`;
    });

    container.innerHTML = html;
    TelegramApp.hapticFeedback('impact');
  }

  async function toggleSubscription(friendId, habitId) {
    const allSubscribed = HabitsManager.getSubscribedHabits();
    const isSub = allSubscribed.some(h => h.id === habitId);

    if (isSub) {
      await HabitsManager.unsubscribeFromHabit(habitId);
      showToast('Вы отписались от привычки');
    } else {
      await HabitsManager.subscribeToHabit(friendId, habitId);
      TelegramApp.hapticFeedback('success');
      showToast('🎉 Вы подписались! Выполняйте вместе');
    }

    // Обновляем список привычек с сервера
    try { await HabitsManager.syncFromServer(); } catch { }
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

  async function createHabit() {
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

    try {
      await HabitsManager.createHabit({ name, description, icon, frequency, isPublic });
      TelegramApp.hapticFeedback('success');
      showToast('🎉 Привычка создана!');
      closeModal();
      renderHabitsView();
    } catch (e) {
      TelegramApp.hapticFeedback('error');
      showToast('⚠️ Ошибка. Попробуйте ещё раз');
    }
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

  /**
   * Склоняет «выполнил/выполнила/выполнили» по количеству и полу
   * Определение пола по окончанию имени (а/я → жен.)
   */
  function completionVerb(friends) {
    if (friends.length > 1) return 'выполнили';
    const name = (friends[0]?.name || '').trim();
    const lastChar = name.slice(-1).toLowerCase();
    // Имена на -а/-я — женские (Алёна, Мария, Александра)
    if (lastChar === 'а' || lastChar === 'я') return 'выполнила';
    return 'выполнил';
  }

  // ── Invite / Share ──

  function shareHabit(habitId, habitName, habitIcon) {
    TelegramApp.shareHabit(habitId, habitName, habitIcon);
    TelegramApp.hapticFeedback('success');
  }

  async function showInviteModal(habitId) {
    try {
      const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000/api'
        : 'https://rambaramgithubio-production.up.railway.app/api';

      const resp = await fetch(`${API_URL}/invite/${habitId}`);
      if (!resp.ok) throw new Error('Not found');
      const habit = await resp.json();

      const modal = document.getElementById('create-modal');
      const sheet = modal.querySelector('.modal-sheet');

      sheet.innerHTML = `
        <div class="modal-handle"></div>
        <div class="invite-modal">
          <div class="invite-icon">${habit.icon}</div>
          <h2 class="invite-title">${habit.name}</h2>
          ${habit.description ? `<p class="invite-desc">${habit.description}</p>` : ''}
          <div class="invite-meta">
            <span>👤 ${habit.owner_name}</span>
            <span>👥 ${habit.subscriber_count} ${pluralSubscribers(habit.subscriber_count)}</span>
            <span>${habit.frequency === 'daily' ? 'Ежедневно' : 'Еженедельно'}</span>
          </div>
          <button class="btn-primary invite-join-btn" onclick="HabitApp.acceptInvite(${habit.id})">Присоединиться</button>
          <button class="btn-secondary" onclick="HabitApp.closeInviteModal()">Не сейчас</button>
        </div>
      `;

      modal.classList.add('visible');
    } catch (e) {
      console.error('Invite load failed:', e);
      showToast('⚠️ Привычка не найдена');
    }
  }

  async function acceptInvite(habitId) {
    try {
      await HabitsManager.subscribeToHabit(null, habitId);
      TelegramApp.hapticFeedback('success');
      showToast('🎉 Вы присоединились!');
      closeInviteModal();
      await HabitsManager.syncFromServer();
      renderHabitsView();
    } catch (e) {
      TelegramApp.hapticFeedback('error');
      showToast('⚠️ Не удалось подписаться');
    }
  }

  function closeInviteModal() {
    const modal = document.getElementById('create-modal');
    modal.classList.remove('visible');
    // Перезагружаем для восстановления модала создания
    setTimeout(() => location.reload(), 300);
  }

  // ── Expand / Delete / Unsubscribe ──

  function toggleExpand(habitId) {
    const card = document.getElementById(`card-${habitId}`);
    if (!card) return;
    const wasExpanded = card.classList.contains('expanded');
    // Collapse all other cards
    document.querySelectorAll('.habit-card.expanded').forEach(c => c.classList.remove('expanded'));
    if (!wasExpanded) {
      card.classList.add('expanded');
      TelegramApp.hapticFeedback('selection');
    }
  }

  function confirmDeleteHabit(habitId, habitName) {
    if (TelegramApp.tg?.showPopup) {
      TelegramApp.tg.showPopup({
        title: 'Удалить привычку?',
        message: `«${habitName}» будет удалена вместе со всей историей.`,
        buttons: [
          { id: 'delete', type: 'destructive', text: 'Удалить' },
          { id: 'cancel', type: 'cancel' }
        ]
      }, async (btnId) => {
        if (btnId === 'delete') {
          await doDeleteHabit(habitId);
        }
      });
    } else {
      if (confirm(`Удалить «${habitName}»? Это действие нельзя отменить.`)) {
        doDeleteHabit(habitId);
      }
    }
  }

  async function doDeleteHabit(habitId) {
    try {
      await HabitsManager.deleteHabit(habitId);
      TelegramApp.hapticFeedback('success');
      showToast('🗑 Привычка удалена');
      renderHabitsView();
    } catch (e) {
      TelegramApp.hapticFeedback('error');
      showToast('⚠️ Не удалось удалить');
    }
  }

  function confirmUnsubscribe(habitId, habitName) {
    if (TelegramApp.tg?.showPopup) {
      TelegramApp.tg.showPopup({
        title: 'Отписаться?',
        message: `Вы перестанете отслеживать «${habitName}».`,
        buttons: [
          { id: 'unsub', type: 'destructive', text: 'Отписаться' },
          { id: 'cancel', type: 'cancel' }
        ]
      }, async (btnId) => {
        if (btnId === 'unsub') {
          await doUnsubscribe(habitId);
        }
      });
    } else {
      if (confirm(`Отписаться от «${habitName}»?`)) {
        doUnsubscribe(habitId);
      }
    }
  }

  async function doUnsubscribe(habitId) {
    try {
      await HabitsManager.unsubscribeFromHabit(habitId);
      TelegramApp.hapticFeedback('success');
      showToast('❌ Вы отписались');
      await HabitsManager.syncFromServer();
      renderHabitsView();
    } catch (e) {
      TelegramApp.hapticFeedback('error');
      showToast('⚠️ Не удалось отписаться');
    }
  }

  // ── Notification Settings ──

  let notifSettings = { enabled: true, remind_time: 20, timezone_offset: 180 };

  async function loadNotificationSettings() {
    try {
      const data = await HabitsManager.apiFetch('/notifications');
      if (data) notifSettings = data;
    } catch (e) {
      console.error('Failed to load notification settings:', e);
    }
  }

  async function saveNotificationSettings() {
    try {
      const data = await HabitsManager.apiFetch('/notifications', {
        method: 'POST',
        body: JSON.stringify(notifSettings)
      });
      if (data) notifSettings = data;
    } catch (e) {
      console.error('Failed to save notification settings:', e);
    }
  }

  async function toggleNotifications() {
    notifSettings.enabled = !notifSettings.enabled;
    notifSettings.timezone_offset = -new Date().getTimezoneOffset();
    await saveNotificationSettings();
    TelegramApp.hapticFeedback('impact');
    renderHabitsView();
    showToast(notifSettings.enabled ? '🔔 Уведомления включены' : '🔕 Уведомления выключены');
  }

  async function updateRemindTime(value) {
    notifSettings.remind_time = parseInt(value);
    notifSettings.timezone_offset = -new Date().getTimezoneOffset();
    await saveNotificationSettings();
    TelegramApp.hapticFeedback('selection');
    showToast(`⏰ Напоминание в ${value}:00`);
  }

  function renderNotificationSettings() {
    const timeOptions = Array.from({ length: 24 }, (_, i) => {
      const selected = i === notifSettings.remind_time ? 'selected' : '';
      return `<option value="${i}" ${selected}>${String(i).padStart(2, '0')}:00</option>`;
    }).join('');

    return `
      <div class="notification-settings">
        <div class="notif-header">
          <span class="notif-title">🔔 Напоминания</span>
          <label class="toggle-switch">
            <input type="checkbox" ${notifSettings.enabled ? 'checked' : ''} 
              onchange="HabitApp.toggleNotifications()">
            <span class="toggle-slider"></span>
          </label>
        </div>
        ${notifSettings.enabled ? `
          <div class="notif-time">
            <span>Время напоминания</span>
            <select class="time-select" onchange="HabitApp.updateRemindTime(this.value)">
              ${timeOptions}
            </select>
          </div>
        ` : ''}
      </div>`;
  }

  return {
    init, switchView, toggleHabit,
    showFriendHabits, toggleSubscription,
    openModal, closeModal, selectIcon, selectFrequency,
    togglePublic, createHabit,
    shareHabit, acceptInvite, closeInviteModal, showToast,
    toggleExpand, confirmDeleteHabit, confirmUnsubscribe,
    toggleNotifications, updateRemindTime
  };
})();

document.addEventListener('DOMContentLoaded', HabitApp.init);
