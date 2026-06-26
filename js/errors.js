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
