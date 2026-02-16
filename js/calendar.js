/* ═══════════════════════════════════════════════════════════
   Calendar Component
   ═══════════════════════════════════════════════════════════ */

const CalendarComponent = (() => {
    const MONTHS_RU = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth();
    let selectedHabitId = null;
    let selectedDate = null;

    function init() {
        currentYear = new Date().getFullYear();
        currentMonth = new Date().getMonth();
    }

    function render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const allHabits = HabitsManager.getAllMyHabits();

        // Habit selector chips
        let selectorHTML = '<div class="habit-selector">';
        selectorHTML += `<button class="habit-selector-chip ${!selectedHabitId ? 'active' : ''}" 
      onclick="CalendarComponent.selectHabit(null)">📊 Все</button>`;
        allHabits.forEach(h => {
            const isActive = selectedHabitId === h.id ? 'active' : '';
            selectorHTML += `<button class="habit-selector-chip ${isActive}" 
        onclick="CalendarComponent.selectHabit('${h.id}')">${h.icon} ${h.name}</button>`;
        });
        selectorHTML += '</div>';

        // Calendar grid
        let calendarHTML = `
      <div class="calendar-container">
        <div class="calendar-header">
          <button class="calendar-nav-btn" onclick="CalendarComponent.prevMonth()">◀</button>
          <span class="calendar-title">${MONTHS_RU[currentMonth]} ${currentYear}</span>
          <button class="calendar-nav-btn" onclick="CalendarComponent.nextMonth()">▶</button>
        </div>
        <div class="calendar-weekdays">
          ${WEEKDAYS_RU.map(d => `<div class="calendar-weekday">${d}</div>`).join('')}
        </div>
        <div class="calendar-days">${renderDays(allHabits)}</div>
      </div>`;

        // Day detail
        let detailHTML = selectedDate ? renderDayDetail(allHabits) : '';

        container.innerHTML = selectorHTML + calendarHTML + detailHTML;
    }

    function renderDays(allHabits) {
        const today = new Date();
        const todayKey = HabitsManager.dateKey(today);
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        let startOffset = (firstDay.getDay() + 6) % 7;
        const userId = TelegramApp.getUserId();

        let html = '';

        // Previous month filler
        const prevMonthLast = new Date(currentYear, currentMonth, 0);
        for (let i = startOffset - 1; i >= 0; i--) {
            html += `<div class="calendar-day other-month">${prevMonthLast.getDate() - i}</div>`;
        }

        // Current month
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(currentYear, currentMonth, day);
            const key = HabitsManager.dateKey(date);
            const isToday = key === todayKey;

            let completedCount = 0, totalCount = 0;
            let friendDots = [];

            const habitsToCheck = selectedHabitId
                ? allHabits.filter(h => h.id === selectedHabitId) : allHabits;

            habitsToCheck.forEach(habit => {
                totalCount++;
                const completions = HabitsManager.getCompletionsForMonth(habit.id, currentYear, currentMonth);
                if (completions[key]?.includes(userId)) completedCount++;
                const fc = HabitsManager.getFriendCompletionsForDate(habit.id, date);
                fc.forEach(f => { if (!friendDots.find(fd => fd.id === f.id)) friendDots.push(f); });
            });

            let classes = 'calendar-day';
            if (isToday) classes += ' today';
            if (totalCount > 0) {
                if (completedCount === totalCount && completedCount > 0) classes += ' completed';
                else if (completedCount > 0) classes += ' partial';
            }

            let dotsHTML = '';
            if (friendDots.length > 0) {
                dotsHTML = '<div class="friend-dots">' +
                    friendDots.slice(0, 3).map(() => '<div class="friend-dot"></div>').join('') + '</div>';
            }

            html += `<div class="${classes}" onclick="CalendarComponent.selectDate('${key}')">${day}${dotsHTML}</div>`;
        }

        // Next month filler
        const totalCells = startOffset + lastDay.getDate();
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let i = 1; i <= remaining; i++) {
            html += `<div class="calendar-day other-month">${i}</div>`;
        }

        return html;
    }

    function renderDayDetail(allHabits) {
        if (!selectedDate) return '';
        const date = new Date(selectedDate + 'T12:00:00');
        const dayNum = date.getDate();
        const monthName = MONTHS_RU[date.getMonth()];
        const userId = TelegramApp.getUserId();

        const habitsToShow = selectedHabitId
            ? allHabits.filter(h => h.id === selectedHabitId) : allHabits;

        if (habitsToShow.length === 0) {
            return `<div class="day-detail">
        <div class="day-detail-title">${dayNum} ${monthName}</div>
        <div style="padding: 16px 0; text-align: center; color: var(--tg-theme-hint-color); font-size: 13px;">Нет привычек</div>
      </div>`;
        }

        let items = '';
        habitsToShow.forEach(habit => {
            const completions = habit.completions[selectedDate] || [];
            const myCompleted = completions.includes(userId);
            const icon = myCompleted ? '✅' : '⬜';
            const cls = myCompleted ? 'day-detail-check' : 'day-detail-miss';

            let friendsInfo = '';
            const friendComps = HabitsManager.getFriendCompletionsForDate(habit.id, date);
            if (friendComps.length > 0) {
                friendsInfo = `<span style="color: var(--accent-light); font-size: 11px; margin-left: auto;">👥 ${friendComps.map(f => f.name).join(', ')}</span>`;
            }

            items += `<div class="day-detail-item">
        <span class="${cls}">${icon}</span>
        <span>${habit.icon} ${habit.name}</span>
        ${friendsInfo}
      </div>`;
        });

        return `<div class="day-detail">
      <div class="day-detail-title">${dayNum} ${monthName}</div>
      ${items}
    </div>`;
    }

    function selectHabit(habitId) {
        selectedHabitId = habitId;
        TelegramApp.hapticFeedback('selection');
        render('calendar-view');
    }

    function selectDate(dateKey) {
        selectedDate = selectedDate === dateKey ? null : dateKey;
        TelegramApp.hapticFeedback('selection');
        render('calendar-view');
    }

    function prevMonth() {
        currentMonth--;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        selectedDate = null;
        TelegramApp.hapticFeedback('impact');
        render('calendar-view');
    }

    function nextMonth() {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        selectedDate = null;
        TelegramApp.hapticFeedback('impact');
        render('calendar-view');
    }

    return { init, render, selectHabit, selectDate, prevMonth, nextMonth };
})();
