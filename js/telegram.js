/* ═══════════════════════════════════════════════════════════
   Telegram Mini App SDK Integration
   ═══════════════════════════════════════════════════════════ */

const TelegramApp = (() => {
  let tg = null;
  let user = null;

  function init() {
    tg = window.Telegram?.WebApp;

    if (tg) {
      tg.ready();
      tg.expand();
      applyTheme();
      user = tg.initDataUnsafe?.user || null;

      tg.BackButton.onClick(() => {
        if (document.querySelector('.modal-overlay.visible')) {
          HabitApp.closeModal();
        }
      });

      tg.onEvent('themeChanged', applyTheme);
    } else {
      // Demo mode for browser testing
      user = {
        id: 12345678,
        first_name: 'Демо',
        last_name: 'Пользователь',
        username: 'demo_user'
      };
    }

    return user;
  }

  function applyTheme() {
    if (!tg) return;
    const root = document.documentElement;
    const tp = tg.themeParams;

    if (tp.bg_color) root.style.setProperty('--tg-theme-bg-color', tp.bg_color);
    if (tp.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', tp.secondary_bg_color);
    if (tp.text_color) root.style.setProperty('--tg-theme-text-color', tp.text_color);
    if (tp.hint_color) root.style.setProperty('--tg-theme-hint-color', tp.hint_color);
    if (tp.link_color) root.style.setProperty('--tg-theme-link-color', tp.link_color);
    if (tp.button_color) root.style.setProperty('--tg-theme-button-color', tp.button_color);
    if (tp.button_text_color) root.style.setProperty('--tg-theme-button-text-color', tp.button_text_color);
  }

  function getUser() { return user; }
  function getUserId() { return user?.id || 'unknown'; }

  function getUserName() {
    if (!user) return 'Гость';
    return user.first_name + (user.last_name ? ' ' + user.last_name : '');
  }

  function getUserInitials() {
    if (!user) return '?';
    return ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || '?';
  }

  /**
   * Возвращает initData для отправки на сервер
   */
  function getInitData() {
    return tg?.initData || '';
  }

  function hapticFeedback(type = 'impact') {
    if (!tg?.HapticFeedback) return;
    switch (type) {
      case 'impact': tg.HapticFeedback.impactOccurred('medium'); break;
      case 'success': tg.HapticFeedback.notificationOccurred('success'); break;
      case 'error': tg.HapticFeedback.notificationOccurred('error'); break;
      case 'selection': tg.HapticFeedback.selectionChanged(); break;
    }
  }

  function showMainButton(text, callback) {
    if (!tg) return;
    tg.MainButton.setText(text);
    tg.MainButton.show();
    tg.MainButton.onClick(callback);
  }

  function hideMainButton() {
    if (!tg) return;
    tg.MainButton.hide();
  }

  /**
   * Получить startapp параметр из deep link
   */
  function getStartParam() {
    return tg?.initDataUnsafe?.start_param || null;
  }

  /**
   * Поделиться привычкой через Telegram
   */
  function shareHabit(habitId, habitName, habitIcon) {
    const botUsername = 'betaHabitsBot'; // ← имя бота
    const appName = 'app'; // ← короткое имя Mini App в BotFather
    const url = `https://t.me/${botUsername}/${appName}?startapp=habit_${habitId}`;
    const text = `${habitIcon} Присоединяйся к привычке «${habitName}»!`;

    if (tg) {
      // В Telegram — открываем диалог выбора чата для пересылки
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
    } else {
      // В браузере — копируем ссылку
      navigator.clipboard?.writeText(url);
      HabitApp.showToast('🔗 Ссылка скопирована!');
    }
  }

  return {
    init, getUser, getUserId, getUserName, getUserInitials,
    getInitData, hapticFeedback, showMainButton, hideMainButton,
    getStartParam, shareHabit,
    get tg() { return tg; }
  };
})();
