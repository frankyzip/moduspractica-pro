import './errors.js';
import { db } from './db.js';
import { engine } from './engine.js';
import { DialogService } from './dialog.js';
import { getTodayLocal, toDateOnly, generateGUID, formatDuration } from './utils.js';
import { log } from './logger.js';

// ════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════

let currentSection = null;
let sectionId = null;

let timerInterval = null;
let startTime = null;
let pausedTime = 0;
let totalElapsedSeconds = 0;
let isRunning = false;
let isManuallyEditing = false;

let failedAttempts = 0;
let correctRepetitions = 0;
let streakResets = 0;
let targetRepetitions = 6;
let selectedPerformance = null;

let errorsBeforeFirstCorrect = 0;
let hasAchievedFirstCorrect = false;
let gebrianTargetLocked = false;
let overlearningIntensity = 100;
let strictGebrianMode = false;
let userManuallySetTarget = false;

let currentEnergy = 'Normal';
let isFreePractice = false;
let isStatsOnlyPiece = false;
let frustrationGuardShown = false;
const FRUSTRATION_SOFT_LIMIT = 5;
const FRUSTRATION_HARD_LIMIT = 8;
let hardLimitReached = false;
let sessionCompleted = false;
let autoSaveInterval = null;
let isSaving = false;
let isSavingEvaluation = false;
let currentSessionTimestamp = '';

let repsSinceLastBreak = 0;
let microBreakActive = false;
let microBreakTimeout = null;
let enableMicroBreaks = true;

let entryCost = null;
// Number of failed attempts before the first correct
// repetition in this session.
// Scientific basis: a decreasing entry cost across
// sessions is an objective indicator of motor memory
// consolidation (Walker et al., 2003).
// Time is deliberately NOT used here — time pressure
// increases cortisol and disrupts the consolidation
// processes this app is designed to support
// (Rosenbaum, 2010).

// ════════════════════════════════════════════════
// INITIALISATIE
// ════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  await db.init();

  const params = new URLSearchParams(window.location.search);
  log('NAV', 'practice-session geladen', { sectionId: params.get('section') });
  sectionId = params.get('section');
  const freeMode = params.get('free') === 'true';

  if (freeMode && !sectionId) {
    // Standalone Free Practice: geen sectie vereist.
    // Maak een anonieme dummy-sectie aan zodat de rest
    // van de code zonder null-fouten verder kan lopen.
    isFreePractice = true;
    sectionId = 'free-practice';
    currentSection = {
      id:              'free-practice',
      pieceId:         null,
      title:           'Free Practice',
      section:         '',
      barRange:        '',
      stability:       1,
      difficulty:      0.3,
      currentBpm:      0,
      targetBpm:       0,
      targetReps:      6,
      initialDaysDone: 0,
      nextPracticeDate: null,
      lastPracticeDate: null,
      consolidated:    false,
    };
  } else {
    if (!sectionId) {
      await DialogService.alert('No section ID provided.');
      window.location.href = 'dashboard.html';
      return;
    }
    currentSection = await db.getSection(sectionId);
    if (!currentSection) {
      await DialogService.alert('Section not found.');
      window.location.href = 'dashboard.html';
      return;
    }
  }

  const urlCurrentBpm = params.get('currentBpm');
  const urlTargetBpm = params.get('targetBpm');
  if (urlCurrentBpm) {
    currentSection.currentBpm =
      parseInt(urlCurrentBpm, 10) || currentSection.currentBpm;
  }
  if (urlTargetBpm) {
    currentSection.targetBpm =
      parseInt(urlTargetBpm, 10) || currentSection.targetBpm;
  }

  if (currentSection.pieceId) {
    const piece = await db.getPiece(currentSection.pieceId);
    if (piece?.title && !currentSection.title) {
      currentSection.title = piece.title;
    }
    if (piece?.statsOnly) {
      isStatsOnlyPiece = true;
      isFreePractice = true;
    }
  }

  entryCost = null;

  targetRepetitions =
    currentSection.targetReps ||
    engine.suggestTargetReps(currentSection.stability || 1);

  await renderSessionInfo();
  loadDraft();

  if (
    freeMode &&
    sectionId &&
    sectionId !== 'free-practice' &&
    !isFreePractice
  ) {
    await tryEnterAnalysisMode();
  }

  startAutoSave();
});

// ════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════

async function renderSessionInfo() {
  // In standalone Free Practice: pas de topbar aan en
  // verberg irrelevante panelen (tellers, planning, tempo).
  if (isFreePractice && sectionId === 'free-practice') {
    document.getElementById('topbarPiece').textContent = 'Free Practice';
    document.getElementById('topbarSection').textContent = '';
    const zoneEl = document.getElementById('topbarZone');
    if (zoneEl) zoneEl.textContent = 'FREE';

    // Verberg de teller-panelen en de planning preview
    // (niet relevant zonder gekoppelde sectie).
    const sessionBody = document.querySelector('.session-body');
    if (sessionBody) {
      // Verberg Practice Metrics paneel
      const panels = sessionBody.querySelectorAll('.session-panel');
      panels.forEach(p => {
        const title = p.querySelector('.panel-title');
        if (title && (
          title.textContent.trim() === 'Practice Metrics' ||
          title.textContent.trim() === 'Live Planning Preview' ||
          title.textContent.trim() === 'Tempo'
        )) {
          p.style.display = 'none';
        }
      });
    }

    // Activeer de Free Practice visuele stijl direct
    document.getElementById('sessionPage')
      .classList.add('free-practice-active');

    // Markeer de Analysis-knop als actief
    const btn = document.getElementById('btnFreePractice');
    if (btn) {
      btn.textContent = '🔍 Free Practice Active';
      btn.disabled = true;
    }

    // Schakel de Complete-knop in (geen tellers nodig)
    const completeBtn = document.getElementById('btnComplete');
    if (completeBtn) completeBtn.disabled = false;

    return; // Sla de rest van renderSessionInfo over
  }

  document.getElementById('topbarPiece').textContent =
    currentSection.title || 'Unknown Piece';
  document.getElementById('topbarSection').textContent =
    currentSection.section || currentSection.barRange || '';
  document.getElementById('topbarZone').textContent =
    getMemoryZone(currentSection);

  const hardStopMsg = document.getElementById('hardStopMessage');
  if (hardStopMsg) {
    hardStopMsg.innerHTML =
      'You have reached ' +
      FRUSTRATION_HARD_LIMIT +
      ' failures or resets.<br>' +
      'This section is currently too difficult. ' +
      'To succeed, try a slower tempo or divide the ' +
      'passage into smaller fragments.';
  }

  const hardStopBpm = document.getElementById('hardStopBpm');
  if (hardStopBpm) {
    hardStopBpm.textContent =
      (currentSection.currentBpm || 60) + ' BPM → ' +
      'try ' +
      Math.round((currentSection.currentBpm || 60) * 0.75) +
      ' BPM or lower';
  }

  const targetTempoEl = document.getElementById('targetTempo');
  const achievedTempoEl = document.getElementById('achievedTempo');
  if (targetTempoEl) {
    targetTempoEl.value = currentSection.targetBpm || 100;
  }
  if (achievedTempoEl) {
    achievedTempoEl.value = currentSection.currentBpm || 60;
  }

  const prevNotes = await db.getPreviousNotes(sectionId);
  const prevEl = document.getElementById('prevNotes');
  if (prevEl) {
    prevEl.textContent =
      prevNotes || 'No previous notes for this section.';
  }

  initSessionNotes();
  updateLiveStatus(currentSection);

  if (isStatsOnlyPiece) {
    applyStatsOnlySessionUI();
  }

  document.getElementById('targetReps').textContent = targetRepetitions;

  await showTempoSuggestion();
  updateTrackingMetrics();
  updateButtonStates();
}

function getMemoryZone(section) {
  if (isStatsOnlyPiece) return 'TRACKING';
  if (section.consolidated) return 'MASTERY';
  const d = Number(section.initialDaysDone) || 0;
  if (d >= 3) return 'CONSOLIDATION';
  if (d >= 1) return 'EXPLORATION';
  return 'EXPLORATION';
}

/** Analyse alleen tijdens acquisitiefase (initialDaysDone < 3). */
function canUseSectionAnalysis(section) {
  if (!section || section.id === 'free-practice') return false;
  if (isStatsOnlyPiece) return true;
  return (Number(section.initialDaysDone) || 0) < 3;
}

const ANALYSIS_LOCKED_TOOLTIP =
  'Analysis is only available during the initial learning ' +
  'phase (Exploration). Use the training counter for ' +
  'consolidated sections.';

function enterAnalysisModeUI() {
  isFreePractice = true;
  document
    .getElementById('sessionPage')
    .classList.add('free-practice-active');
  const btn = document.getElementById('btnFreePractice');
  if (btn) {
    btn.textContent = '🔍 Analysis Active';
    btn.disabled = true;
    btn.title = '';
  }
  const completeBtn = document.getElementById('btnComplete');
  if (completeBtn) completeBtn.disabled = false;
  updateButtonStates();
}

async function tryEnterAnalysisMode({ alertIfBlocked = true } = {}) {
  if (isStatsOnlyPiece) {
    enterAnalysisModeUI();
    return true;
  }
  if (!canUseSectionAnalysis(currentSection)) {
    if (alertIfBlocked) {
      await DialogService.alert(
        'Analysis is only available during the initial ' +
          'learning phase of a section (Exploration).\n\n' +
          'This section is in Consolidation. Use the training ' +
          'counter to register your attempts.',
        'info',
      );
    }
    return false;
  }
  enterAnalysisModeUI();
  return true;
}

async function showTempoSuggestion() {
  const history = await db.getSessionsBySection(sectionId);
  if (!history || history.length === 0) return;

  const withTempo = history
    .filter((s) => s.currentBpm > 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (withTempo.length === 0) return;

  const last = withTempo[0];
  const infoRow = document.getElementById('tempoInfoRow');
  const infoText = document.getElementById('tempoInfoText');

  if (infoRow && infoText) {
    const target = currentSection.targetBpm || 0;
    const suggestion =
      target > 0 && last.currentBpm < target
        ? Math.min(last.currentBpm + 5, target)
        : null;

    infoText.textContent =
      'Last: ' +
      last.currentBpm +
      ' BPM' +
      (suggestion
        ? ' · Try: ' + suggestion + ' BPM'
        : ' · Target reached ✓');
    infoRow.style.display = 'flex';
  }
}

// ════════════════════════════════════════════════
// LIVE STATUS
// ════════════════════════════════════════════════

function updateLiveStatus(section) {
  const stability = section.stability || 1;
  const difficulty = section.difficulty || 0.3;
  const currentBpm = section.currentBpm || 60;
  const targetBpm = section.targetBpm || 100;
  const nextDate = section.nextPracticeDate
    ? toDateOnly(section.nextPracticeDate)
    : null;

  const stEl = document.getElementById('liveStability');
  const stDays = document.getElementById('liveStabilityDays');
  if (stEl) {
    stEl.textContent = Math.round(stability * 10) / 10;
  }
  if (stDays) {
    stDays.textContent = stability >= 2 ? 'days' : 'day';
  }

  const diffEl = document.getElementById('liveDifficulty');
  if (diffEl) {
    const pct = Math.round((1 - difficulty) * 100);
    diffEl.textContent = pct + '%';
    if (difficulty > 0.7) {
      diffEl.style.color = 'var(--danger)';
    } else if (difficulty > 0.4) {
      diffEl.style.color = 'var(--warning)';
    } else {
      diffEl.style.color = 'var(--success)';
    }
  }

  const nextEl = document.getElementById('liveNextDate');
  const nextDaysEl = document.getElementById('liveNextDays');
  if (nextEl && nextDate) {
    nextEl.textContent = nextDate.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
    const today = getTodayLocal();
    const diff = Math.round((nextDate - today) / 86400000);
    if (nextDaysEl) {
      if (diff <= 0) {
        nextDaysEl.textContent = 'due today';
        nextDaysEl.style.color = 'var(--danger)';
      } else if (diff === 1) {
        nextDaysEl.textContent = 'tomorrow';
        nextDaysEl.style.color = 'var(--warning)';
      } else {
        nextDaysEl.textContent = 'in ' + diff + ' days';
        nextDaysEl.style.color = 'var(--success)';
      }
    }
  }

  const tempoEl = document.getElementById('liveTempo');
  const tempoTargetEl = document.getElementById('liveTempoTarget');
  if (tempoEl) {
    tempoEl.textContent = currentBpm + ' BPM';
  }
  if (tempoTargetEl) {
    if (currentBpm >= targetBpm) {
      tempoTargetEl.textContent = '✓ target reached';
      tempoTargetEl.style.color = 'var(--success)';
    } else {
      tempoTargetEl.textContent = 'target: ' + targetBpm + ' BPM';
      tempoTargetEl.style.color = 'var(--text-muted)';
    }
  }
}

// ════════════════════════════════════════════════
// TIMER
// ════════════════════════════════════════════════

function startTimer() {
  log('UI', 'btnStart clicked', { totalElapsedSeconds, isRunning });
  if (isRunning) return;
  isRunning = true;
  startTime = Date.now() - pausedTime;

  timerInterval = setInterval(() => {
    totalElapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    updateTimerDisplay();
  }, 100);

  updateButtonStates();
}

function pauseTimer() {
  log('UI', 'btnPause clicked', { totalElapsedSeconds });
  if (!isRunning) return;
  isRunning = false;
  pausedTime = Date.now() - startTime;
  clearInterval(timerInterval);
  timerInterval = null;
  updateButtonStates();
}

function stopTimer() {
  log('UI', 'btnStop clicked', { totalElapsedSeconds });
  pauseTimer();
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
  updateButtonStates();
}

function updateTimerDisplay() {
  if (isManuallyEditing) return;
  const h = Math.floor(totalElapsedSeconds / 3600);
  const m = Math.floor((totalElapsedSeconds % 3600) / 60);
  const s = totalElapsedSeconds % 60;
  document.getElementById('timerDisplay').textContent =
    String(h).padStart(2, '0') +
    ':' +
    String(m).padStart(2, '0') +
    ':' +
    String(s).padStart(2, '0');
}

function updateButtonStates() {
  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');
  const btnComplete = document.getElementById('btnComplete');
  const btnFree = document.getElementById('btnFreePractice');

  if (isRunning) {
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnStop.disabled = false;
    btnComplete.disabled = false;
    if (btnFree) btnFree.disabled = true;
  } else if (totalElapsedSeconds > 0) {
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = false;
    btnComplete.disabled = false;
    if (btnFree) btnFree.disabled = true;
  } else {
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    btnComplete.disabled = true;
    if (btnFree) {
      const analysisLocked =
        !isStatsOnlyPiece &&
        !canUseSectionAnalysis(currentSection);
      btnFree.disabled =
        isFreePractice || isStatsOnlyPiece || analysisLocked;
      btnFree.title =
        analysisLocked && !isFreePractice
          ? ANALYSIS_LOCKED_TOOLTIP
          : '';
    }
  }
}

function enableManualEdit() {
  if (isRunning) pauseTimer();
  isManuallyEditing = true;
  document.getElementById('timerDisplay').focus();
}

function handleTimeKeypress(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    document.getElementById('timerDisplay').blur();
    return;
  }
  if (!/[\d:]/.test(event.key)) {
    event.preventDefault();
  }
}

async function saveManualTime() {
  if (!isManuallyEditing) return;
  isManuallyEditing = false;
  const text = document.getElementById('timerDisplay').textContent.trim();
  const parts = text.split(':');
  if (parts.length !== 3) {
    await DialogService.alert('Invalid format. Use HH:MM:SS');
    updateTimerDisplay();
    return;
  }
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseInt(parts[2], 10);
  if (isNaN(h) || isNaN(m) || isNaN(s) || m > 59 || s > 59 || h > 23) {
    await DialogService.alert('Invalid time values.');
    updateTimerDisplay();
    return;
  }
  totalElapsedSeconds = h * 3600 + m * 60 + s;
  pausedTime = totalElapsedSeconds * 1000;
  updateTimerDisplay();
  updateButtonStates();
}

// ════════════════════════════════════════════════
// TELLERS
// ════════════════════════════════════════════════

function adjustFailedAttempts(delta) {
  log('UI', 'failedAttempts adjusted', { delta, newValue: Math.max(0, failedAttempts + delta) });
  failedAttempts = Math.max(0, failedAttempts + delta);

  if (!hasAchievedFirstCorrect && delta > 0) {
    errorsBeforeFirstCorrect++;
    if (!userManuallySetTarget) {
      targetRepetitions = strictGebrianMode
        ? (currentSection.targetReps || 6) +
          errorsBeforeFirstCorrect * 3
        : computeGebrianTarget(
            errorsBeforeFirstCorrect,
            overlearningIntensity,
            currentSection.targetReps || 6,
          );
      document.getElementById('targetReps').textContent =
        targetRepetitions;
    }
  }

  if (strictGebrianMode && delta > 0 && hasAchievedFirstCorrect) {
    targetRepetitions += 3;
    document.getElementById('targetReps').textContent = targetRepetitions;
  }

  checkFrustrationGuard();
  updateTrackingMetrics();
}

function adjustCorrectReps(delta) {
  log('UI', 'correctReps adjusted', { delta, newValue: Math.max(0, correctRepetitions + delta) });
  correctRepetitions = Math.max(0, correctRepetitions + delta);

  if (delta > 0) {
    repsSinceLastBreak++;
    if (enableMicroBreaks && repsSinceLastBreak >= 3) {
      showMicroBreak();
    }
  }

  if (!hasAchievedFirstCorrect && correctRepetitions > 0 && delta > 0) {
    hasAchievedFirstCorrect = true;
    entryCost = errorsBeforeFirstCorrect;
    console.log(
      '[EntryCost] First correct rep after ' +
      entryCost + ' error(s)'
    );
    if (!userManuallySetTarget) {
      targetRepetitions = strictGebrianMode
        ? (currentSection.targetReps || 6) +
          errorsBeforeFirstCorrect * 3
        : computeGebrianTarget(
            errorsBeforeFirstCorrect,
            overlearningIntensity,
            currentSection.targetReps || 6,
          );
      gebrianTargetLocked = true;
      document.getElementById('targetReps').textContent =
        targetRepetitions;
    }
  }

  checkFrustrationGuard();
  updateTrackingMetrics();
}

function resetCorrectReps() {
  if (correctRepetitions > 0) streakResets++;
  correctRepetitions = 0;

  if (strictGebrianMode) {
    targetRepetitions += 3;
    document.getElementById('targetReps').textContent = targetRepetitions;
  }

  repsSinceLastBreak = 0;
  hideMicroBreak();
  updateTrackingMetrics();
  checkFrustrationGuard();
}

function adjustTargetReps(delta) {
  targetRepetitions = Math.max(
    1,
    Math.min(100, targetRepetitions + delta),
  );
  document.getElementById('targetReps').textContent = targetRepetitions;
  userManuallySetTarget = true;
  gebrianTargetLocked = false;
}

function resetTargetReps() {
  targetRepetitions =
    currentSection.targetReps ||
    engine.suggestTargetReps(currentSection.stability || 1);
  document.getElementById('targetReps').textContent = targetRepetitions;
  userManuallySetTarget = false;
  errorsBeforeFirstCorrect = 0;
  hasAchievedFirstCorrect = false;
  gebrianTargetLocked = false;
}

function computeGebrianTarget(errors, intensity, base) {
  const min = Math.max(1, base);
  if (intensity === 50) {
    if (errors <= min) return min;
    return min + Math.floor((errors - min) / 2);
  }
  return Math.max(min, errors);
}

function updateTrackingMetrics() {
  document.getElementById('failedAttempts').textContent = failedAttempts;
  document.getElementById('correctRepetitions').textContent =
    correctRepetitions;
  document.getElementById('streakResets').textContent = streakResets;
  updateUnsavedIndicator();
}

// ════════════════════════════════════════════════
// FRUSTRATIONGUARD
// ════════════════════════════════════════════════

function checkFrustrationGuard() {
  const totalErrors = failedAttempts + streakResets;

  if (
    totalErrors >= FRUSTRATION_HARD_LIMIT &&
    !hardLimitReached
  ) {
    hardLimitReached = true;
    frustrationGuardShown = true;

    if (isRunning) pauseTimer();

    document.querySelectorAll(
      '.counter-btn, .timer-btn.start, .timer-btn.pause',
    ).forEach((btn) => {
      btn.disabled = true;
    });

    openHardStopModal();
    return;
  }

  if (
    totalErrors >= FRUSTRATION_SOFT_LIMIT &&
    !frustrationGuardShown &&
    !hardLimitReached
  ) {
    frustrationGuardShown = true;
    const banner = document.getElementById('frustrationBanner');
    if (banner) banner.classList.add('active');
  }
}

async function openHardStopModal() {
  const banner = document.getElementById('frustrationBanner');
  if (banner) banner.classList.remove('active');

  const modal = document.getElementById('hardStopModal');
  if (modal) {
    modal.classList.add('active');
    return;
  }

  const ok = await DialogService.confirm(
    '🛑 Practice stopped\n\n' +
      FRUSTRATION_HARD_LIMIT +
      ' failures or resets — ' +
      'this section is currently too difficult.\n\n' +
      'To succeed, try a slower tempo or divide the ' +
      'passage into smaller fragments.\n\n' +
      'Save session and return to dashboard?',
  );
  if (ok) {
    await saveEvaluation('FrustrationGuard');
  }
}

function closeHardStopModal() {
  const modal = document.getElementById('hardStopModal');
  if (modal) modal.classList.remove('active');
}

async function hardStopSplitAndArchive() {
  closeHardStopModal();

  // Archiveer de sectie
  currentSection.archived = true;
  await db.updateSection(currentSection);

  // Sla de sessie op als FrustrationGuard
  const sessionRecord = {
    sectionId: currentSection.id,
    pieceId: currentSection.pieceId,
    pieceTitle: currentSection.title,
    sectionName: currentSection.section ||
                 currentSection.barRange || '',
    date: new Date().toISOString(),
    duration: totalElapsedSeconds,
    type: 'training',
    feedback: 'FrustrationGuard (' +
      correctRepetitions + 'C/' +
      failedAttempts + 'F)',
    performance: 'Poor',
    notes: cleanNotesBeforeSave() +
      '\n[Auto-archived: section too difficult — ' +
      'consider smaller fragments or a lower tempo]',
    correctRepetitions,
    failedAttempts,
    streakResets,
    targetRepetitions,
    energyLevel: currentEnergy,
    stability: currentSection.stability,
    difficulty: currentSection.difficulty,
    currentBpm: currentSection.currentBpm,
    targetBpm: currentSection.targetBpm,
    sessionOutcome: 'FrustrationGuard',
    entryCost,
  };

  await db.addSession(sessionRecord);
  sessionCompleted = true;
  clearDraft();

  // Vraag of de gebruiker direct een nieuwe
  // kleinere sectie wil toevoegen
  const addNew = await DialogService.confirm(
    '📦 Section archived.\n\n' +
    'The section "' +
    (currentSection.section ||
     currentSection.barRange || '') +
    '" was too difficult to consolidate.\n\n' +
    'Consider adding a smaller fragment or a lower tempo.\n\n' +
    'Do you want to add a smaller section\n' +
    'for "' + (currentSection.title || '') +
    '" right now?'
  );

  if (!addNew) {
    window.location.href = 'dashboard.html';
    return;
  }

  // Naam voor de nieuwe sectie
  const newName = await DialogService.input(
    'Name for the new (smaller) section:\n' +
    'Tip: use a smaller range, e.g. split\n"' +
    (currentSection.section ||
     currentSection.barRange || '') +
    '" into two parts.',
    '',
    'text'
  );

  if (!newName || !newName.trim()) {
    window.location.href = 'dashboard.html';
    return;
  }

  // Tempo voor de nieuwe sectie
  // Suggestie: 75% van het huidige tempo
  const suggestedBpm = Math.round(
    (currentSection.currentBpm || 60) * 0.75
  );

  const newBpmStr = await DialogService.input(
    'Start tempo for "' + newName.trim() +
    '" (BPM):\n' +
    'Suggested: ' + suggestedBpm +
    ' BPM (75% of previous tempo)',
    suggestedBpm,
    'number'
  );

  const newBpm = parseInt(newBpmStr, 10) ||
    suggestedBpm;

  const newTargetBpmStr = await DialogService.input(
    'Target tempo for "' + newName.trim() +
    '" (BPM):',
    currentSection.targetBpm || 100,
    'number'
  );

  const newTargetBpm = parseInt(
    newTargetBpmStr, 10
  ) || currentSection.targetBpm || 100;

  // Nieuwe sectie aanmaken via db
  const newSection = {
    id: generateGUID(),
    pieceId: currentSection.pieceId,
    title: currentSection.title || '',
    section: newName.trim(),
    barRange: newName.trim(),
    description: '',
    stability: 1.0,
    difficulty: 0.3,
    initialDaysDone: 0,
    currentBpm: newBpm,
    targetBpm: newTargetBpm,
    targetReps: 3,
    lastPracticeDate: null,
    nextPracticeDate: (() => {
      const _d = new Date();
      return _d.getFullYear() + '-' +
        String(_d.getMonth() + 1).padStart(2, '0') + '-' +
        String(_d.getDate()).padStart(2, '0');
    })(),
    nextReviewDate: (() => {
      const _d = new Date();
      return _d.getFullYear() + '-' +
        String(_d.getMonth() + 1).padStart(2, '0') + '-' +
        String(_d.getDate()).padStart(2, '0');
    })(),
    archived: false,
    consolidated: false,
    createdAt: new Date().toISOString(),
  };

  await db.addSection(newSection);

  await DialogService.alert(
    '✅ New section added!\n\n' +
    '"' + newName.trim() + '" is ready\n' +
    'at ' + newBpm + ' BPM.\n\n' +
    'It appears in Due Today on the dashboard.',
    'success'
  );

  window.location.href = 'dashboard.html';
}

async function hardStopSaveAndReturn() {
  closeHardStopModal();
  await saveEvaluation('FrustrationGuard');
  if (sessionCompleted) {
    window.location.href = 'dashboard.html';
  }
}

function acceptFrustrationGuard() {
  targetRepetitions = Math.max(3, Math.round(targetRepetitions * 0.7));
  document.getElementById('targetReps').textContent = targetRepetitions;
  dismissFrustrationGuard();
}

function dismissFrustrationGuard() {
  document.getElementById('frustrationBanner').classList.remove('active');
}

// ════════════════════════════════════════════════
// ENERGY EN OVERLEARNING
// ════════════════════════════════════════════════

function setEnergy(level) {
  currentEnergy = level;
  document.querySelectorAll('.energy-btn').forEach((btn) => {
    btn.classList.remove('selected', 'low');
  });
  const btn = document.getElementById('energy' + level);
  if (btn) {
    btn.classList.add('selected');
    if (level === 'Low') btn.classList.add('low');
  }
}

function setOverlearningIntensity(intensity) {
  overlearningIntensity = intensity;
  document
    .getElementById('btn50')
    .classList.toggle('active', intensity === 50);
  document
    .getElementById('btn100')
    .classList.toggle('active', intensity === 100);

  if (hasAchievedFirstCorrect && !userManuallySetTarget) {
    targetRepetitions = computeGebrianTarget(
      errorsBeforeFirstCorrect,
      intensity,
      currentSection.targetReps || 6,
    );
    document.getElementById('targetReps').textContent = targetRepetitions;
  }
}

function toggleStrictGebrian() {
  strictGebrianMode = document.getElementById(
    'strictGebrianCheck',
  ).checked;

  const label = document.getElementById('focusActiveLabel');
  if (label) {
    label.style.display = strictGebrianMode ? 'inline' : 'none';
  }

  if (errorsBeforeFirstCorrect > 0 && !userManuallySetTarget) {
    const base = currentSection.targetReps || 6;
    targetRepetitions = strictGebrianMode
      ? base + errorsBeforeFirstCorrect * 3
      : computeGebrianTarget(
          errorsBeforeFirstCorrect,
          overlearningIntensity,
          base,
        );
    document.getElementById('targetReps').textContent = targetRepetitions;
  }
}

// ════════════════════════════════════════════════
// MICRO-BREAK
// ════════════════════════════════════════════════

function showMicroBreak() {
  if (microBreakActive) return;
  microBreakActive = true;
  repsSinceLastBreak = 0;
  const toast = document.getElementById('microBreakToast');
  if (toast) toast.classList.add('visible');
  if (microBreakTimeout) clearTimeout(microBreakTimeout);
  microBreakTimeout = setTimeout(hideMicroBreak, 5000);
}

function hideMicroBreak() {
  microBreakActive = false;
  const toast = document.getElementById('microBreakToast');
  if (toast) toast.classList.remove('visible');
  if (microBreakTimeout) {
    clearTimeout(microBreakTimeout);
    microBreakTimeout = null;
  }
}

// ════════════════════════════════════════════════
// SESSION NOTES
// ════════════════════════════════════════════════

function generateTimestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return '[' + y + '-' + mo + '-' + d + ' ' + h + ':' + mi + '] ';
}

function initSessionNotes() {
  const field = document.getElementById('sessionNotes');
  if (!field) return;
  currentSessionTimestamp = generateTimestamp();
  if (field.value.trim() !== '') {
    field.value += '\n' + currentSessionTimestamp;
  } else {
    field.value = currentSessionTimestamp;
  }
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
}

function cleanNotesBeforeSave() {
  const field = document.getElementById('sessionNotes');
  if (!field) return '';
  let notes = field.value;
  if (notes.trim() === currentSessionTimestamp.trim()) {
    return '';
  }
  if (
    currentSessionTimestamp.trim() !== '' &&
    notes.trim().endsWith(currentSessionTimestamp.trim())
  ) {
    notes = notes.substring(
      0,
      notes.lastIndexOf(currentSessionTimestamp),
    );
  }
  return notes.trim();
}

// ════════════════════════════════════════════════
// TEMPO VALIDATIE
// ════════════════════════════════════════════════

function validateTempoInput() {
  const targetVal =
    parseInt(document.getElementById('targetTempo')?.value, 10) || 0;
  const achievedVal =
    parseInt(document.getElementById('achievedTempo')?.value, 10) || 0;

  const warningRow = document.getElementById('tempoWarningRow');
  const warningText = document.getElementById('tempoWarningText');
  if (!warningRow || !warningText) return;

  warningRow.style.display = 'none';

  if (achievedVal > 0 && targetVal > 0 && achievedVal > targetVal + 10) {
    warningText.textContent =
      'Achieved (' +
      achievedVal +
      ') exceeds target (' +
      targetVal +
      '). Correct?';
    warningRow.style.display = 'flex';
    return;
  }

  if (targetVal > 0 && (targetVal < 30 || targetVal > 300)) {
    warningText.textContent =
      'Unusual target tempo: ' + targetVal + ' BPM';
    warningRow.style.display = 'flex';
  }
}

function validateTempoForExcellent() {
  const targetVal =
    parseInt(document.getElementById('targetTempo')?.value, 10) || 0;
  const achievedVal =
    parseInt(document.getElementById('achievedTempo')?.value, 10) || 0;
  const excellentBtn = document.querySelector('.eval-option.excellent');
  if (!excellentBtn) return;

  if (targetVal > 0 && achievedVal < targetVal) {
    excellentBtn.classList.add('disabled');
  } else {
    excellentBtn.classList.remove('disabled');
  }
}

// ════════════════════════════════════════════════
// FREE PRACTICE / STATS-ONLY
// ════════════════════════════════════════════════

function applyStatsOnlySessionUI() {
  document.getElementById('sessionPage')?.classList.add('free-practice-active');

  const zoneEl = document.getElementById('topbarZone');
  if (zoneEl) zoneEl.textContent = 'TRACKING';

  const sessionBody = document.querySelector('.session-body');
  if (sessionBody) {
    sessionBody.querySelectorAll('.session-panel').forEach((p) => {
      const title = p.querySelector('.panel-title');
      if (
        title &&
        (title.textContent.trim() === 'Practice Metrics' ||
          title.textContent.trim() === 'Live Planning Preview')
      ) {
        p.style.display = 'none';
      }
    });
  }

  const btn = document.getElementById('btnFreePractice');
  if (btn) {
    btn.textContent = '🔍 Time tracking only';
    btn.disabled = true;
  }
}

async function startFreePractice() {
  if (isStatsOnlyPiece) return;
  if (isRunning || totalElapsedSeconds > 0) {
    await DialogService.alert('A session is already in progress.');
    return;
  }
  if (!(await tryEnterAnalysisMode())) return;
  startTimer();
}

// ════════════════════════════════════════════════
// COMPLETE EN CANCEL
// ════════════════════════════════════════════════

async function completeSession() {
  if (isRunning) pauseTimer();

  if (totalElapsedSeconds < 30) {
    const ok = await DialogService.confirm(
      '⚠️ Short session (< 30 seconds).\n\nSave anyway?',
    );
    if (!ok) {
      await cancelSession();
      return;
    }
  }

  if (isFreePractice && sectionId === 'free-practice') {
    // Standalone Free Practice: open de modal eerst
    // zodat de samenvatting zichtbaar is, dan direct opslaan.
    openEvalModal();
    await saveEvaluation();
  } else {
    openEvalModal();
  }
}

async function cancelSession() {
  const hasData =
    totalElapsedSeconds > 0 ||
    failedAttempts > 0 ||
    correctRepetitions > 0 ||
    streakResets > 0;

  if (hasData) {
    const ok = await DialogService.confirm(
      '⚠️ Unsaved practice data!\n\nAre you sure you want to cancel?',
    );
    if (!ok) return;
  }

  clearDraft();
  sessionCompleted = true;
  window.location.href = 'dashboard.html';
}

// ════════════════════════════════════════════════
// EVALUATIE MODAL
// ════════════════════════════════════════════════

function openEvalModal(predefinedOutcome = null) {
  const modal = document.getElementById('evalModal');
  modal.classList.add('active');

  const evalOptions = document.getElementById('evalOptions');
  const freeNotice = document.getElementById('freePracticeNotice');
  const saveBtn = document.getElementById('btnSaveEval');

  validateTempoForExcellent();

  if (isFreePractice) {
    if (evalOptions) evalOptions.style.display = 'none';
    if (freeNotice) freeNotice.style.display = 'block';
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Analysis';
    }
  } else if (
    predefinedOutcome === 'FrustrationGuard' ||
    frustrationGuardShown
  ) {
    if (evalOptions) evalOptions.style.display = 'none';
    if (freeNotice) freeNotice.style.display = 'none';
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save FrustrationGuard';
    }
  } else {
    if (evalOptions) evalOptions.style.display = 'grid';
    if (freeNotice) freeNotice.style.display = 'none';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Save Session';
    }
  }
}

function closeEvalModal() {
  document.getElementById('evalModal').classList.remove('active');
  selectedPerformance = null;
  document
    .querySelectorAll('.eval-option')
    .forEach((opt) => opt.classList.remove('selected'));
  const saveBtn = document.getElementById('btnSaveEval');
  if (saveBtn) saveBtn.disabled = true;
}

function selectEvaluation(performance, e) {
  selectedPerformance = performance;
  document
    .querySelectorAll('.eval-option')
    .forEach((opt) => opt.classList.remove('selected'));
  e.currentTarget.classList.add('selected');
  const saveBtn = document.getElementById('btnSaveEval');
  if (saveBtn) saveBtn.disabled = false;
}

// ════════════════════════════════════════════════
// SAVE EVALUATIE
// ════════════════════════════════════════════════

async function saveEvaluation(predefinedOutcome = null) {
  if (isFreePractice && !selectedPerformance) {
    selectedPerformance = 'FreePractice';
  }

  if (!selectedPerformance && !predefinedOutcome) {
    await DialogService.alert('Please select a performance rating.');
    return;
  }

  if (!currentSection) {
    await DialogService.alert('Section data missing.');
    return;
  }

  const totalAttempts =
    correctRepetitions + failedAttempts + streakResets;
  const hasActivity = isFreePractice
    ? totalElapsedSeconds > 0
    : totalAttempts > 0 || totalElapsedSeconds >= 120;

  if (!hasActivity) {
    await DialogService.alert(
      '⚠️ No practice activity detected!\n\n' +
        'Record at least one attempt or practice for 2+ minutes.',
    );
    return;
  }

  if (isSavingEvaluation) return;
  isSavingEvaluation = true;

  // Knop pas blokkeren nadat alle validaties geslaagd zijn, zodat hij
  // na een vroege validatie-return niet uitgeschakeld blijft.
  const saveBtnEl = document.getElementById('btnSaveEval');
  if (saveBtnEl) saveBtnEl.disabled = true;

  try {
    let sessionOutcome;
    if (isFreePractice) {
      sessionOutcome = currentSection.id === 'free-practice'
        ? 'FreePractice'
        : 'Analysis';
    } else if (
      predefinedOutcome === 'FrustrationGuard' ||
      frustrationGuardShown
    ) {
      sessionOutcome = 'FrustrationGuard';
    } else if (
      correctRepetitions === 0 &&
      totalElapsedSeconds >= 120
    ) {
      sessionOutcome = 'Incomplete';
    } else if (correctRepetitions >= targetRepetitions) {
      sessionOutcome = 'TargetReached';
    } else {
      sessionOutcome = 'PartialProgress';
    }

    const targetTempoEl = document.getElementById('targetTempo');
    const achievedTempoEl = document.getElementById('achievedTempo');
    if (targetTempoEl?.value) {
      currentSection.targetBpm =
        parseInt(targetTempoEl.value, 10) || currentSection.targetBpm;
    }
    if (achievedTempoEl?.value) {
      currentSection.currentBpm =
        parseInt(achievedTempoEl.value, 10) ||
        currentSection.currentBpm;
    }

    if (!isFreePractice) {
      const sessionResult = {
        correctReps: correctRepetitions,
        failedAttempts: failedAttempts,
        outcome: sessionOutcome,
      };
      log('ENGINE', 'processPracticeFeedback INPUT', {
        sectionId: currentSection.id,
        section: currentSection.section,
        piece: currentSection.title,
        stabilityBefore: currentSection.stability,
        difficultyBefore: currentSection.difficulty,
        bpmBefore: currentSection.currentBpm,
        targetBpm: currentSection.targetBpm,
        initialDaysDone: currentSection.initialDaysDone,
        lastPracticeDate: currentSection.lastPracticeDate,
        correctReps: correctRepetitions,
        failedAttempts,
        outcome: sessionOutcome,
        energyLevel: currentEnergy,
      });
      currentSection = engine.processPracticeFeedback(
        currentSection,
        sessionResult,
        currentEnergy === 'Low',
      );
      log('ENGINE', 'processPracticeFeedback OUTPUT', {
        sectionId: currentSection.id,
        stabilityAfter: currentSection.stability,
        difficultyAfter: currentSection.difficulty,
        bpmAfter: currentSection.currentBpm,
        nextPracticeDate: currentSection.nextPracticeDate,
        initialDaysDone: currentSection.initialDaysDone,
      });
    }

    const sessionRecord = {
      sectionId: currentSection.id,
      pieceId: currentSection.pieceId,
      pieceTitle: currentSection.title,
      sectionName:
        currentSection.section || currentSection.barRange || '',
      date: new Date().toISOString(),
      duration: totalElapsedSeconds,
      type: isFreePractice ? 'analysis' : 'training',
      feedback: isFreePractice
        ? sessionOutcome
        : sessionOutcome +
          ' (' +
          correctRepetitions +
          'C/' +
          failedAttempts +
          'F)',
      performance: selectedPerformance || predefinedOutcome,
      notes: cleanNotesBeforeSave(),
      correctRepetitions,
      failedAttempts,
      streakResets,
      targetRepetitions,
      energyLevel: currentEnergy,
      entryCost: entryCost,
      stability: currentSection.stability,
      difficulty: currentSection.difficulty,
      currentBpm: currentSection.currentBpm,
      targetBpm: currentSection.targetBpm,
      sessionOutcome,
    };

    await db.addSession(sessionRecord);
    log('DB', 'addSession', { sectionId: sessionRecord.sectionId, outcome: sessionRecord.sessionOutcome, duration: sessionRecord.duration });
    isSavingEvaluation = false;

    if (!isFreePractice) {
      currentSection.targetReps =
        engine.suggestTargetReps(currentSection.stability);
      await db.updateSection(currentSection);
      log('DB', 'updateSection', { sectionId: currentSection.id, nextPracticeDate: currentSection.nextPracticeDate, stability: currentSection.stability });
    }

    updateLiveStatus(currentSection);

    showSessionSummary(sessionRecord);

    sessionCompleted = true;
    clearDraft();
  } catch (error) {
    isSavingEvaluation = false;
    console.error('Save failed:', error);
    log('ERROR', 'saveEvaluation failed', { message: error.message, stack: error.stack });
    await DialogService.alert(
      '⚠️ Save failed: ' +
        error.message +
        '\n\nPlease try again.',
    );
    const saveBtn = document.getElementById('btnSaveEval');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Retry Save';
    }
  }
}

function showSessionSummary(session) {
  const panel = document.getElementById('sessionSummaryPanel');
  if (!panel) return;

  const nextDate = currentSection.nextPracticeDate
    ? toDateOnly(currentSection.nextPracticeDate).toLocaleDateString(
        undefined,
        { day: 'numeric', month: 'short' },
      )
    : 'not scheduled';

  const stability =
    Math.round((currentSection.stability || 1) * 10) / 10;
  const comfortPct = Math.round(
    (1 - (currentSection.difficulty || 0.3)) * 100,
  );

  if (isFreePractice && sectionId === 'free-practice') {
    // Standalone Free Practice: toon alleen tijd,
    // geen dummy-waarden van de anonieme sectie.
    panel.innerHTML =
      '✅ <strong>Session saved!</strong><br>' +
      'Free Practice — ' +
      formatDuration(totalElapsedSeconds) + ' recorded.';
  } else if (isStatsOnlyPiece) {
    panel.innerHTML =
      '✅ <strong>Session saved!</strong><br>' +
      'Time tracking only — ' +
      formatDuration(totalElapsedSeconds) +
      ' recorded.<br>' +
      'This piece is excluded from planning.';
  } else {
    panel.innerHTML =
      '✅ <strong>Session saved!</strong><br>' +
      'Outcome: <strong>' + session.sessionOutcome +
      '</strong><br>' +
      'Correct / Failed: <strong>' +
      correctRepetitions + ' / ' + failedAttempts +
      '</strong><br>' +
      'New stability: <strong>' + stability +
      ' days</strong><br>' +
      'Comfort: <strong>' + comfortPct +
      '%</strong><br>' +
      'Next practice: <strong>' + nextDate + '</strong>';
  }

  panel.style.display = 'block';

  const modalTitle = document.getElementById('modalTitle');
  const modalSub = document.getElementById('modalSubtitle');
  if (modalTitle) modalTitle.textContent = 'Session Complete';
  if (modalSub)
    modalSub.textContent = 'Your progress has been saved.';

  const evalOptions = document.getElementById('evalOptions');
  if (evalOptions) evalOptions.style.display = 'none';

  const cancelBtn = document.getElementById('btnCancelEval');
  if (cancelBtn) cancelBtn.style.display = 'none';

  const saveBtn = document.getElementById('btnSaveEval');
  let newBtn = null;
  if (saveBtn) {
    // Verwijder de bestaande addEventListener volledig
    // door de knop te vervangen door een kloon.
    // Dit verwijdert alle event listeners in één stap.
    newBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newBtn, saveBtn);
    newBtn.disabled = false;
    newBtn.textContent = '← Back to Dashboard';
    newBtn.addEventListener('click', () => {
      window.location.href = 'dashboard.html';
    });
  }

  // "Start Training Now" alleen tonen bij Analysis
  // binnen een bestaande sectie, NIET bij standalone
  // Free Practice (sectionId === 'free-practice' heeft
  // geen echte sectie om naar terug te keren).
  if (isFreePractice && sectionId !== 'free-practice' && !isStatsOnlyPiece) {
    const modalFooter = document.querySelector('.modal-footer');
    if (modalFooter) {
      const startTrainingBtn = document.createElement('button');
      startTrainingBtn.className = 'btn btn-primary';
      startTrainingBtn.textContent = '▶ Start Training Now';
      startTrainingBtn.style.cssText =
        'background: linear-gradient(135deg, var(--accent), var(--accent-hover));';
      startTrainingBtn.addEventListener('click', async () => {
        const proceed = await DialogService.confirm(
          'You just completed an analysis session on this section.\n\n' +
            'If you practised the passage during analysis, starting ' +
            'training now may not reflect a true cold start.\n\n' +
            'Continue to training anyway?',
        );
        if (!proceed) return;

        const params = new URLSearchParams({
          section: sectionId,
          currentBpm: currentSection.currentBpm || 60,
          targetBpm: currentSection.targetBpm || 100,
        });
        window.location.href =
          'practice-session.html?' + params.toString();
      });
      modalFooter.insertBefore(startTrainingBtn, newBtn);
    }
  }
}

// ════════════════════════════════════════════════
// AUTO-SAVE DRAFT
// ════════════════════════════════════════════════

function draftKey() {
  return 'mp_draft_' + sectionId;
}

function startAutoSave() {
  autoSaveInterval = setInterval(() => {
    const hasData =
      totalElapsedSeconds > 0 ||
      failedAttempts > 0 ||
      correctRepetitions > 0;
    if (hasData && !sessionCompleted) saveDraft();
  }, 30000);
}

function saveDraft(isFinal = false) {
  if (isSaving && !isFinal) return;
  isSaving = true;

  try {
    const draft = {
      timestamp: new Date().toISOString(),
      totalElapsedSeconds,
      failedAttempts,
      correctRepetitions,
      streakResets,
      targetRepetitions,
      notes: document.getElementById('sessionNotes')?.value || '',
      targetTempo: document.getElementById('targetTempo')?.value || '',
      achievedTempo:
        document.getElementById('achievedTempo')?.value || '',
      energyLevel: currentEnergy,
      errorsBeforeFirstCorrect,
      hasAchievedFirstCorrect,
      gebrianTargetLocked,
      overlearningIntensity,
      strictGebrianMode,
      isFreePractice,
    };
    localStorage.setItem(draftKey(), JSON.stringify(draft));
  } catch (e) {
    console.warn('Draft save failed:', e.message);
  } finally {
    isSaving = false;
  }
}

async function loadDraft() {
  const json = localStorage.getItem(draftKey());
  if (!json) return;

  try {
    const draft = JSON.parse(json);
    const age = Date.now() - new Date(draft.timestamp).getTime();
    if (age > 86400000) {
      localStorage.removeItem(draftKey());
      return;
    }

    const ok = await DialogService.confirm(
      '📝 Found unsaved session from ' +
        new Date(draft.timestamp).toLocaleString(undefined) +
        '\n\nRestore it?',
    );

    if (!ok) {
      localStorage.removeItem(draftKey());
      return;
    }

    totalElapsedSeconds = draft.totalElapsedSeconds || 0;
    failedAttempts = draft.failedAttempts || 0;
    correctRepetitions = draft.correctRepetitions || 0;
    streakResets = draft.streakResets || 0;
    targetRepetitions = draft.targetRepetitions || targetRepetitions;
    errorsBeforeFirstCorrect = draft.errorsBeforeFirstCorrect || 0;
    hasAchievedFirstCorrect = draft.hasAchievedFirstCorrect || false;
    gebrianTargetLocked = draft.gebrianTargetLocked || false;
    overlearningIntensity = draft.overlearningIntensity || 100;
    // entryCost niet herstellen uit draft —
    // wordt opnieuw gemeten in de nieuwe sessie
    entryCost = null;
    strictGebrianMode = draft.strictGebrianMode || false;
    pausedTime = totalElapsedSeconds * 1000;

    if (draft.isFreePractice && canUseSectionAnalysis(currentSection)) {
      enterAnalysisModeUI();
    }

    if (draft.notes) {
      document.getElementById('sessionNotes').value = draft.notes;
    }
    if (draft.targetTempo) {
      document.getElementById('targetTempo').value = draft.targetTempo;
    }
    if (draft.achievedTempo) {
      document.getElementById('achievedTempo').value =
        draft.achievedTempo;
    }
    if (draft.energyLevel) setEnergy(draft.energyLevel);

    document.getElementById('strictGebrianCheck').checked =
      strictGebrianMode;
    toggleStrictGebrian();
    setOverlearningIntensity(overlearningIntensity);
    document.getElementById('targetReps').textContent =
      targetRepetitions;

    updateTimerDisplay();
    updateTrackingMetrics();
    updateButtonStates();
  } catch (e) {
    console.error('Draft load failed:', e);
    localStorage.removeItem(draftKey());
  }
}

function clearDraft() {
  localStorage.removeItem(draftKey());
}

// ════════════════════════════════════════════════
// UNSAVED INDICATOR
// ════════════════════════════════════════════════

function updateUnsavedIndicator() {
  const el = document.getElementById('unsavedIndicator');
  if (!el) return;
  const hasData =
    totalElapsedSeconds > 0 ||
    failedAttempts > 0 ||
    correctRepetitions > 0 ||
    streakResets > 0;
  el.classList.toggle('visible', hasData && !sessionCompleted);
}

// ════════════════════════════════════════════════
// BEFOREUNLOAD
// ════════════════════════════════════════════════

window.addEventListener('beforeunload', (e) => {
  const hasData =
    totalElapsedSeconds > 0 ||
    failedAttempts > 0 ||
    correctRepetitions > 0 ||
    streakResets > 0;
  if (hasData && !sessionCompleted) {
    e.preventDefault();
    e.returnValue = '';
  }
});

window.addEventListener('pagehide', () => {
  if (!sessionCompleted) {
    const hasData =
      totalElapsedSeconds > 0 ||
      failedAttempts > 0 ||
      correctRepetitions > 0;
    if (hasData) saveDraft(true);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('evalModal');
    if (modal?.classList.contains('active')) {
      closeEvalModal();
    }
  }
});

document.getElementById('evalModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'evalModal') closeEvalModal();
});

// ════════════════════════════════════════════════
// EVENT LISTENERS — vervangt inline onclick
// ════════════════════════════════════════════════

document.getElementById('btnStart')
  .addEventListener('click', startTimer);
document.getElementById('btnFreePractice')
  .addEventListener('click', startFreePractice);
document.getElementById('btnPause')
  .addEventListener('click', pauseTimer);
document.getElementById('btnStop')
  .addEventListener('click', stopTimer);

document.getElementById('btnFailedMinus')
  .addEventListener('click', () => adjustFailedAttempts(-1));
document.getElementById('btnFailedPlus')
  .addEventListener('click', () => adjustFailedAttempts(1));

document.getElementById('btn50')
  .addEventListener('click', () => setOverlearningIntensity(50));
document.getElementById('btn100')
  .addEventListener('click', () => setOverlearningIntensity(100));

document.getElementById('strictGebrianCheck')
  .addEventListener('change', toggleStrictGebrian);

document.getElementById('btnCorrectMinus')
  .addEventListener('click', () => adjustCorrectReps(-1));
document.getElementById('btnCorrectPlus')
  .addEventListener('click', () => adjustCorrectReps(1));
document.getElementById('btnCorrectReset')
  .addEventListener('click', resetCorrectReps);

document.getElementById('btnTargetMinus')
  .addEventListener('click', () => adjustTargetReps(-1));
document.getElementById('btnTargetPlus')
  .addEventListener('click', () => adjustTargetReps(1));
document.getElementById('btnTargetReset')
  .addEventListener('click', resetTargetReps);

document.getElementById('btnAcceptFrustration')
  .addEventListener('click', acceptFrustrationGuard);
document.getElementById('btnDismissFrustration')
  .addEventListener('click', dismissFrustrationGuard);

document.getElementById('energyHigh')
  .addEventListener('click', () => setEnergy('High'));
document.getElementById('energyNormal')
  .addEventListener('click', () => setEnergy('Normal'));
document.getElementById('energyLow')
  .addEventListener('click', () => setEnergy('Low'));

document.getElementById('achievedTempo')
  .addEventListener('change', validateTempoInput);
document.getElementById('targetTempo')
  .addEventListener('change', validateTempoInput);

document.getElementById('btnCancel')
  .addEventListener('click', cancelSession);
document.getElementById('btnComplete')
  .addEventListener('click', completeSession);

document.getElementById('btnCancelEval')
  .addEventListener('click', closeEvalModal);
document.getElementById('btnSaveEval')
  .addEventListener('click', () => {
    const btn = document.getElementById('btnSaveEval');
    const isFrustration =
      frustrationGuardShown ||
      btn?.textContent?.includes('FrustrationGuard');
    saveEvaluation(
      isFrustration ? 'FrustrationGuard' : null
    );
  });

document.getElementById('evalPoor')
  .addEventListener('click', (e) => selectEvaluation('Poor', e));
document.getElementById('evalFair')
  .addEventListener('click', (e) => selectEvaluation('Fair', e));
document.getElementById('evalGood')
  .addEventListener('click', (e) => selectEvaluation('Good', e));
document.getElementById('evalExcellent')
  .addEventListener('click', (e) => selectEvaluation('Excellent', e));

document.getElementById('btnHardStopArchive')
  .addEventListener('click', hardStopSplitAndArchive);
document.getElementById('btnHardStopSave')
  .addEventListener('click', hardStopSaveAndReturn);

document.getElementById('timerDisplay')
  .addEventListener('click', enableManualEdit);
document.getElementById('timerDisplay')
  .addEventListener('blur', saveManualTime);
document.getElementById('timerDisplay')
  .addEventListener('keypress', handleTimeKeypress);
