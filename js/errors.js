// ════════════════════════════════════════════════
// errors.js — Globaal vangnet voor onafgehandelde fouten
// Logt via logger.js (categorie ERROR) en toont één korte
// melding aan de gebruiker, zonder te spammen bij meerdere
// snelle fouten. Side-effect module: importeer met
// `import './errors.js';` bovenaan elk pagina-script.
// ════════════════════════════════════════════════

import { DialogService } from './dialog.js';
import { log } from './logger.js';

let alertShowing = false;

async function notify(message) {
  if (alertShowing) return;
  alertShowing = true;
  try {
    await DialogService.alert(message, 'danger');
  } finally {
    alertShowing = false;
  }
}

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = reason?.message || String(reason);
  // log() vangt eigen fouten intern af en rejectet nooit;
  // de .catch is een extra vangnet tegen een eventuele lus.
  Promise.resolve(
    log('ERROR', 'unhandledrejection', {
      message: msg,
      stack: reason?.stack || null,
    }),
  ).catch(() => {});
  notify(
    '⚠️ Something went wrong: ' + msg +
      '\n\nYour latest action may not have been saved. ' +
      'Please retry, and export a backup if the problem persists.',
  );
});

window.addEventListener('error', (event) => {
  Promise.resolve(
    log('ERROR', 'window.error', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      col: event.colno,
    }),
  ).catch(() => {});
});
