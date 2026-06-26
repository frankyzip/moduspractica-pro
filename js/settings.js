import './errors.js';
import { db } from './db.js';
import { DialogService } from './dialog.js';
import { log } from './logger.js';

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await db.init();
  log('NAV', 'settings geladen', {});
  await loadDataStats();
  loadSavedKey();
  bindEvents();
});

// ── Database statistieken ──
async function loadDataStats() {
  const pieces = await db.getAllPieces();
  const sections = await db.getAllSections();
  const sessions = await db.getAllSessions();

  document.getElementById('statPieces').textContent =
    pieces.filter(p => !p.archived).length;
  document.getElementById('statSections').textContent =
    sections.filter(s => !s.archived).length;
  document.getElementById('statSessions').textContent =
    sessions.length;
}

function getLocalDateStamp(date = new Date()) {
  // Gebruik de lokale datum, zodat de bestandsnaam overeenkomt met de dag op de machine.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

// ── Groq API sleutel ──
function loadSavedKey() {
  const input = document.getElementById('inputGroqKey');
  const remember = document.getElementById('inputRememberGroqKey');
  const persistentKey = localStorage.getItem('mp_groq_key');
  const sessionKey = sessionStorage.getItem('mp_groq_key');
  const key = persistentKey || sessionKey;

  if (remember) {
    remember.checked = Boolean(persistentKey);
  }

  if (key && input) {
    input.value = key;
    showKeyStatus(
      persistentKey
        ? '✓ API key loaded from this device.'
        : '✓ API key loaded for this session.',
      'info'
    );
  }
}

function showKeyStatus(message, type) {
  const el = document.getElementById('keyStatus');
  if (!el) return;
  el.textContent = message;
  el.className = 'api-key-status ' + type;
}

async function saveGroqKey() {
  const input = document.getElementById('inputGroqKey');
  const remember = document.getElementById('inputRememberGroqKey');
  const key = input?.value.trim();

  if (!key) {
    await DialogService.alert(
      'Please enter a valid API key.',
      'warning'
    );
    return;
  }

  sessionStorage.setItem('mp_groq_key', key);

  if (remember?.checked) {
    localStorage.setItem('mp_groq_key', key);
    showKeyStatus(
      '✅ API key saved on this device.',
      'success'
    );
    return;
  }

  localStorage.removeItem('mp_groq_key');
  showKeyStatus(
    '✅ API key saved for this session. ' +
    'Any remembered key was removed.',
    'success'
  );
}

async function testGroqKey() {
  const input = document.getElementById('inputGroqKey');
  const key = sessionStorage.getItem('mp_groq_key') ||
    localStorage.getItem('mp_groq_key') ||
    input?.value.trim();

  if (!key) {
    await DialogService.alert(
      'Please enter and save an API key first.',
      'warning'
    );
    return;
  }

  const btn = document.getElementById('btnTestKey');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Testing...';
  }
  showKeyStatus('Testing connection...', 'info');

  try {
    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{
            role: 'user',
            content: 'Reply with one word: OK',
          }],
          max_tokens: 5,
          temperature: 0.0,
        }),
      }
    );

    if (response.ok) {
      showKeyStatus(
        '✅ Connection successful! Groq AI is ready.',
        'success'
      );
    } else {
      const err = await response.json().catch(() => ({}));
      showKeyStatus(
        '❌ Connection failed: ' +
        (err.error?.message || 'Error ' + response.status),
        'error'
      );
    }
  } catch (err) {
    showKeyStatus(
      '❌ Network error: ' + err.message,
      'error'
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Test Connection';
    }
  }
}

// ── Export ──
async function exportData() {
  try {
    const data = await db.exportAllData();
    log('IMPORT_EXPORT', 'exportData', { timestamp: new Date().toISOString() });
    const blob = new Blob(
      [data],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStamp = getLocalDateStamp();
    a.download = 'moduspractica-pro-backup-' + dateStamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export failed:', err);
    await DialogService.alert(
      'Export failed: ' + err.message,
      'danger'
    );
  }
}

// ── Import (Pro formaat) ──
async function handleImport(file) {
  if (!file) return;
  const statusEl = document.getElementById('importStatus');

  const reader = new FileReader();
  reader.onerror = async () => {
    await DialogService.alert(
      'Error reading file.',
      'danger'
    );
  };

  reader.onload = async (evt) => {
    const text = evt?.target?.result;
    if (typeof text !== 'string') {
      await DialogService.alert(
        'Unknown file format.',
        'danger'
      );
      return;
    }

    try {
      await db.importData(text);

      const pieces = await db.getAllPieces();
      const sections = await db.getAllSections();
      const sessions = await db.getAllSessions();
      log('IMPORT_EXPORT', 'importData', { pieces: pieces.length, sections: sections.length, sessions: sessions.length });

      if (statusEl) {
        statusEl.className = 'import-status success';
        statusEl.textContent =
          '✅ Import successful! ' +
          pieces.length + ' pieces · ' +
          sections.length + ' sections · ' +
          sessions.length + ' sessions loaded.';
      }

      await loadDataStats();

    } catch (err) {
      console.error('Import error:', err);
      if (statusEl) {
        statusEl.className = 'import-status error';
        statusEl.textContent =
          '❌ Import failed: ' + err.message;
      }
    }
  };

  reader.readAsText(file);
}

// ── App reset ──
async function resetApp() {
  const first = await DialogService.confirm(
    '🚨 WARNING: Delete ALL data?\n\n' +
    'This will permanently erase all your pieces, ' +
    'sections and practice history.\n\n' +
    'This action cannot be undone.\n\n' +
    'Export your data first!'
  );
  if (!first) return;

  const confirm = await DialogService.input(
    'Type RESET to confirm:',
    '',
    'text'
  );

  if (confirm !== 'RESET') {
    if (confirm !== null) {
      await DialogService.alert(
        'Reset cancelled: text did not match.',
        'info'
      );
    }
    return;
  }

  try {
    await db.clearAllData();
    log('DB', 'clearAllData (reset)', { timestamp: new Date().toISOString() });
    await loadDataStats();
    await DialogService.alert(
      '✅ All data deleted. The app has been reset.',
      'success'
    );
  } catch (err) {
    console.error('Reset failed:', err);
    await DialogService.alert(
      'Reset failed: ' + err.message,
      'danger'
    );
  }
}

// ── Events ──
function bindEvents() {
  document.getElementById('btnSaveKey')
    .addEventListener('click', saveGroqKey);

  document.getElementById('btnTestKey')
    .addEventListener('click', testGroqKey);

  document.getElementById('inputRememberGroqKey')
    .addEventListener('change', (e) => {
      if (!e.target.checked) {
        localStorage.removeItem('mp_groq_key');
        showKeyStatus(
          'Remembered API key removed from this browser.',
          'info'
        );
      }
    });

  document.getElementById('btnExport')
    .addEventListener('click', exportData);

  document.getElementById('fileImport')
    .addEventListener('change', (e) => {
      handleImport(e.target.files[0]);
      e.target.value = '';
    });

  document.getElementById('btnResetApp')
    .addEventListener('click', resetApp);
}
