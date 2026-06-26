import './errors.js';
import { db } from './db.js';
import {
  getTodayLocal,
  toDateOnly,
  escapeHtml,
  formatBpm,
  formatDuration,
  isSectionInPlanning,
} from './utils.js';
import { log } from './logger.js';

// ── State ──
let currentWeeks = 4;
let currentView = 'list';
let currentMonthYear = null;
let currentMonthIndex = null;
let selectedDayKey = null;
let allSections = [];
let allPieces = [];
let allSessions = [];

function schedulablePieceById() {
  return new Map(allPieces.map((p) => [p.id, p]));
}

function isSchedulableSection(section) {
  return isSectionInPlanning(section, schedulablePieceById());
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await db.init();
  const today = getTodayLocal();
  currentMonthYear = today.getFullYear();
  currentMonthIndex = today.getMonth();
  await loadData();
  bindEvents();
});

async function loadData() {
  allSections = await db.getAllSections();
  allPieces = await db.getAllPieces();
  allSessions = await db.getAllSessions();
  renderAll();
  log('NAV', 'schedule loaded', {
    sections: allSections.length,
    pieces: allPieces.length,
    sessions: allSessions.length,
    view: currentView,
  });
}

// ── Date helpers ──

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateKeyFromDate(date) {
  return (
    date.getFullYear() + '-' +
    pad2(date.getMonth() + 1) + '-' +
    pad2(date.getDate())
  );
}

function parseDateKey(key) {
  return toDateOnly(key);
}

function isSameDay(a, b) {
  return a && b && a.getTime() === b.getTime();
}

// ── Render dispatcher ──

function renderAll() {
  const listCalendar = document.getElementById('scheduleCalendar');
  const monthView = document.getElementById('monthView');
  const listControls = document.getElementById('listViewControls');
  const monthControls = document.getElementById('monthViewControls');
  const titleEl = document.getElementById('scheduleTitle');
  const subtitleEl = document.getElementById('scheduleSubtitle');

  document.querySelectorAll('.view-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === currentView);
  });

  if (currentView === 'list') {
    listCalendar?.classList.remove('hidden');
    monthView?.classList.add('hidden');
    listControls?.classList.remove('hidden');
    monthControls?.classList.add('hidden');
    if (titleEl) titleEl.textContent = 'Upcoming Schedule';
    if (subtitleEl) {
      subtitleEl.innerHTML =
        'Your practice plan for the next ' +
        '<span id="scheduleWeeks">' + currentWeeks + '</span> weeks';
    }
    renderListView();
  } else {
    listCalendar?.classList.add('hidden');
    monthView?.classList.remove('hidden');
    listControls?.classList.add('hidden');
    monthControls?.classList.remove('hidden');
    const monthLabel = new Date(
      currentMonthYear,
      currentMonthIndex,
      1,
    ).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
    if (titleEl) titleEl.textContent = monthLabel;
    if (subtitleEl) {
      subtitleEl.textContent =
        'Completed sessions and planned practice at a glance';
    }
    renderMonthView();
  }
}

// ── List view ──

function renderListView() {
  const calendar = document.getElementById('scheduleCalendar');
  const summary = document.getElementById('scheduleSummary');
  const weeksLabel = document.getElementById('scheduleWeeks');

  if (weeksLabel) {
    weeksLabel.textContent = currentWeeks;
  }

  const today = getTodayLocal();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + currentWeeks * 7);

  const scheduled = allSections.filter((s) => {
    if (!isSchedulableSection(s)) return false;
    const nextDate = toDateOnly(s.nextPracticeDate);
    if (!nextDate) return false;
    return nextDate <= endDate;
  });

  scheduled.sort((a, b) => {
    const dateA = toDateOnly(a.nextPracticeDate);
    const dateB = toDateOnly(b.nextPracticeDate);
    return dateA - dateB;
  });

  const overdueCount = scheduled.filter((s) => {
    return toDateOnly(s.nextPracticeDate) < today;
  }).length;

  const todayCount = scheduled.filter((s) => {
    const d = toDateOnly(s.nextPracticeDate);
    return d && d.getTime() === today.getTime();
  }).length;

  const upcomingCount = scheduled.length - overdueCount - todayCount;

  if (summary) {
    summary.innerHTML = `
      <div class="summary-pill orange">
        <span class="summary-pill-value">${overdueCount}</span>
        overdue
      </div>
      <div class="summary-pill accent">
        <span class="summary-pill-value">${todayCount}</span>
        due today
      </div>
      <div class="summary-pill">
        <span class="summary-pill-value">${upcomingCount}</span>
        upcoming
      </div>
      <div class="summary-pill">
        <span class="summary-pill-value">${scheduled.length}</span>
        total in period
      </div>`;
  }

  if (!calendar) return;
  calendar.innerHTML = '';

  if (scheduled.length === 0) {
    calendar.innerHTML = `
      <div class="schedule-empty">
        <div class="schedule-empty-icon">📅</div>
        <div class="schedule-empty-title">
          Nothing scheduled for this period.
        </div>
        <p>Add sections in the Dashboard to
           start planning.</p>
      </div>`;
    return;
  }

  const byDay = new Map();
  const overdueSections = scheduled.filter((s) => {
    return toDateOnly(s.nextPracticeDate) < today;
  });

  if (overdueSections.length > 0) {
    byDay.set('overdue', overdueSections);
  }

  scheduled.forEach((s) => {
    const nextDate = toDateOnly(s.nextPracticeDate);
    if (!nextDate || nextDate < today) return;

    const key = dateKeyFromDate(nextDate);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(s);
  });

  let currentWeekNum = null;
  let weekSectionCount = 0;
  let weekStartEl = null;

  byDay.forEach((sections, dayKey) => {
    let weekNum;
    const isOverdueGroup = dayKey === 'overdue';

    if (isOverdueGroup) {
      weekNum = -1;
    } else {
      const dayDate = parseDateKey(dayKey);
      const diffDays = Math.floor((dayDate - today) / 86400000);
      weekNum = Math.floor(diffDays / 7);
    }

    if (weekNum !== currentWeekNum) {
      if (weekStartEl) {
        const countEl = weekStartEl.querySelector('.week-separator-count');
        if (countEl) {
          countEl.textContent =
            weekSectionCount + ' section' +
            (weekSectionCount !== 1 ? 's' : '');
        }
      }

      currentWeekNum = weekNum;
      weekSectionCount = 0;

      const sep = document.createElement('div');
      sep.className = 'week-separator';

      let weekLabel;
      if (isOverdueGroup) {
        weekLabel = '⚠️ Overdue';
      } else if (weekNum === 0) {
        weekLabel = 'This week';
      } else if (weekNum === 1) {
        weekLabel = 'Next week';
      } else {
        weekLabel = 'Week ' + (weekNum + 1);
      }

      sep.innerHTML = `
        <span class="week-separator-label">${weekLabel}</span>
        <span class="week-separator-line"></span>
        <span class="week-separator-count"></span>`;

      weekStartEl = sep;
      calendar.appendChild(sep);
    }

    weekSectionCount += sections.length;

    const row = document.createElement('div');

    if (isOverdueGroup) {
      row.className = 'day-row has-overdue';

      const labelWrapper = document.createElement('div');
      labelWrapper.className = 'day-label-wrapper';
      labelWrapper.innerHTML = `
        <div class="day-label-weekday">Past due</div>
        <div class="day-label-date"
             style="font-size:13px; color:var(--danger);">
          ${sections.length} item${
            sections.length !== 1 ? 's' : ''
          }
        </div>`;

      const sectionsEl = document.createElement('div');
      sectionsEl.className = 'day-sections';
      sections.forEach((s) => {
        sectionsEl.appendChild(createScheduleItem(s, 'overdue', today));
      });

      row.appendChild(labelWrapper);
      row.appendChild(sectionsEl);
    } else {
      const dayDate = parseDateKey(dayKey);
      const isToday = isSameDay(dayDate, today);

      row.className = 'day-row' + (isToday ? ' today' : '');

      const labelWrapper = document.createElement('div');
      labelWrapper.className = 'day-label-wrapper';
      labelWrapper.innerHTML = `
        <div class="day-label-weekday">
          ${dayDate.toLocaleDateString(undefined, { weekday: 'short' })}
        </div>
        <div class="day-label-date">${dayDate.getDate()}</div>
        <div class="day-label-month">
          ${dayDate.toLocaleDateString(undefined, { month: 'short' })}
        </div>
        <div class="day-label-today-badge">Today</div>`;

      const sectionsEl = document.createElement('div');
      sectionsEl.className = 'day-sections';
      sections.forEach((s) => {
        sectionsEl.appendChild(
          createScheduleItem(s, isToday ? 'due-today' : '', today),
        );
      });

      row.appendChild(labelWrapper);
      row.appendChild(sectionsEl);
    }

    calendar.appendChild(row);
  });

  if (weekStartEl) {
    const countEl = weekStartEl.querySelector('.week-separator-count');
    if (countEl) {
      countEl.textContent =
        weekSectionCount + ' section' +
        (weekSectionCount !== 1 ? 's' : '');
    }
  }
}

// ── Month view ──

function buildMonthData() {
  const today = getTodayLocal();
  const monthStart = new Date(
    currentMonthYear,
    currentMonthIndex,
    1,
    0, 0, 0, 0,
  );
  const monthEnd = new Date(
    currentMonthYear,
    currentMonthIndex + 1,
    0,
    23, 59, 59, 999,
  );

  const sessionsByDay = new Map();
  allSessions.forEach((s) => {
    const d = new Date(s.date);
    if (isNaN(d)) return;
    const key = dateKeyFromDate(d);
    const dayDate = parseDateKey(key);
    if (dayDate < monthStart || dayDate > monthEnd) return;
    if (!sessionsByDay.has(key)) {
      sessionsByDay.set(key, { sessions: [], totalSeconds: 0 });
    }
    const entry = sessionsByDay.get(key);
    entry.sessions.push(s);
    entry.totalSeconds += s.duration || 0;
  });

  const dueByDay = new Map();
  const missedByDay = new Map();
  const overdueSections = [];

  allSections.forEach((s) => {
    if (!isSchedulableSection(s)) return;
    const nextDate = toDateOnly(s.nextPracticeDate);
    if (!nextDate) return;

    if (nextDate < today) {
      // Sectie is nog steeds gepland op een verleden datum = niet afgerond.
      const key = dateKeyFromDate(nextDate);
      if (!missedByDay.has(key)) missedByDay.set(key, []);
      missedByDay.get(key).push(s);
      overdueSections.push(s);
      return;
    }

    if (nextDate > monthEnd) return;

    const key = dateKeyFromDate(nextDate);
    if (!dueByDay.has(key)) dueByDay.set(key, []);
    dueByDay.get(key).push(s);
  });

  return {
    today,
    monthStart,
    monthEnd,
    sessionsByDay,
    dueByDay,
    missedByDay,
    overdueSections,
    historicalDayMap: buildHistoricalDayMap(monthStart, monthEnd),
  };
}

// Herbouw per dag wat er gepland stond via sessie-replay.
// nextPracticeDate in de DB wordt na elke sessie bijgewerkt, dus voor
// verleden dagen simuleren we de planning opnieuw vanaf createdAt.
function buildHistoricalDayMap(monthStart, monthEnd) {
  const activeSections = allSections.filter((s) => isSchedulableSection(s));
  const sectionById = new Map(
    activeSections.map((s) => [s.id, s]),
  );
  const state = new Map();
  let earliest = new Date(monthStart);

  activeSections.forEach((s) => {
    const created = toDateOnly(s.createdAt) || monthStart;
    state.set(s.id, created);
    if (created < earliest) earliest = new Date(created);
  });

  const relevantSessions = allSessions
    .filter(
      (s) =>
        s.sectionId &&
        s.sectionId !== 'free-practice' &&
        s.sessionOutcome !== 'FreePractice',
    )
    .filter((s) => {
      const d = toDateOnly(s.date);
      return d && d <= monthEnd;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const sessionsByDay = new Map();
  relevantSessions.forEach((s) => {
    const k = dateKeyFromDate(toDateOnly(s.date));
    if (!sessionsByDay.has(k)) sessionsByDay.set(k, []);
    sessionsByDay.get(k).push(s);
  });

  const historical = new Map();
  const cursor = new Date(earliest);
  const end = new Date(monthEnd);

  while (cursor <= end) {
    const dayKey = dateKeyFromDate(cursor);
    const dueIds = [];
    state.forEach((nextDue, id) => {
      if (nextDue <= cursor) dueIds.push(id);
    });

    const daySessions = sessionsByDay.get(dayKey) || [];
    const practicedIds = new Set();
    daySessions.forEach((sess) => {
      practicedIds.add(sess.sectionId);
      const stab = Math.max(1, Math.round(sess.stability || 1));
      const next = new Date(cursor);
      next.setDate(cursor.getDate() + stab);
      state.set(sess.sectionId, toDateOnly(
        next.getFullYear() + '-' +
        pad2(next.getMonth() + 1) + '-' +
        pad2(next.getDate()),
      ));
    });

    const missedIds = dueIds.filter((id) => !practicedIds.has(id));
    const missedSections = missedIds
      .map((id) => sectionById.get(id))
      .filter(Boolean);

    if (cursor >= monthStart) {
      historical.set(dayKey, {
        dueCount: dueIds.length,
        practicedCount: practicedIds.size,
        missedCount: missedIds.length,
        sessionCount: daySessions.length,
        missedSections,
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return historical;
}

function practiceIntensityLevel(totalSeconds) {
  if (totalSeconds <= 0) return 0;
  if (totalSeconds < 900) return 1;
  if (totalSeconds < 1800) return 2;
  return 3;
}

// Unieke repertoire-secties geoefend op een dag (geen Free Practice).
function countPracticedSections(sessions) {
  const ids = new Set();
  (sessions || []).forEach((s) => {
    if (
      s.sessionOutcome === 'FreePractice' ||
      s.sectionId === 'free-practice'
    ) {
      return;
    }
    if (s.sectionId) ids.add(s.sectionId);
  });
  return ids.size;
}

// Bepaal dagstatus voor verleden (historische replay) of heden/toekomst.
function getPastDayStatus(hist, hasPractice) {
  if (!hist) {
    return hasPractice ? 'complete' : 'neutral';
  }
  if (hist.sessionCount > 0 && hist.missedCount > 0) return 'partial';
  if (hist.sessionCount > 0 && hist.missedCount === 0) return 'complete';
  if (hist.sessionCount === 0 && hist.dueCount > 0) return 'missed';
  return 'neutral';
}

function getDayStatus({
  isPast,
  isToday,
  practicedCount,
  missedCount,
  dueCount,
}) {
  if (isPast) {
    if (practicedCount > 0 && missedCount > 0) return 'partial';
    if (practicedCount > 0 && missedCount === 0) return 'complete';
    if (practicedCount === 0 && missedCount > 0) return 'missed';
    return 'neutral';
  }
  if (isToday) {
    if (practicedCount > 0 && dueCount > 0) return 'partial';
    if (practicedCount > 0 && dueCount === 0) return 'complete';
    if (practicedCount === 0 && dueCount > 0) return 'pending';
    return 'neutral';
  }
  return dueCount > 0 ? 'pending' : 'neutral';
}

function renderMonthView() {
  const summary = document.getElementById('scheduleSummary');
  const grid = document.getElementById('monthGrid');
  const {
    today,
    monthStart,
    monthEnd,
    sessionsByDay,
    dueByDay,
    missedByDay,
    overdueSections,
    historicalDayMap,
  } = buildMonthData();

  let monthPracticeSeconds = 0;
  let monthPracticeDays = 0;
  let monthSessionCount = 0;
  let monthDueCount = 0;

  sessionsByDay.forEach((entry) => {
    monthPracticeSeconds += entry.totalSeconds;
    monthPracticeDays++;
    monthSessionCount += entry.sessions.length;
  });

  dueByDay.forEach((sections) => {
    monthDueCount += sections.length;
  });
  monthDueCount += overdueSections.length;

  if (summary) {
    summary.innerHTML = `
      <div class="summary-pill accent">
        <span class="summary-pill-value">${monthPracticeDays}</span>
        practice days
      </div>
      <div class="summary-pill">
        <span class="summary-pill-value">${
          formatDuration(monthPracticeSeconds)
        }</span>
        practiced
      </div>
      <div class="summary-pill">
        <span class="summary-pill-value">${monthSessionCount}</span>
        sessions
      </div>
      <div class="summary-pill orange">
        <span class="summary-pill-value">${monthDueCount}</span>
        still due
      </div>`;
  }

  if (!grid) return;
  grid.innerHTML = '';

  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - firstWeekday);

  const todayKey = dateKeyFromDate(today);

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + i);
    const key = dateKeyFromDate(cellDate);
    const inMonth =
      cellDate.getMonth() === currentMonthIndex &&
      cellDate.getFullYear() === currentMonthYear;
    const isToday = key === todayKey;
    const isPast = cellDate < today && !isToday;
    const isFuture = cellDate > today;

    const practice = sessionsByDay.get(key);
    const dueSections = dueByDay.get(key) || [];
    const hist = historicalDayMap.get(key);
    let missedDueSections = isPast && hist
      ? hist.missedSections
      : (missedByDay.get(key) || []);

    const sessionCount = practice ? practice.sessions.length : 0;
    const practicedCount = practice
      ? countPracticedSections(practice.sessions)
      : 0;
    const missedCount = isPast && hist
      ? hist.missedCount
      : missedDueSections.length;

    let dueCount = dueSections.length;
    let showOverdue = false;

    if (isToday && overdueSections.length > 0) {
      dueCount += overdueSections.length;
      showOverdue = true;
    }

    let dayStatus;
    if (isPast) {
      dayStatus = getPastDayStatus(hist, sessionCount > 0);
    } else {
      dayStatus = getDayStatus({
        isPast,
        isToday,
        practicedCount,
        missedCount: 0,
        dueCount,
      });
    }

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'month-day';
    if (!inMonth) cell.classList.add('other-month');
    if (isToday) cell.classList.add('today');
    if (isPast) cell.classList.add('past');
    if (isFuture) cell.classList.add('future');
    if (dayStatus !== 'neutral') {
      cell.classList.add('status-' + dayStatus);
    }

    const intensity = practice
      ? practiceIntensityLevel(practice.totalSeconds)
      : 0;
    if (dayStatus === 'complete' && intensity > 0) {
      cell.classList.add('has-practice', 'intensity-' + intensity);
    }
    if (
      (dueCount > 0 && !isPast) ||
      (isFuture && dueCount > 0)
    ) {
      cell.classList.add('has-due');
      if (showOverdue) cell.classList.add('has-overdue-due');
    }
    if (key === selectedDayKey) cell.classList.add('selected');

    const practiceLabel = practice
      ? formatDuration(practice.totalSeconds)
      : '';

    const sessionsLabel = sessionCount > 0
      ? sessionCount + ' session' + (sessionCount !== 1 ? 's' : '')
      : '';

    let statusLabel = '';
    if (isPast) {
      if (dayStatus === 'partial') {
        statusLabel = missedCount + ' missed';
      } else if (dayStatus === 'missed') {
        statusLabel = (hist?.dueCount || missedCount) + ' missed';
      }
    } else if (isToday && dayStatus === 'partial') {
      statusLabel =
        practicedCount + ' done · ' + dueCount + ' due';
    } else if (!isPast && dueCount > 0) {
      statusLabel = dueCount + ' due';
    }

    cell.innerHTML = `
      <span class="month-day-num">${cellDate.getDate()}</span>
      <span class="month-day-practice">${
        escapeHtml(practiceLabel)
      }</span>
      <span class="month-day-sessions">${
        escapeHtml(sessionsLabel)
      }</span>
      <span class="month-day-due">${
        escapeHtml(statusLabel)
      }</span>`;

    if (inMonth) {
      cell.addEventListener('click', () => {
        selectedDayKey = key;
        renderMonthView();
        renderDayDetail(key, {
          practice,
          dueSections,
          missedDueSections,
          overdueSections: isToday ? overdueSections : [],
          isPast,
          isToday,
          cellDate,
          dayStatus,
          hist,
        });
      });
    } else {
      cell.disabled = true;
    }

    grid.appendChild(cell);
  }
}

function renderDayDetail(dayKey, ctx) {
  const panel = document.getElementById('dayDetailPanel');
  if (!panel) return;

  const {
    practice,
    dueSections,
    missedDueSections,
    overdueSections,
    isPast,
    isToday,
    cellDate,
  } = ctx;

  const hasPractice = practice && practice.sessions.length > 0;
  const hasMissed = isPast && missedDueSections.length > 0;
  const hasDue =
    (!isPast && dueSections.length > 0) ||
    (isToday && overdueSections.length > 0);

  if (!hasPractice && !hasDue && !hasMissed) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }

  panel.classList.remove('hidden');

  const dateLabel = cellDate.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  let html = `
    <div class="day-detail-header">
      <div class="day-detail-title">${escapeHtml(dateLabel)}</div>
      <button class="day-detail-close" id="btnCloseDayDetail"
              title="Close">✕</button>
    </div>`;

  if (hasPractice) {
    html += `
      <div class="day-detail-section">
        <div class="day-detail-label">
          Completed · ${practice.sessions.length} session${
            practice.sessions.length !== 1 ? 's' : ''
          } · ${formatDuration(practice.totalSeconds)}
        </div>
        <div class="day-detail-list">`;

    const sorted = [...practice.sessions].sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );

    sorted.forEach((s) => {
      const isFree =
        s.sessionOutcome === 'FreePractice' ||
        s.sectionId === 'free-practice';
      const pieceTitle = isFree
        ? '🎹 Free Practice'
        : escapeHtml(s.pieceTitle || 'Unknown');
      const sectionName = isFree
        ? ''
        : escapeHtml(s.sectionName || s.section || '');
      const duration = formatDuration(s.duration || 0);
      const typeLabel =
        s.type === 'analysis' && !isFree ? 'Analysis' : 'Training';

      html += `
        <div class="day-detail-item">
          <div class="day-detail-item-main">
            <span class="day-detail-piece">${pieceTitle}</span>
            ${
              sectionName
                ? '<span class="day-detail-section-name">' +
                  sectionName + '</span>'
                : ''
            }
          </div>
          <div class="day-detail-item-meta">
            <span class="day-detail-pill">${duration}</span>
            <span class="day-detail-pill muted">${
              isFree ? 'Free' : typeLabel
            }</span>
          </div>
        </div>`;
    });

    html += `</div></div>`;
  }

  if (hasMissed) {
    html += `
      <div class="day-detail-section">
        <div class="day-detail-label">
          Not completed on this day · ${
            missedDueSections.length
          } section${
            missedDueSections.length !== 1 ? 's' : ''
          }${
            ctx.hist
              ? ' (of ' + ctx.hist.dueCount + ' planned)'
              : ''
          }
        </div>
        <div class="day-detail-list">`;

    missedDueSections.forEach((s) => {
      html += buildDueDetailItem(s, true);
    });

    html += `</div></div>`;
  }

  if (hasDue) {
    html += `
      <div class="day-detail-section">
        <div class="day-detail-label">Planned</div>
        <div class="day-detail-list">`;

    if (isToday && overdueSections.length > 0) {
      overdueSections.forEach((s) => {
        html += buildDueDetailItem(s, true);
      });
    }

    dueSections.forEach((s) => {
      html += buildDueDetailItem(s, false);
    });

    html += `</div></div>`;
  }

  panel.innerHTML = html;

  panel.querySelector('#btnCloseDayDetail')
    ?.addEventListener('click', () => {
      selectedDayKey = null;
      clearDayDetail();
      document.querySelectorAll('.month-day.selected')
        .forEach((el) => el.classList.remove('selected'));
    });

  panel.querySelectorAll('.day-detail-practice-btn')
    .forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sectionId = btn.dataset.id;
        const section = allSections.find((s) => s.id === sectionId);
        if (!section) return;
        const params = new URLSearchParams({
          section: section.id,
          currentBpm: section.currentBpm || 60,
          targetBpm: section.targetBpm || 100,
        });
        window.location.href =
          'practice-session.html?' + params.toString();
      });
    });
}

function buildDueDetailItem(section, isOverdue) {
  const piece = allPieces.find((p) => p.id === section.pieceId);
  const pieceTitle = escapeHtml(
    piece?.title || section.title || 'Unknown',
  );
  const sectionName = escapeHtml(
    section.section || section.barRange || 'Unnamed section',
  );

  return `
    <div class="day-detail-item${
      isOverdue ? ' overdue' : ''
    }">
      <div class="day-detail-item-main">
        <span class="day-detail-piece">${pieceTitle}</span>
        <span class="day-detail-section-name">${sectionName}</span>
      </div>
      <div class="day-detail-item-meta">
        ${
          isOverdue
            ? '<span class="day-detail-pill warn">Overdue</span>'
            : ''
        }
        <button class="day-detail-practice-btn"
                data-id="${section.id}" title="Practice">▶</button>
      </div>
    </div>`;
}

// ── Schedule item (list view) ──

function createScheduleItem(section, itemClass, today) {
  const piece = allPieces.find((p) => p.id === section.pieceId);
  const pieceTitle = piece?.title || section.title || 'Unknown';

  const comfortPct = Math.round(
    (1 - (section.difficulty || 0.3)) * 100,
  );
  let pillClass = 'green';
  if (comfortPct < 40) pillClass = 'red';
  else if (comfortPct < 70) pillClass = 'orange';

  const stability = Math.round((section.stability || 1) * 10) / 10;
  const bpmText = formatBpm(section);

  const item = document.createElement('div');
  item.className = 'schedule-item ' + itemClass;

  item.innerHTML = `
    <div class="schedule-item-piece">
      ${escapeHtml(pieceTitle)}
    </div>
    <div class="schedule-item-section">
      ${escapeHtml(
        section.section || section.barRange || 'Unnamed section',
      )}
    </div>
    <div class="schedule-item-meta">
      <span class="schedule-meta-pill ${pillClass}">
        ${comfortPct}%
      </span>
      <span class="schedule-meta-pill">${stability}d</span>
      ${
        bpmText
          ? `<span class="schedule-meta-pill">🎵 ${bpmText}</span>`
          : ''
      }
    </div>
    <button class="schedule-item-practice-btn"
            title="Practice now"
            data-id="${section.id}">▶</button>`;

  item.querySelector('.schedule-item-practice-btn')
    .addEventListener('click', (e) => {
      e.stopPropagation();
      const params = new URLSearchParams({
        section: section.id,
        currentBpm: section.currentBpm || 60,
        targetBpm: section.targetBpm || 100,
      });
      window.location.href =
        'practice-session.html?' + params.toString();
    });

  return item;
}

// ── Events ──

function bindEvents() {
  document.querySelectorAll('.view-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      currentView = tab.dataset.view;
      if (currentView === 'month') {
        selectedDayKey = null;
        clearDayDetail();
      }
      renderAll();
      log('UI', 'schedule view changed', { view: currentView });
    });
  });

  document.querySelectorAll('.weeks-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.weeks-btn')
        .forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentWeeks = parseInt(btn.dataset.weeks, 10);
      renderListView();
      log('UI', 'schedule period changed', { weeks: currentWeeks });
    });
  });

  document.getElementById('btnMonthPrev')
    ?.addEventListener('click', () => {
      currentMonthIndex--;
      if (currentMonthIndex < 0) {
        currentMonthIndex = 11;
        currentMonthYear--;
      }
      selectedDayKey = null;
      clearDayDetail();
      renderAll();
    });

  document.getElementById('btnMonthNext')
    ?.addEventListener('click', () => {
      currentMonthIndex++;
      if (currentMonthIndex > 11) {
        currentMonthIndex = 0;
        currentMonthYear++;
      }
      selectedDayKey = null;
      clearDayDetail();
      renderAll();
    });

  document.getElementById('btnMonthToday')
    ?.addEventListener('click', () => {
      const today = getTodayLocal();
      currentMonthYear = today.getFullYear();
      currentMonthIndex = today.getMonth();
      selectedDayKey = dateKeyFromDate(today);
      renderAll();
      const data = buildMonthData();
      const key = selectedDayKey;
      const practice = data.sessionsByDay.get(key);
      const dueSections = data.dueByDay.get(key) || [];
      renderDayDetail(key, {
        practice,
        dueSections,
        missedDueSections: data.historicalDayMap.get(key)?.missedSections || [],
        overdueSections: data.overdueSections,
        isPast: false,
        isToday: true,
        cellDate: today,
        dayStatus: getDayStatus({
          isPast: false,
          isToday: true,
          practicedCount: practice
            ? countPracticedSections(practice.sessions)
            : 0,
          missedCount: 0,
          dueCount:
            (data.dueByDay.get(key) || []).length +
            data.overdueSections.length,
        }),
        hist: data.historicalDayMap.get(key),
      });
    });
}

function clearDayDetail() {
  const panel = document.getElementById('dayDetailPanel');
  if (panel) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
  }
}
