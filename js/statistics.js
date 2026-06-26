/**
 * ModusPractica Pro
 * 
 * Copyright (C) 2026 Frank De Baere. All rights reserved.
 * 
 * This program is dual-licensed:
 * 1. Open Source: You can redistribute it and/or modify it under the terms of 
 *    the GNU General Public License as published by the Free Software Foundation, 
 *    either version 3 of the License, or (at your option) any later version.
 * 
 * 2. Commercial: Use, modification, or distribution of this software for 
 *    commercial purposes or integration into proprietary systems is strictly 
 *    prohibited without a prior written commercial license agreement from the author.
 * 
 * For commercial licensing inquiries, please contact: info@parturamusic.be
 */
import './errors.js';
import { db } from './db.js';
import { formatDuration, escapeHtml, isSectionInPlanning } from './utils.js';
import { DialogService } from './dialog.js';
import { log } from './logger.js';

// ── State ──
let currentRange = 'week';
let allSessions = [];
let allSections = [];
let allPieces = [];

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await db.init();
  await loadData();
  bindEvents();
});

async function loadData() {
  allSessions = await db.getAllSessions();
  allSections = await db.getAllSections();
  allPieces = await db.getAllPieces();
  renderAll();
  log('NAV', 'statistics loaded', {
    sessions: allSessions.length,
    sections: allSections.length,
    pieces: allPieces.length
  });
}

function renderAll() {
  const filtered = filterSessionsByRange(
    allSessions, currentRange
  );
  renderSummaryCards(filtered);
  renderBarChart(filtered);
  renderStabilityDist();
  renderPiecesStats();
}

// ── Range filter ──
function filterSessionsByRange(sessions, range) {
  const now = new Date();

  if (range === 'week') {
    const monday = new Date(now);
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return sessions.filter(
      s => new Date(s.date) >= monday
    );
  }

  if (range === 'month') {
    // Eerste dag van de huidige kalendermaand
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0, 0, 0, 0
    );
    return sessions.filter(
      s => new Date(s.date) >= start
    );
  }

  if (range === 'year') {
    // Eerste dag van het huidige kalenderjaar
    const start = new Date(
      now.getFullYear(),
      0,
      1,
      0, 0, 0, 0
    );
    return sessions.filter(
      s => new Date(s.date) >= start
    );
  }

  if (range === 'alltime') {
    return sessions;
  }

  return sessions;
}

// ── Summary cards ──
function renderSummaryCards(sessions) {
  const training = sessions.filter(
    s => s.type !== 'analysis'
  );
  const freePractice = sessions.filter(
    s => s.type === 'analysis' &&
         s.sessionOutcome === 'FreePractice'
  );
  const analysis = sessions.filter(
    s => s.type === 'analysis' &&
         s.sessionOutcome !== 'FreePractice'
  );

  const totalSeconds = sessions.reduce(
    (sum, s) => sum + (s.duration || 0), 0
  );
  const trainingSeconds = training.reduce(
    (sum, s) => sum + (s.duration || 0), 0
  );

  document.getElementById('statTotalTime')
    .textContent = formatDuration(totalSeconds);
  document.getElementById('statTrainingTime')
    .textContent = formatDuration(trainingSeconds) +
      ' training';

  // Bereken ook de Free Practice tijd apart
  const freePracticeSeconds = freePractice.reduce(
    (sum, s) => sum + (s.duration || 0), 0
  );

  document.getElementById('statSessions')
    .textContent = sessions.length;

  // Bouw de sub-tekst op afhankelijk van wat aanwezig is
  let sessionsSub = training.length + ' training';
  if (analysis.length > 0) {
    sessionsSub += ' · ' + analysis.length + ' analysis';
  }
  if (freePractice.length > 0) {
    sessionsSub += ' · ' + freePractice.length +
      ' free practice (' +
      formatDuration(freePracticeSeconds) + ')';
  }
  document.getElementById('statSessionsSub')
    .textContent = sessionsSub;

  let totalCorrect = 0;
  let totalAttempts = 0;
  let frustrationCount = 0;

  training.forEach(s => {
    const correct = s.correctRepetitions || 0;
    const failed = s.failedAttempts || 0;
    totalCorrect += correct;
    totalAttempts += correct + failed;
    if (s.sessionOutcome === 'FrustrationGuard' ||
        (s.feedback &&
         s.feedback.includes('FrustrationGuard'))) {
      frustrationCount++;
    }
  });

  const successRate = totalAttempts > 0
    ? Math.round((totalCorrect / totalAttempts) * 100) + '%'
    : '—';

  document.getElementById('statSuccessRate')
    .textContent = successRate;
  document.getElementById('statFrustration')
    .textContent = frustrationCount;

  const yearAverageEl = document.getElementById('statYearAverageTime');
  if (yearAverageEl) {
    const yearAverage = calculateYearDailyAverage(allSessions);
    yearAverageEl.textContent = yearAverage !== null
      ? formatDuration(yearAverage)
      : '—';
  }
}

function calculateYearDailyAverage(sessions) {
  const now = new Date();
  const yearStart = new Date(
    now.getFullYear(),
    0,
    1,
    0, 0, 0, 0
  );
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0, 0, 0, 0
  );

  const sessionsThisYear = sessions
    .map(s => ({
      ...s,
      sessionDate: new Date(s.date),
    }))
    .filter(s =>
      !isNaN(s.sessionDate) &&
      s.sessionDate >= yearStart &&
      s.sessionDate <= now
    );

  if (sessionsThisYear.length === 0) {
    return null;
  }

  const firstSessionDay = sessionsThisYear
    .reduce((earliest, s) => {
      const d = new Date(
        s.sessionDate.getFullYear(),
        s.sessionDate.getMonth(),
        s.sessionDate.getDate(),
        0, 0, 0, 0
      );
      return d < earliest ? d : earliest;
    }, today);

  const dayCount = Math.max(
    1,
    Math.floor((today - firstSessionDay) / 86400000) + 1
  );
  const totalSeconds = sessionsThisYear.reduce(
    (sum, s) => sum + (s.duration || 0), 0
  );

  return Math.round(totalSeconds / dayCount);
}

// ── Bar chart ──
function renderBarChart(sessions) {
  const container = document.getElementById('barChart');
  container.innerHTML = '';

  const buckets = buildTimeBuckets(currentRange);

  sessions.forEach(s => {
    const bucket = findBucket(s, buckets, currentRange);
    if (!bucket) return;
    const dur = s.duration || 0;
    const isFree = s.sessionOutcome === 'FreePractice' ||
                   s.outcome === 'FreePractice' ||
                   (s.type === 'analysis' &&
                    s.sectionId === 'free-practice');
    if (isFree) {
      bucket.freePracticeSeconds += dur;
    } else if (s.type === 'analysis') {
      bucket.analysisSeconds += dur;
    } else {
      bucket.trainingSeconds += dur;
    }
    bucket.totalSeconds += dur;
  });

  const maxVal = Math.max(
    ...buckets.map(b => b.totalSeconds), 1
  );
  const tooltip = document.getElementById('chartTooltip');

  buckets.forEach(bucket => {
    const heightPct = bucket.totalSeconds > 0
      ? (bucket.totalSeconds / maxVal) * 100
      : 0;

    const group = document.createElement('div');
    group.className = 'bar-group';

    const valueLabel = bucket.totalSeconds > 0
      ? formatDuration(bucket.totalSeconds)
      : '';

    const trainingPct = bucket.totalSeconds > 0
      ? (bucket.trainingSeconds /
         bucket.totalSeconds) * 100
      : 0;
    const analysisPct = bucket.totalSeconds > 0
      ? (bucket.analysisSeconds /
         bucket.totalSeconds) * 100
      : 0;
    const freePracticePct = bucket.totalSeconds > 0
      ? (bucket.freePracticeSeconds /
         bucket.totalSeconds) * 100
      : 0;

    group.innerHTML = `
      <div class="bar-value">${valueLabel}</div>
      <div class="bar-stack"
           style="height: ${Math.max(heightPct, 2)}%;">
        <div class="bar-segment-free-practice"
             style="height: ${freePracticePct}%;"></div>
        <div class="bar-segment-analysis"
             style="height: ${analysisPct}%;"></div>
        <div class="bar-segment-training"
             style="height: ${trainingPct}%;"></div>
      </div>
      <div class="bar-label">${bucket.label}</div>
    `;

    const barEl = group.querySelector('.bar-stack');
    barEl.addEventListener('mouseenter', () => {
      let breakdown =
        '🔵 Training: ' +
          formatDuration(bucket.trainingSeconds) +
          '<br>' +
        '🟠 Analysis: ' +
          formatDuration(bucket.analysisSeconds);
      if (bucket.freePracticeSeconds > 0) {
        breakdown +=
          '<br>🟢 Free Practice: ' +
          formatDuration(bucket.freePracticeSeconds);
      }
      tooltip.innerHTML =
        '<strong>' + bucket.label + '</strong><br>' +
        'Totaal: ' + formatDuration(bucket.totalSeconds) +
        '<br><br>' + breakdown;
      tooltip.style.display = 'block';
    });
    barEl.addEventListener('mousemove', (e) => {
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top = (e.clientY + 12) + 'px';
    });
    barEl.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });

    container.appendChild(group);
  });
}

function buildTimeBuckets(range) {
  const now = new Date();
  const buckets = [];

  if (range === 'week') {
    // Ma t/m zo van de huidige week
    const monday = new Date(now);
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      buckets.push({
        key: d.toDateString(),
        label: d.toLocaleDateString(undefined, {
          weekday: 'short',
          day: 'numeric',
        }),
        date: d,
        totalSeconds: 0,
        trainingSeconds: 0,
        analysisSeconds: 0,
        freePracticeSeconds: 0,
      });
    }
  }

  else if (range === 'month') {
    // Alle dagen van de huidige kalendermaand
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      buckets.push({
        key: d.toDateString(),
        label: String(day),
        date: d,
        totalSeconds: 0,
        trainingSeconds: 0,
        analysisSeconds: 0,
        freePracticeSeconds: 0,
      });
    }
  }

  else if (range === 'year') {
    // Alle 12 maanden van het huidige kalenderjaar
    const year = now.getFullYear();
    for (let m = 0; m < 12; m++) {
      const d = new Date(year, m, 1);
      buckets.push({
        key: year + '-' + m,
        label: d.toLocaleDateString(undefined, {
          month: 'short',
        }),
        month: m,
        year: year,
        totalSeconds: 0,
        trainingSeconds: 0,
        analysisSeconds: 0,
        freePracticeSeconds: 0,
      });
    }
  }

  else if (range === 'alltime') {
    // Één gecumuleerde balk voor alle sessies
    buckets.push({
      key: 'alltime',
      label: 'All Time',
      totalSeconds: 0,
      trainingSeconds: 0,
      analysisSeconds: 0,
      freePracticeSeconds: 0,
    });
  }

  return buckets;
}

function findBucket(session, buckets, range) {
  const d = new Date(session.date);

  if (range === 'week') {
    const key = d.toDateString();
    return buckets.find(b => b.key === key) || null;
  }

  if (range === 'month') {
    const key = new Date(
      d.getFullYear(), d.getMonth(), d.getDate()
    ).toDateString();
    return buckets.find(b => b.key === key) || null;
  }

  if (range === 'year') {
    return buckets.find(
      b => b.year === d.getFullYear() &&
           b.month === d.getMonth()
    ) || null;
  }

  if (range === 'alltime') {
    // Alle sessies gaan naar de ene balk
    return buckets[0] || null;
  }

  return null;
}

function planningSections() {
  const pieceById = new Map(allPieces.map((p) => [p.id, p]));
  return allSections.filter((s) => isSectionInPlanning(s, pieceById));
}

// ── Stability distribution ──
function renderStabilityDist() {
  const active = planningSections();

  let d1 = 0, d2 = 0, d3 = 0, d4 = 0;
  active.forEach(s => {
    const st = s.stability || 1;
    if (st <= 3) d1++;
    else if (st <= 7) d2++;
    else if (st <= 30) d3++;
    else d4++;
  });

  document.getElementById('dist1to3').textContent = d1;
  document.getElementById('dist4to7').textContent = d2;
  document.getElementById('dist8to30').textContent = d3;
  document.getElementById('dist30plus').textContent = d4;
}

// ── Stuk statistieken ──
function renderPiecesStats() {
  const tbody = document.getElementById('piecesStatsBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Bouw een lookup van pieceId naar stuk-titel
  // via de secties (secties bevatten pieceId)
  const pieceIdToTitle = new Map();
  allSections.forEach(s => {
    if (s.pieceId && s.title) {
      pieceIdToTitle.set(s.pieceId, s.title);
    }
  });

  // Groepeer sessies op pieceId indien beschikbaar,
  // val terug op pieceTitle voor legacy sessies
  const filteredSessions = filterSessionsByRange(
    allSessions, currentRange
  );
  const pieceMap = new Map();

  filteredSessions.forEach(s => {
    const key = s.pieceId || s.pieceTitle || 'Unknown';
    if (!pieceMap.has(key)) {
      const title = s.pieceId
        ? (pieceIdToTitle.get(s.pieceId) || s.pieceTitle || 'Unknown')
        : (s.pieceTitle || 'Unknown');
      pieceMap.set(key, {
        pieceId: s.pieceId || null,
        title,
        totalSeconds: 0,
        sessions: 0,
      });
    }
    const entry = pieceMap.get(key);
    entry.totalSeconds += s.duration || 0;
    entry.sessions++;
  });

  // Filter op actieve stukken via pieceId of titel
  const activePieceIds = new Set(
    allSections
      .filter(s => !s.archived)
      .map(s => s.pieceId)
      .filter(Boolean)
  );
  const activePieceTitles = new Set(
    allSections
      .filter(s => !s.archived)
      .map(s => s.title)
  );

  const rows = [...pieceMap.values()]
    .filter(p =>
      (p.pieceId && activePieceIds.has(p.pieceId)) ||
      (!p.pieceId && activePieceTitles.has(p.title))
    )
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4"
            style="text-align:center;
                   color:var(--text-muted);
                   padding: 24px;">
          No practice data yet.
        </td>
      </tr>`;
    return;
  }

  rows.forEach(row => {
    const avg = row.sessions > 0
      ? Math.round(row.totalSeconds / row.sessions)
      : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.title)}</td>
      <td class="right">
        ${formatDuration(row.totalSeconds)}
      </td>
      <td class="right">${row.sessions}</td>
      <td class="right">${formatDuration(avg)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Voeg Free Practice toe als aparte rij indien aanwezig
  const filteredForFree = filterSessionsByRange(
    allSessions, currentRange
  );
  const fpSessions = filteredForFree.filter(
    s => s.sessionOutcome === 'FreePractice'
  );
  if (fpSessions.length > 0) {
    const fpSeconds = fpSessions.reduce(
      (sum, s) => sum + (s.duration || 0), 0
    );
    const fpAvg = Math.round(fpSeconds / fpSessions.length);
    const fpRow = document.createElement('tr');
    fpRow.style.cssText =
      'color: var(--text-muted); font-style: italic;';
    fpRow.innerHTML =
      '<td>🎹 Free Practice</td>' +
      '<td class="right">' +
        formatDuration(fpSeconds) + '</td>' +
      '<td class="right">' + fpSessions.length + '</td>' +
      '<td class="right">' +
        formatDuration(fpAvg) + '</td>';
    tbody.appendChild(fpRow);
  }
}

// ── AI Rapport ──
function buildAnalyticsPayload(sections, sessions, range) {
  const now = new Date();
  const filtered = filterSessionsByRange(sessions, range);
  const pieceById = new Map(allPieces.map((p) => [p.id, p]));
  const active = sections.filter((s) => isSectionInPlanning(s, pieceById));
  const overdue = active.filter(
    s => new Date(s.nextPracticeDate) < now
  );

  const training = filtered.filter(
    s => s.type !== 'analysis'
  );
  const analysis = filtered.filter(
    s => s.type === 'analysis'
  );

  let totalCorrect = 0;
  let totalFailed = 0;
  let frustrationCount = 0;

  training.forEach(s => {
    totalCorrect += s.correctRepetitions || 0;
    totalFailed += s.failedAttempts || 0;
    if (s.sessionOutcome === 'FrustrationGuard' ||
        (s.feedback &&
         s.feedback.includes('FrustrationGuard'))) {
      frustrationCount++;
    }
  });

  const totalReps = totalCorrect + totalFailed;
  const successRate = totalReps > 0
    ? Math.round((totalCorrect / totalReps) * 100) + '%'
    : 'no data';

  const tempoByPiece = {};
  active.forEach(s => {
    if (!tempoByPiece[s.title]) {
      tempoByPiece[s.title] = { sections: [] };
    }
    const bpmPct = s.targetBpm > 0
      ? Math.round((s.currentBpm / s.targetBpm) * 100)
      : 100;
    tempoByPiece[s.title].sections.push({
      section: s.section || s.barRange,
      currentBpm: s.currentBpm,
      targetBpm: s.targetBpm,
      bpmProgress: bpmPct + '%',
      stability: Math.round(s.stability * 10) / 10,
      difficulty: Math.round(s.difficulty * 100) / 100,
      initialDaysDone: s.initialDaysDone || 0,
      overdue: new Date(s.nextPracticeDate) < now,
    });
  });

  const stabilityBuckets = {
    '1-3d': 0, '4-7d': 0, '8-30d': 0, '30d+': 0
  };
  active.forEach(s => {
    const st = s.stability || 1;
    if (st <= 3) stabilityBuckets['1-3d']++;
    else if (st <= 7) stabilityBuckets['4-7d']++;
    else if (st <= 30) stabilityBuckets['8-30d']++;
    else stabilityBuckets['30d+']++;
  });

  const neglected = [...overdue]
    .sort((a, b) =>
      new Date(a.nextPracticeDate) -
      new Date(b.nextPracticeDate)
    )
    .slice(0, 5)
    .map(s => ({
      title: s.title,
      section: s.section || s.barRange,
      overdueDays: Math.round(
        (now - new Date(s.nextPracticeDate)) / 86400000
      ),
      stability: Math.round(s.stability * 10) / 10,
    }));

  // Secties nog in acquisitie (initialDaysDone < 3)
  const acquisitionSections = active
    .filter(s => (s.initialDaysDone || 0) < 3)
    .map(s => ({
      title: s.title,
      section: s.section || s.barRange,
      initialDaysDone: s.initialDaysDone || 0,
      lastPracticeDate: s.lastPracticeDate || null,
      daysSinceLastPractice: s.lastPracticeDate
        ? Math.floor(
            (now - new Date(s.lastPracticeDate)) / 86400000
          )
        : null,
    }));

  // Entry cost trend per sectie (laatste 5 sessies)
  const entryCostTrend = {};
  active.forEach(s => {
    const sectionSessions = sessions
      .filter(x =>
        x.sectionId === s.id &&
        x.entryCost !== null &&
        x.entryCost !== undefined
      )
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-5);
    if (sectionSessions.length >= 2) {
      entryCostTrend[
        s.title + ' / ' + (s.section || s.barRange)
      ] = sectionSessions.map(x => x.entryCost);
    }
  });

  // Difficulty trend per sectie (laatste 5 sessies)
  const difficultyTrend = {};
  active.forEach(s => {
    const sectionSessions = sessions
      .filter(x =>
        x.sectionId === s.id &&
        x.difficulty !== undefined
      )
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-5);
    if (sectionSessions.length >= 2) {
      difficultyTrend[
        s.title + ' / ' + (s.section || s.barRange)
      ] = sectionSessions.map(x =>
        Math.round(x.difficulty * 100) / 100
      );
    }
  });

  return {
    analysisRange: range,
    systemDate: now.toISOString(),
    repertoireOverview: {
      activeSections: active.length,
      overdueSections: overdue.length,
    },
    sessionSummary: {
      totalTrainingSessions: training.length,
      totalAnalysisSessions: analysis.length,
      totalTrainingMinutes: Math.round(
        training.reduce(
          (s, x) => s + (x.duration || 0), 0
        ) / 60
      ),
      successRate,
      totalCorrectReps: totalCorrect,
      totalFailedReps: totalFailed,
      frustrationGuardCount: frustrationCount,
    },
    stabilityDistribution: stabilityBuckets,
    neglectedSections: neglected,
    tempoProgressByPiece: tempoByPiece,
    acquisitionSections,
    entryCostTrend,
    difficultyTrend,
  };
}

async function generateAIReport() {
  const apiKey = sessionStorage.getItem('mp_groq_key') ||
    localStorage.getItem('mp_groq_key');
  if (!apiKey) {
    await DialogService.alert(
      'Please save your Groq API key in Settings first.',
      'warning'
    );
    return;
  }

  const btn = document.getElementById('btnGenerateReport');
  const spinner = document.getElementById('aiSpinner');
  const output = document.getElementById('aiReportOutput');

  btn.disabled = true;
  btn.textContent = '⌛ Analysing...';
  spinner.classList.add('active');
  output.classList.remove('visible');

  try {
    const sections = await db.getAllSections();
    const sessions = await db.getAllSessions();
    const payload = buildAnalyticsPayload(
      sections, sessions, currentRange
    );

    log('UI', 'AI report requested', {
      range: currentRange,
      sessionCount: sessions.length,
      sectionCount: sections.length
    });

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content:
                'You are the built-in AI analyst of ' +
                'ModusPractica Pro, an intelligent ' +
                'practice planner for pianists based ' +
                'on spaced repetition (FSRS model, ' +
                'Ye et al. 2022).\n\n' +
                'You receive structured JSON data ' +
                'extracted from the user\'s local ' +
                'practice database. Your task is to ' +
                'analyse this data critically and ' +
                'produce a concise, actionable report ' +
                'addressed directly to the pianist.\n\n' +
                'Rules:\n' +
                '- Base every observation strictly on ' +
                'the provided data. Do not invent ' +
                'trends, assume causes, or speculate ' +
                'beyond what the numbers show.\n' +
                '- Do not give medical, physiological, ' +
                'or psychological advice.\n' +
                '- Do not comment on data that is ' +
                'absent — if a metric has no data, ' +
                'skip it.\n' +
                '- Use Markdown. No pleasantries, ' +
                'no filler sentences.\n' +
                '- End with exactly 3 concrete action ' +
                'points for the next practice session, ' +
                'ranked by priority.\n' +
                '- If the data is insufficient for ' +
                'meaningful analysis (fewer than ' +
                '3 sessions), say so in one sentence ' +
                'and stop.',
            },
            {
              role: 'user',
              content:
                'Here is my practice data for the ' +
                'period: ' + currentRange + '\n' +
                'Today: ' + new Date().toISOString() +
                '\n\n' +
                JSON.stringify(payload, null, 2) +
                '\n\n' +
                'Key for interpretation:\n' +
                '- stability: days until next ' +
                'scheduled practice (FSRS model)\n' +
                '- difficulty: 0–1, higher = harder ' +
                'for this pianist personally\n' +
                '- initialDaysDone: 0–2 = still in ' +
                'acquisition phase (first 2 days), ' +
                '3 = in spaced repetition cycle\n' +
                '- successRate: correct / total ' +
                'attempts in this period\n' +
                '- entryCostTrend: failed attempts ' +
                'before first correct rep, per ' +
                'session — decreasing = genuine ' +
                'motor consolidation\n' +
                '- difficultyTrend: difficulty ' +
                'evolution per section — decreasing ' +
                '= improving\n\n' +
                'Analyse the data. Focus on:\n' +
                '1. Practice efficiency: success ' +
                'rate, frustration events, entry ' +
                'cost trend where available\n' +
                '2. Tempo progression per piece: ' +
                'which sections are progressing, ' +
                'which are stalled\n' +
                '3. Sections still in acquisition ' +
                '(initialDaysDone < 3) not practiced ' +
                'in 2+ days\n' +
                '4. Overdue or neglected sections ' +
                'and their memory decay risk\n' +
                '5. Stability distribution: are most ' +
                'sections fragile (1–3d) or ' +
                'consolidating (8d+)?',
            },
          ],
          temperature: 0.2,
          max_tokens: 1200,
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Groq API Error: ' + response.status);
    }

    const result = await response.json();
    const markdown = result.choices[0].message.content;

    output.innerHTML = typeof marked !== 'undefined'
      ? marked.parse(markdown)
      : markdown.replace(/\n/g, '<br>');

    output.classList.add('visible');

  } catch (err) {
    console.error('AI Report error:', err);
    log('ERROR', 'AI report failed', {
      message: err.message
    });
    output.innerHTML =
      '<span style="color:var(--danger);">' +
      'Report failed: ' + err.message +
      '. Check your API key and internet connection.' +
      '</span>';
    output.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate AI Report';
    spinner.classList.remove('active');
  }
}

// ── Events ──
function bindEvents() {
  document.querySelectorAll('.range-btn')
    .forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.range-btn')
          .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRange = btn.dataset.range;
        renderAll();
      });
    });

  document.getElementById('btnGenerateReport')
    .addEventListener('click', generateAIReport);

  document.getElementById('btnPrintReport')
    ?.addEventListener('click', () => {
      window.open('print-report.html', '_blank');
    });
}
