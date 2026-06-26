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
// logger.js — ModusPractica Pro Debug Logger
// Slaat alle acties op in een aparte IndexedDB store.
// Toegankelijk via log.html (geheime URL).
// ════════════════════════════════════════════════

const LOGGER_DB_NAME = 'ModusPracticaLogDB';
const LOGGER_DB_VERSION = 1;
const LOGGER_STORE = 'logs';
const MAX_LOG_ENTRIES = 2000;

let _loggerDb = null;

async function getLoggerDb() {
  if (_loggerDb) return _loggerDb;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOGGER_DB_NAME, LOGGER_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(LOGGER_STORE)) {
        const store = db.createObjectStore(LOGGER_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('category', 'category', { unique: false });
      }
    };
    req.onsuccess = (e) => { _loggerDb = e.target.result; resolve(_loggerDb); };
    req.onerror = () => reject(req.error);
  });
}

export async function log(category, action, data = {}) {
  try {
    const db = await getLoggerDb();
    const entry = {
      timestamp: new Date().toISOString(),
      page: window.location.pathname.split('/').pop() || 'unknown',
      category,   // 'ENGINE' | 'DB' | 'UI' | 'NAV' | 'ERROR' | 'IMPORT_EXPORT'
      action,     // korte beschrijving, bv. 'saveEvaluation' of 'btnStart clicked'
      data,       // vrij object met relevante gegevens
    };
    const tx = db.transaction(LOGGER_STORE, 'readwrite');
    tx.objectStore(LOGGER_STORE).add(entry);

    // Begrens het aantal entries tot MAX_LOG_ENTRIES
    const countReq = tx.objectStore(LOGGER_STORE).count();
    countReq.onsuccess = async () => {
      if (countReq.result > MAX_LOG_ENTRIES) {
        await pruneOldLogs();
      }
    };
  } catch (e) {
    console.warn('[Logger] Failed to write log entry:', e);
  }
}

async function pruneOldLogs() {
  try {
    const db = await getLoggerDb();
    const tx = db.transaction(LOGGER_STORE, 'readwrite');
    const store = tx.objectStore(LOGGER_STORE);
    const all = await new Promise((res, rej) => {
      const r = store.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const toDelete = all.slice(0, all.length - MAX_LOG_ENTRIES);
    for (const entry of toDelete) {
      store.delete(entry.id);
    }
  } catch (e) {
    console.warn('[Logger] Prune failed:', e);
  }
}

export async function getAllLogs() {
  const db = await getLoggerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOGGER_STORE, 'readonly');
    const req = tx.objectStore(LOGGER_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllLogs() {
  const db = await getLoggerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOGGER_STORE, 'readwrite');
    const req = tx.objectStore(LOGGER_STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
