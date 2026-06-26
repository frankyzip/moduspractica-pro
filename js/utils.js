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
export function generateGUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    .replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
}

export function getTodayLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function toDateOnly(dateString) {
  if (!dateString) return null;
  // Detecteer pure datumstring YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  // Volledige ISO timestamp: gebruik lokale componenten
  const d = new Date(dateString);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function toLocalDateString(date) {
  // Geeft een lokale YYYY-MM-DD string terug zonder
  // UTC-conversie. Gebruik dit voor nextPracticeDate opslag.
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

export function formatDuration(seconds) {
  if (seconds < 60) return Math.round(seconds) + 's';
  if (seconds < 3600) return Math.round(seconds / 60) + 'm';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
}

export function formatDate(dateString) {
  if (!dateString) return 'Never';
  return toDateOnly(dateString).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

/** Stuk is alleen voor tijdregistratie — geen FSRS-planning. */
export function isPieceStatsOnly(piece) {
  return Boolean(piece?.statsOnly);
}

/**
 * Bepaalt of een sectie in Due Today / Schedule mag verschijnen.
 * @param {Object} section
 * @param {Map<string, Object>} pieceById
 */
export function isSectionInPlanning(section, pieceById) {
  if (!section) return false;
  if (section.archived || section.deleted || section.consolidated) {
    return false;
  }
  if (!section.pieceId) return true;
  const piece = pieceById.get(section.pieceId);
  if (isPieceStatsOnly(piece)) return false;
  return true;
}

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizePieceLink(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed;
}

export function isValidPieceLink(url) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function formatBpm(section) {
  const cur = section && section.currentBpm;
  const tgt = section && section.targetBpm;
  if (!cur) return '';
  if (tgt && cur < tgt) return cur + ' → ' + tgt + ' BPM';
  return cur + ' BPM';
}
