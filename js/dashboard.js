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
import { engine } from './engine.js';
import { DialogService } from './dialog.js';
import {
  generateGUID,
  formatDuration,
  formatDate,
  formatBpm,
  getTodayLocal,
  toDateOnly,
  escapeHtml,
  normalizePieceLink,
  isValidPieceLink,
} from './utils.js';
import { log } from './logger.js';

let allPieces = [];
let allSections = [];
let allSessions = [];
let dueSections = [];
let selectedPieceId = null;
let currentSort = 'due';
let showArchived = false;
let currentAudioObjectUrl = null;
let pendingAudioPieceId = null;

const LINK_ICON_SVG = `<svg class="link-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

function revokeCurrentAudioUrl() {
  if (currentAudioObjectUrl) {
    URL.revokeObjectURL(currentAudioObjectUrl);
    currentAudioObjectUrl = null;
  }
}

function pieceHasAudio(piece) {
  return !!(piece && piece.audioFileName);
}

function pieceAudioButtonHtml(piece) {
  const hasAudio = pieceHasAudio(piece);
  return `<button class="btn btn-secondary btn-sm btn-piece-audio${
    hasAudio ? ' has-audio' : ''
  }" id="btnPieceAudio" title="${
    hasAudio ? 'Manage reference audio' : 'Add reference MP3'
  }" aria-label="${
    hasAudio ? 'Manage reference audio' : 'Add reference MP3'
  }">🎧</button>`;
}

function pieceLinkButtonHtml(piece) {
  const hasLink = !!piece.link;
  return `<button class="btn btn-secondary btn-sm btn-piece-link${
    hasLink ? ' has-link' : ''
  }" id="btnPieceLink" title="${
    hasLink ? 'Edit link' : 'Add link'
  }">${LINK_ICON_SVG}</button>`;
}

function pieceTitleWithLinkHtml(piece) {
  return `
    <div class="piece-item-title">
      <span class="piece-item-title-text">${escapeHtml(piece.title)}</span>
      ${
        piece.link
          ? `<button type="button" class="piece-link-icon has-link"
                    data-piece-id="${piece.id}"
                    title="Open external link"
                    aria-label="Open external link">${LINK_ICON_SVG}</button>`
          : ''
      }
    </div>`;
}

function attachPieceLinkIconHandlers(root) {
  root.querySelectorAll('.piece-link-icon').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPieceLink(btn.dataset.pieceId);
    });
  });
}

function openPieceLink(pieceId) {
  const piece = allPieces.find((p) => p.id === pieceId);
  if (!piece?.link) return;
  window.open(piece.link, '_blank', 'noopener,noreferrer');
  log('UI', 'openPieceLink', { pieceId });
}

async function editPieceLink(pieceId) {
  const piece = allPieces.find((p) => p.id === pieceId);
  if (!piece) return;

  const prompt = piece.link
    ? 'Edit link (sheet music, YouTube, web page, etc.):\n\nLeave empty and save to remove the link.'
    : 'Add a link (sheet music, YouTube, web page, etc.):';

  const url = await DialogService.input(
    prompt,
    piece.link || '',
    'url',
    true,
  );
  if (url === null) return;

  const normalized = normalizePieceLink(url);
  if (!isValidPieceLink(normalized)) {
    await DialogService.alert(
      'Please enter a valid http or https URL.',
      'warning',
    );
    return editPieceLink(pieceId);
  }

  piece.link = normalized;
  await db.updatePiece(piece);
  log('DB', 'editPieceLink', { pieceId, hasLink: !!normalized });
  await loadData();
}

function openPieceAudioFilePicker(pieceId) {
  pendingAudioPieceId = pieceId;
  const input = document.getElementById('pieceAudioFileInput');
  if (!input) return;
  input.value = '';
  input.click();
}

async function handlePieceAudioFileSelected(event) {
  const file = event.target.files?.[0];
  const pieceId = pendingAudioPieceId;
  pendingAudioPieceId = null;
  if (!file || !pieceId) return;

  try {
    await db.setPieceAudio(pieceId, file);
    log('DB', 'setPieceAudio', { pieceId, fileName: file.name });
    await loadData();
    if (selectedPieceId === pieceId) {
      renderPieceDetail(pieceId);
    }
    await DialogService.alert('Reference MP3 saved.', 'success');
  } catch (err) {
    await DialogService.alert(err.message || 'Could not save MP3.', 'warning');
  }
}

async function removePieceAudio(pieceId) {
  const piece = allPieces.find((p) => p.id === pieceId);
  if (!piece || !pieceHasAudio(piece)) return;

  const ok = await DialogService.confirm(
    'Remove the reference MP3 for "' + piece.title + '"?',
  );
  if (!ok) return;

  await db.deletePieceAudio(pieceId);
  log('DB', 'deletePieceAudio', { pieceId });
  revokeCurrentAudioUrl();
  await loadData();
  if (selectedPieceId === pieceId) {
    renderPieceDetail(pieceId);
  }
}

async function managePieceAudio(pieceId) {
  const piece = allPieces.find((p) => p.id === pieceId);
  if (!piece) return;

  if (!pieceHasAudio(piece)) {
    openPieceAudioFilePicker(pieceId);
    return;
  }

  const action = await DialogService.menu('Reference audio for "' + piece.title + '"', [
    { id: 'replace', label: 'Replace MP3' },
    { id: 'remove', label: 'Remove MP3' },
  ]);

  if (action === 'replace') {
    openPieceAudioFilePicker(pieceId);
  } else if (action === 'remove') {
    await removePieceAudio(pieceId);
  }
}

async function appendPieceAudioPlayer(listEl, piece) {
  if (!pieceHasAudio(piece)) return;

  const audioRecord = await db.getPieceAudio(piece.id);
  if (!audioRecord?.blob) return;

  revokeCurrentAudioUrl();
  currentAudioObjectUrl = URL.createObjectURL(audioRecord.blob);

  const bar = document.createElement('div');
  bar.className = 'piece-audio-bar';
  bar.innerHTML = `
    <div class="piece-audio-label">
      <span class="piece-audio-icon" aria-hidden="true">🎧</span>
      <span class="piece-audio-name" title="${escapeHtml(audioRecord.fileName || piece.audioFileName)}">
        ${escapeHtml(audioRecord.fileName || piece.audioFileName)}
      </span>
    </div>
    <audio class="piece-audio-player" controls preload="metadata"
           src="${currentAudioObjectUrl}"></audio>`;
  listEl.appendChild(bar);
}

document.addEventListener('DOMContentLoaded', async () => {
  await db.init();
  log('NAV', 'dashboard geladen', {});
  await loadData();
  bindEvents();
});

async function loadData() {
  try {
    allPieces = await db.getAllPieces();
    allSections = await db.getAllSections();
    allSessions = await db.getAllSessions();
    dueSections = await db.getDueSections();
    await renderAll();
    await updateStreakStats();
  } catch (err) {
    console.error('loadData failed:', err);
    log('ERROR', 'loadData failed', { message: err.message });
    await DialogService.alert(
      '⚠️ Could not load your data: ' + err.message +
      '\n\nIf this keeps happening, check your browser privacy ' +
      'settings (IndexedDB) and export a backup.',
      'danger',
    );
  }
}

async function renderAll() {
  renderDueList();
  renderPiecesList();
  renderArchivedPiecesList();
  if (selectedPieceId) {
    const piece = allPieces.find((p) => p.id === selectedPieceId);
    if (piece?.archived) {
      selectArchivedPiece(selectedPieceId);
    } else {
      renderPieceDetail(selectedPieceId);
    }
  }
}

function renderDueList() {
  const todaySectionEl = document.getElementById('todaySection');
  if (todaySectionEl) {
    todaySectionEl.style.display = selectedPieceId ? 'none' : 'block';
  }

  if (!selectedPieceId) {
    document.getElementById('noPieceSelected')?.classList.add('hidden');
  }

  const container = document.getElementById('dueList');
  const countEl = document.getElementById('dueTodayCount');

  countEl.textContent = dueSections.length;

  const hasOverdue = dueSections.some((s) => {
    const next = new Date(s.nextPracticeDate);
    const today = getTodayLocal();
    return next < today;
  });
  if (countEl) {
    countEl.classList.toggle('overdue', hasOverdue);
  }

  if (dueSections.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px;">
        <div class="empty-state-icon">✅</div>
        <div class="empty-state-title">
          All done for today!
        </div>
        <div class="empty-state-text">
          Enjoy your rest or add new sections.
        </div>
      </div>`;
    return;
  }

  const sorted = [...dueSections].sort((a, b) => {
    const dateA = new Date(a.nextPracticeDate);
    const dateB = new Date(b.nextPracticeDate);
    return dateA - dateB;
  });

  container.innerHTML = '';
  const today = getTodayLocal();

  sorted.forEach((section) => {
    const piece = allPieces.find((p) => p.id === section.pieceId);
    const pieceTitle = piece?.title || section.title || 'Unknown';

    const nextDate = toDateOnly(section.nextPracticeDate);
    const daysLate = Math.floor((today - nextDate) / 86400000);

    let badgeClass = '';
    let badgeText = '';
    let itemClass = '';

    if (daysLate <= 0) {
      badgeClass = 'due-today';
      badgeText = 'Due today';
    } else if (daysLate <= 3) {
      badgeClass = 'late-mild';
      badgeText =
        daysLate === 1 ? '1 day late' : daysLate + ' days late';
      itemClass = 'overdue-warning';
    } else if (daysLate <= 7) {
      badgeClass = 'late-serious';
      badgeText = daysLate + ' days late!';
      itemClass = 'overdue-warning';
    } else {
      badgeClass = 'late-critical';
      badgeText = daysLate + ' days overdue';
      itemClass = 'overdue-critical';
    }

    const comfortPct = Math.round((1 - (section.difficulty || 0.3)) * 100);
    let pillClass = 'green';
    if (comfortPct < 40) pillClass = 'red';
    else if (comfortPct < 70) pillClass = 'orange';

    const bpmText = formatBpm(section);

    const item = document.createElement('div');
    item.className = 'due-item ' + itemClass;

    item.innerHTML = `
      <div class="due-item-left">
        <div class="due-item-piece">${escapeHtml(pieceTitle)}</div>
        <div class="due-item-section">
          ${escapeHtml(section.section || section.barRange || '')}
        </div>
        <div class="due-item-meta">
          <span class="overdue-badge ${badgeClass}">
            ${badgeText}
          </span>
          <span class="meta-pill ${pillClass}">
            Comfort: ${comfortPct}%
          </span>
          <span class="meta-pill">
            Stability: ${
              Math.round((section.stability || 1) * 10) / 10
            }d
          </span>
          ${
            bpmText
              ? `<span class="meta-pill meta-pill-clickable
                            btn-edit-bpm"
                    data-id="${section.id}"
                    title="Click to adjust tempo">
                🎵 ${bpmText} ✏️
              </span>`
              : ''
          }
        </div>
      </div>
      <div class="due-item-right">
        <button class="btn btn-primary btn-sm btn-start-practice"
                data-id="${section.id}">
          Practice ▶
        </button>
      </div>`;

    item.querySelector('.btn-start-practice').addEventListener('click', (e) => {
      e.stopPropagation();
      startPractice(section.id, section);
    });

    const bpmPill = item.querySelector('.btn-edit-bpm');
    if (bpmPill) {
      bpmPill.addEventListener('click', async (e) => {
        e.stopPropagation();
        await editSectionBpm(section);
      });
    }

    item.addEventListener('click', () => {
      if (section.pieceId) {
        selectPiece(section.pieceId);
      }
    });

    container.appendChild(item);
  });
}

function renderPiecesList() {
  const container = document.getElementById('piecesList');
  const activePieces = allPieces.filter((p) => !p.archived);

  if (activePieces.length === 0) {
    container.innerHTML = `
      <div style="padding: 16px; text-align: center;
                  color: var(--text-muted); font-size: 12px;">
        No pieces yet.<br>Click + to add one.
      </div>`;
    return;
  }

  const sorted = sortPieces(activePieces);
  container.innerHTML = '';

  sorted.forEach((piece) => {
    const pieceSections = allSections.filter(
      (s) => s.pieceId === piece.id && !s.archived && !s.deleted,
    );
    const duePieceSections = piece.statsOnly
      ? []
      : dueSections.filter((s) => s.pieceId === piece.id);
    const dueCount = duePieceSections.length;

    const lastPracticed = getPieceLastPracticedDate(piece.id);

    const lastPracticedText = lastPracticed
      ? lastPracticed.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        })
      : 'Never practiced';

    const today = getTodayLocal();
    const hasOverdueSections = duePieceSections.some((s) => {
      return new Date(s.nextPracticeDate) < today;
    });

    const item = document.createElement('div');
    item.className =
      'piece-item' + (selectedPieceId === piece.id ? ' active' : '');
    item.dataset.pieceId = piece.id;

    item.innerHTML = `
      <div class="piece-item-info">
        ${pieceTitleWithLinkHtml(piece)}
        <div class="piece-item-meta">
          ${piece.statsOnly ? '<span class="stats-only-label">📊 Stats only</span> · ' : ''}${
            piece.composer
            ? escapeHtml(piece.composer) + ' · '
            : ''
          }${pieceSections.length} section${
            pieceSections.length !== 1 ? 's' : ''
          } · ${lastPracticedText}
        </div>
      </div>
      <div class="due-badge ${
        piece.statsOnly || dueCount === 0
          ? 'zero'
          : hasOverdueSections
            ? 'overdue'
            : ''
      }">
        ${piece.statsOnly ? '—' : dueCount}
      </div>`;

    item.addEventListener('click', () => selectPiece(piece.id));
    attachPieceLinkIconHandlers(item);
    container.appendChild(item);
  });
}

function renderArchivedPiecesList() {
  const container = document.getElementById('archivedPiecesList');
  const toggleLabel = document.getElementById('archiveToggleLabel');
  const toggleBtn = document.getElementById('btnToggleArchive');

  const archivedPieces = allPieces.filter((p) => p.archived);

  const archivedSections = allSections.filter((s) => {
    if (!s.archived || s.deleted) return false;
    const piece = allPieces.find((p) => p.id === s.pieceId);
    return piece && !piece.archived;
  });

  const totalArchived =
    archivedPieces.length + archivedSections.length;

  if (toggleLabel) {
    toggleLabel.textContent = showArchived
      ? 'Hide Archived (' + totalArchived + ')'
      : 'Show Archived (' + totalArchived + ')';
  }
  if (toggleBtn) {
    toggleBtn.classList.toggle('open', showArchived);
  }

  if (!container) return;

  container.style.display = showArchived ? 'block' : 'none';

  container.innerHTML =
    '<div class="archived-label">Archived</div>';

  if (totalArchived === 0) {
    container.innerHTML +=
      '<div style="padding: 12px 16px; ' +
      'font-size: 12px; color: var(--text-muted);">' +
      'No archived items.</div>';
    return;
  }

  if (archivedSections.length > 0) {
    const sectionHeader = document.createElement('div');
    sectionHeader.style.cssText =
      'padding: 6px 12px 4px; ' +
      'font-size: 10px; font-weight: 700; ' +
      'text-transform: uppercase; ' +
      'letter-spacing: 0.06em; ' +
      'color: var(--accent-2);';
    sectionHeader.textContent = 'Archived Sections';
    container.appendChild(sectionHeader);

    archivedSections.forEach((section) => {
      const piece = allPieces.find((p) => p.id === section.pieceId);
      const pieceTitle = piece?.title || section.title || 'Unknown';

      const item = document.createElement('div');
      item.className = 'piece-item archived';
      item.style.cssText =
        'flex-direction: column; ' +
        'align-items: flex-start; ' +
        'padding: 10px 12px; gap: 6px;';

      const sectionSessions = allSessions
        ? allSessions
            .filter((s) => s.sectionId === section.id)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
        : [];
      const lastSession = sectionSessions[0];
      const archiveNote =
        lastSession?.notes
          ?.split('\n')
          .find((l) => l.includes('Auto-archived')) || '';

      const bpmText = formatBpm(section);

      item.innerHTML = `
        <div style="width:100%; display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:8px;">
          <div>
            <div class="piece-item-title"
                 style="text-decoration:none;
                        color:var(--text-primary);
                        font-size:13px;">
              ${escapeHtml(section.section || section.barRange || 'Unnamed')}
            </div>
            <div class="piece-item-meta">
              ${escapeHtml(pieceTitle)}
              ${
                bpmText
                  ? ' · <span style="color:var(--accent-2);">' +
                    bpmText +
                    '</span>'
                  : ''
              }
            </div>
            ${
              archiveNote
                ? '<div style="font-size:10px; ' +
                  'color:var(--danger); margin-top:2px;">' +
                  archiveNote +
                  '</div>'
                : ''
            }
          </div>
          <div style="display:flex; gap:4px;
                      flex-shrink:0;">
            <button class="section-action-btn
                            btn-restore-section"
                    title="Restore section"
                    data-id="${section.id}"
                    style="opacity:1; width:32px;
                           height:32px;">
              ↩
            </button>
            <button class="section-action-btn danger
                            btn-delete-section"
                    title="Delete permanently"
                    data-id="${section.id}"
                    style="opacity:1; width:32px;
                           height:32px;">
              🗑
            </button>
          </div>
        </div>
      `;

      item
        .querySelector('.btn-restore-section')
        .addEventListener('click', async (e) => {
          e.stopPropagation();
          await restoreArchivedSection(section);
        });

      item
        .querySelector('.btn-delete-section')
        .addEventListener('click', async (e) => {
          e.stopPropagation();
          await deleteArchivedSection(section);
        });

      container.appendChild(item);
    });
  }

  if (archivedPieces.length > 0) {
    const pieceHeader = document.createElement('div');
    pieceHeader.style.cssText =
      'padding: 6px 12px 4px; ' +
      'font-size: 10px; font-weight: 700; ' +
      'text-transform: uppercase; ' +
      'letter-spacing: 0.06em; ' +
      'color: var(--text-muted); ' +
      'margin-top: 8px;';
    pieceHeader.textContent = 'Archived Pieces';
    container.appendChild(pieceHeader);

    archivedPieces.forEach((piece) => {
      const pieceSections = allSections.filter(
        (s) => s.pieceId === piece.id && !s.deleted,
      );

      const item = document.createElement('div');
      item.className = 'piece-item archived';
      item.dataset.pieceId = piece.id;

      item.innerHTML = `
        <div class="piece-item-info">
          ${pieceTitleWithLinkHtml(piece)}
          <div class="piece-item-meta">
            ${piece.composer ? escapeHtml(piece.composer) + ' · ' : ''}${
              pieceSections.length
            } section${pieceSections.length !== 1 ? 's' : ''}
          </div>
        </div>
      `;

      item.addEventListener('click', () => selectArchivedPiece(piece.id));
      attachPieceLinkIconHandlers(item);
      container.appendChild(item);
    });
  }
}

function selectArchivedPiece(pieceId) {
  selectedPieceId = pieceId;
  const piece = allPieces.find((p) => p.id === pieceId);
  if (!piece) return;

  document.querySelectorAll('.piece-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.pieceId === pieceId);
  });

  const noPieceEl = document.getElementById('noPieceSelected');
  const detailEl = document.getElementById('pieceDetailSection');
  const titleEl = document.getElementById('mainPanelTitle');
  const actionsEl = document.getElementById('mainPanelActions');
  const countEl = document.getElementById('sectionCount');

  noPieceEl.classList.add('hidden');
  detailEl.classList.remove('hidden');

  const todaySection = document.getElementById('todaySection');
  if (todaySection) {
    todaySection.style.display = 'none';
  }

  titleEl.innerHTML =
    escapeHtml(piece.title) +
    ' <span style="font-size:12px; font-weight:500; color:var(--text-muted); ' +
    'background:var(--surface-3); padding:2px 8px; border-radius:999px; ' +
    'margin-left:6px;">Archived</span>' +
    (piece.composer
      ? ' <span style="font-size:13px; font-weight:500; color:var(--text-muted);">' +
        escapeHtml(piece.composer) +
        '</span>'
      : '');

  actionsEl.innerHTML = `
    <button class="btn btn-secondary btn-sm"
            id="btnBackToToday"
            style="color:var(--accent);
                   border-color:var(--accent-light);">
      ← Today
    </button>
    ${pieceLinkButtonHtml(piece)}
    ${pieceAudioButtonHtml(piece)}
    <button class="btn btn-success btn-sm" id="btnUnarchivePiece">
      ↩ Restore Piece
    </button>
    <button class="btn btn-danger btn-sm" id="btnDeletePiece">
      🗑 Delete Permanently
    </button>`;

  document
    .getElementById('btnBackToToday')
    ?.addEventListener('click', backToPracticeToday);

  document
    .getElementById('btnPieceLink')
    ?.addEventListener('click', () => editPieceLink(pieceId));

  document
    .getElementById('btnPieceAudio')
    ?.addEventListener('click', () => managePieceAudio(pieceId));

  document
    .getElementById('btnUnarchivePiece')
    .addEventListener('click', () => unarchivePiece(pieceId));
  document
    .getElementById('btnDeletePiece')
    .addEventListener('click', () => deletePiece(pieceId));

  const pieceSections = allSections.filter((s) => s.pieceId === pieceId);
  countEl.textContent = pieceSections.length;

  const listEl = document.getElementById('sectionsList');
  listEl.innerHTML = '';

  void appendPieceAudioPlayer(listEl, piece);

  const btnAddSection = document.getElementById('btnAddSection');
  if (btnAddSection) btnAddSection.style.display = 'none';

  const headingEl = document.getElementById('pieceDetailHeading');
  if (headingEl) headingEl.textContent = 'Sections';

  if (pieceSections.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'empty-state';
    emptyEl.style.padding = '24px';
    emptyEl.innerHTML = `
      <div class="empty-state-icon">📦</div>
      <div class="empty-state-title">No sections</div>`;
    listEl.appendChild(emptyEl);
    return;
  }

  pieceSections.forEach((section) => {
    const row = document.createElement('div');
    row.className = 'section-row archived';
    row.innerHTML = `
      <div class="section-row-name">
        ${escapeHtml(section.section || section.barRange || 'Unnamed section')}
      </div>
      <div class="section-row-stability">
        S: ${Math.round((section.stability || 1) * 10) / 10}d
      </div>
      <div class="section-row-actions" style="opacity:1;">
        <button class="section-action-btn btn-restore"
                title="Restore section"
                data-id="${section.id}">↩</button>
      </div>`;

    row.querySelector('.btn-restore').addEventListener('click', async (e) => {
      e.stopPropagation();
      await db.unarchiveSection(section.id);
      await loadData();
      selectArchivedPiece(pieceId);
    });

    listEl.appendChild(row);
  });
}

async function unarchivePiece(pieceId) {
  const piece = allPieces.find((p) => p.id === pieceId);
  if (!piece) return;

  const ok = await DialogService.confirm(
    'Restore "' + piece.title + '" to your repertoire?',
  );
  if (!ok) return;

  piece.archived = false;
  await db.updatePiece(piece);

  const pieceSections = allSections.filter((s) => s.pieceId === pieceId);
  for (const section of pieceSections) {
    if (section.archived) {
      section.archived = false;
      await db.updateSection(section);
    }
  }

  selectedPieceId = null;
  await loadData();
  backToPracticeToday();

  await DialogService.alert(
    '"' + piece.title + '" restored to repertoire.',
    'success',
  );
}

async function restoreArchivedSection(section) {
  const newBpmStr = await DialogService.input(
    'Restore "' +
      (section.section || section.barRange || '') +
      '"?\n\nEnter new start tempo (BPM).\n' +
      'Current: ' +
      (section.currentBpm || 60) +
      ' BPM — try ' +
      Math.round((section.currentBpm || 60) * 0.75) +
      ' BPM or lower:',
    Math.round((section.currentBpm || 60) * 0.75),
    'number',
  );

  if (newBpmStr === null) return;

  const newBpm =
    parseInt(newBpmStr, 10) ||
    Math.round((section.currentBpm || 60) * 0.75);

  section.archived = false;
  section.currentBpm = newBpm;
  section.stability = 1.0;
  section.difficulty = 0.3;
  section.initialDaysDone = 0;
  const _now = new Date();
  section.nextPracticeDate = _now.getFullYear() + '-' +
    String(_now.getMonth() + 1).padStart(2, '0') + '-' +
    String(_now.getDate()).padStart(2, '0');
  section.lastPracticeDate = null;

  await db.updateSection(section);
  await loadData();

  await DialogService.alert(
    '✅ Section restored at ' + newBpm + ' BPM.\n\n' +
      'Planning reset to day 1.',
    'success',
  );
}

async function deleteArchivedSection(section) {
  const ok = await DialogService.confirm(
    '🗑 Permanently delete "' +
      (section.section || section.barRange || '') +
      '"?\n\n' +
      'Practice history will be preserved.\n' +
      'This cannot be undone.',
  );
  if (!ok) return;

  section.archived = true;
  section.deleted = true;
  await db.updateSection(section);
  await loadData();
}

async function deletePiece(pieceId) {
  const piece = allPieces.find((p) => p.id === pieceId);
  if (!piece) return;

  const first = await DialogService.confirm(
    '⚠️ Permanently delete "' +
      piece.title +
      '"?\n\n' +
      'Practice history will be preserved in statistics.\n' +
      'This cannot be undone.',
  );
  if (!first) return;

  const second = await DialogService.confirm(
    'Are you absolutely sure?\n\nAll sections will be permanently deleted.',
  );
  if (!second) return;

  await db.deletePiecePermanently(pieceId);
  selectedPieceId = null;
  await loadData();
  backToPracticeToday();
}

/** Laatste oefendatum: sectie-veld of sessiegeschiedenis (stats-only). */
function getPieceLastPracticedDate(pieceId) {
  const dates = [];

  allSections
    .filter((s) => s.pieceId === pieceId && s.lastPracticeDate)
    .forEach((s) => dates.push(new Date(s.lastPracticeDate)));

  allSessions
    .filter((s) => s.pieceId === pieceId && s.date)
    .forEach((s) => dates.push(new Date(s.date)));

  if (dates.length === 0) return null;
  return dates.sort((a, b) => b - a)[0];
}

function sortPieces(pieces) {
  switch (currentSort) {
    case 'title':
      return [...pieces].sort((a, b) => a.title.localeCompare(b.title));

    case 'lastPractice':
      return [...pieces].sort((a, b) => {
        const lastA = getPieceLastPracticedDate(a.id) || new Date(0);
        const lastB = getPieceLastPracticedDate(b.id) || new Date(0);
        return lastB - lastA;
      });

    case 'created':
      return [...pieces].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );

    case 'due':
    default:
      return [...pieces].sort((a, b) => {
        const dueA = dueSections.filter((s) => s.pieceId === a.id).length;
        const dueB = dueSections.filter((s) => s.pieceId === b.id).length;
        if (dueB !== dueA) return dueB - dueA;
        return a.title.localeCompare(b.title);
      });
  }
}

function backToPracticeToday() {
  selectedPieceId = null;
  revokeCurrentAudioUrl();

  document.getElementById('mainPanelTitle').textContent = 'Practice Today';
  document.getElementById('mainPanelActions').innerHTML = '';

  document.getElementById('pieceDetailSection').classList.add('hidden');
  document.getElementById('noPieceSelected').classList.add('hidden');

  const todaySection = document.getElementById('todaySection');
  if (todaySection) {
    todaySection.style.display = 'block';
  }

  document.querySelectorAll('.piece-item').forEach((el) => {
    el.classList.remove('active');
  });

  const btnAddSection = document.getElementById('btnAddSection');
  if (btnAddSection) btnAddSection.style.display = '';
}

function selectPiece(pieceId) {
  log('UI', 'selectPiece', { pieceId });
  selectedPieceId = pieceId;

  document.querySelectorAll('.piece-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.pieceId === pieceId);
  });

  renderPieceDetail(pieceId);
}

function renderPieceDetail(pieceId) {
  const piece = allPieces.find((p) => p.id === pieceId);
  if (!piece) return;

  if (piece.archived) {
    selectArchivedPiece(pieceId);
    return;
  }

  const btnAddSection = document.getElementById('btnAddSection');
  if (btnAddSection) btnAddSection.style.display = '';

  const noPieceEl = document.getElementById('noPieceSelected');
  const detailEl = document.getElementById('pieceDetailSection');
  const headingEl = document.getElementById('pieceDetailHeading');
  const countEl = document.getElementById('sectionCount');
  const titleEl = document.getElementById('mainPanelTitle');
  const actionsEl = document.getElementById('mainPanelActions');

  noPieceEl.classList.add('hidden');
  detailEl.classList.remove('hidden');

  const todaySection = document.getElementById('todaySection');
  if (todaySection) {
    todaySection.style.display = 'none';
  }

  titleEl.innerHTML =
    escapeHtml(piece.title) +
    (piece.composer
      ? ' <span style="font-size:13px; ' +
        'font-weight:500; ' +
        'color:var(--text-muted);">' +
        escapeHtml(piece.composer) +
        '</span>'
      : '');
  headingEl.textContent = 'Sections';

  actionsEl.innerHTML = `
    <button class="btn btn-secondary btn-sm"
            id="btnBackToToday"
            style="color:var(--accent);
                   border-color:var(--accent-light);">
      ← Today
    </button>
    ${pieceLinkButtonHtml(piece)}
    ${pieceAudioButtonHtml(piece)}
    <button class="btn btn-secondary btn-sm" id="btnEditPiece">✏️ Edit</button>
    <button class="btn btn-danger btn-sm" id="btnArchivePiece">Archive</button>
  `;

  document
    .getElementById('btnBackToToday')
    ?.addEventListener('click', backToPracticeToday);

  document
    .getElementById('btnPieceLink')
    ?.addEventListener('click', () => editPieceLink(pieceId));

  document
    .getElementById('btnPieceAudio')
    ?.addEventListener('click', () => managePieceAudio(pieceId));

  document
    .getElementById('btnEditPiece')
    .addEventListener('click', () => editPiece(pieceId));
  document
    .getElementById('btnArchivePiece')
    .addEventListener('click', () => archivePiece(pieceId));

  const pieceSections = allSections
    .filter(
      (s) => s.pieceId === pieceId && !s.archived && !s.deleted,
    )
    .sort((a, b) => {
      const dateA = a.nextPracticeDate
        ? toDateOnly(a.nextPracticeDate)
        : new Date(0);
      const dateB = b.nextPracticeDate
        ? toDateOnly(b.nextPracticeDate)
        : new Date(0);
      return dateA - dateB;
    });

  const archivedPieceSections = allSections.filter(
    (s) => s.pieceId === pieceId && s.archived && !s.deleted,
  );

  countEl.textContent = pieceSections.length;

  const listEl = document.getElementById('sectionsList');

  const statsOnlyBar = document.createElement('div');
  statsOnlyBar.className = 'piece-stats-only-bar';
  statsOnlyBar.innerHTML = `
    <label class="stats-only-toggle">
      <input type="checkbox" id="chkStatsOnly" ${
        piece.statsOnly ? 'checked' : ''
      }>
      <span class="stats-only-toggle-label">Time tracking only</span>
    </label>
    <p class="stats-only-hint">
      Exclude this piece from planning. Practice in Analysis mode
      to log time for statistics — ideal for sight reading or warm-ups.
    </p>`;
  listEl.innerHTML = '';
  listEl.appendChild(statsOnlyBar);

  document.getElementById('chkStatsOnly')?.addEventListener('change', (e) => {
    togglePieceStatsOnly(pieceId, e.target.checked);
  });

  void appendPieceAudioPlayer(listEl, piece);

  if (pieceSections.length === 0 && archivedPieceSections.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'empty-state';
    emptyEl.style.padding = '24px';
    emptyEl.innerHTML = `
      <div class="empty-state-icon">🎵</div>
      <div class="empty-state-title">No sections yet</div>
      <div class="empty-state-text">
        Add a section to start practicing.
      </div>`;
    listEl.appendChild(emptyEl);
    return;
  }

  const today = getTodayLocal();

  pieceSections.forEach((section) => {
    const nextDate = section.nextPracticeDate
      ? toDateOnly(section.nextPracticeDate)
      : null;
    const isDue = nextDate && nextDate <= today;
    const diffDays = nextDate
      ? Math.round((nextDate - today) / 86400000)
      : null;

    let nextText = '—';
    let nextColor = 'var(--text-muted)';
    if (piece.statsOnly) {
      nextText = 'Tracking';
      nextColor = 'var(--text-muted)';
    } else if (isDue) {
      nextText = 'Due';
      nextColor = 'var(--accent-2)';
    } else if (diffDays === 1) {
      nextText = 'Tomorrow';
      nextColor = 'var(--warning)';
    } else if (diffDays !== null) {
      nextText = 'in ' + diffDays + 'd';
      nextColor = 'var(--success)';
    }

    const comfortPct = Math.round((1 - (section.difficulty || 0.3)) * 100);

    const bpmText = formatBpm(section);

    const row = document.createElement('div');
    row.className = 'section-row';
    row.innerHTML = `
      <div class="section-row-name">
        ${escapeHtml(section.section || section.barRange || 'Unnamed section')}
      </div>
      <div class="section-row-stability">
        S: ${Math.round((section.stability || 1) * 10) / 10}d · ${comfortPct}%${bpmText ? ' · 🎵 ' + bpmText : ''}
      </div>
      <div class="section-row-next" style="color: ${nextColor}">
        ${nextText}
      </div>
      <div class="section-row-actions">
        <button class="section-action-btn btn-practice"
                title="Practice now" data-id="${section.id}">▶</button>
        <button class="section-action-btn btn-edit-section"
                title="Edit section" data-id="${section.id}">✏️</button>
        <button class="section-action-btn danger btn-archive-section"
                title="Archive section" data-id="${section.id}">🗑</button>
        <button class="section-action-btn danger btn-delete-section"
                title="Delete permanently" data-id="${section.id}">💀</button>
      </div>`;

    row.querySelector('.btn-practice').addEventListener('click', (e) => {
      e.stopPropagation();
      startPractice(section.id, section);
    });

    row.querySelector('.btn-edit-section').addEventListener('click', (e) => {
      e.stopPropagation();
      editSection(section);
    });

    row.querySelector('.btn-archive-section').addEventListener('click', (e) => {
      e.stopPropagation();
      archiveSection(section.id);
    });

    row.querySelector('.btn-delete-section').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteActiveSection(section);
    });

    listEl.appendChild(row);
  });

  if (archivedPieceSections.length > 0) {
    const archHeader = document.createElement('div');
    archHeader.className = 'archived-sections-header';
    archHeader.innerHTML = `
      <span class="archived-sections-title">
        Archived Sections (${archivedPieceSections.length})
      </span>`;
    listEl.appendChild(archHeader);

    archivedPieceSections.forEach((section) => {
      const row = document.createElement('div');
      row.className = 'section-row archived';
      row.innerHTML = `
        <div class="section-row-name">
          ${escapeHtml(section.section || section.barRange || 'Unnamed section')}
        </div>
        <div class="section-row-stability">
          S: ${Math.round((section.stability || 1) * 10) / 10}d
        </div>
        <div class="section-row-actions" style="opacity:1;">
          <button class="section-action-btn btn-restore"
                  title="Restore section"
                  data-id="${section.id}">↩</button>
          <button class="section-action-btn danger btn-delete-archived-section"
                  title="Delete permanently"
                  data-id="${section.id}">🗑</button>
        </div>`;

      row.querySelector('.btn-restore').addEventListener('click', async (e) => {
        e.stopPropagation();
        await db.unarchiveSection(section.id);
        await loadData();
        renderPieceDetail(pieceId);
      });

      row
        .querySelector('.btn-delete-archived-section')
        .addEventListener('click', async (e) => {
          e.stopPropagation();
          await deleteArchivedSection(section);
        });

      listEl.appendChild(row);
    });
  }
}

function startPractice(sectionId, section) {
  const params = new URLSearchParams({
    section: sectionId,
    currentBpm: section.currentBpm || 60,
    targetBpm: section.targetBpm || 100,
  });
  window.location.href = 'practice-session.html?' + params.toString();
}

async function togglePieceStatsOnly(pieceId, enabled) {
  const piece = allPieces.find((p) => p.id === pieceId);
  if (!piece) return;

  piece.statsOnly = enabled;
  await db.updatePiece(piece);
  dueSections = await db.getDueSections();
  renderDueList();
  renderPiecesList();
  renderPieceDetail(pieceId);
  log('DB', 'togglePieceStatsOnly', { pieceId, statsOnly: enabled });
}

async function addPiece() {
  const title = await DialogService.input('Enter piece title:', '', 'text');
  if (!title || !title.trim()) return;

  const composer = await DialogService.input('Composer (optional):', '', 'text');

  const piece = {
    id: generateGUID(),
    title: title.trim(),
    composer: (composer || '').trim(),
    archived: false,
    createdAt: new Date().toISOString(),
  };

  await db.addPiece(piece);
  log('DB', 'addPiece', { id: piece.id, title: piece.title });
  await loadData();
  selectPiece(piece.id);
}

async function addSection(pieceId) {
  const name = await DialogService.input(
    'Section name (e.g. "Bars 1–8" or "RH melody"):',
    '',
    'text',
  );
  if (!name || !name.trim()) return;

  const currentBpmStr = await DialogService.input('Start tempo (BPM):', '60', 'number');
  const targetBpmStr = await DialogService.input('Target tempo (BPM):', '100', 'number');

  const currentBpm = parseInt(currentBpmStr, 10) || 60;
  const targetBpm = parseInt(targetBpmStr, 10) || 100;

  const piece = allPieces.find((p) => p.id === pieceId);

  await db.addSection({
    id: generateGUID(),
    pieceId,
    title: piece?.title || '',
    section: name.trim(),
    currentBpm,
    targetBpm,
  });
  log('DB', 'addSection', { pieceId, name: name.trim(), currentBpm, targetBpm });

  await loadData();
  renderPieceDetail(pieceId);
}

async function editPiece(pieceId) {
  const piece = allPieces.find((p) => p.id === pieceId);
  if (!piece) return;

  const newTitle = await DialogService.input('Edit piece title:', piece.title, 'text');
  if (!newTitle || !newTitle.trim()) return;

  const newComposer = await DialogService.input(
    'Composer:',
    piece.composer || '',
    'text',
  );

  piece.title = newTitle.trim();
  piece.composer = (newComposer || '').trim();
  await db.updatePiece(piece);
  await loadData();
  renderPieceDetail(pieceId);
}

async function editSection(section) {
  const newName = await DialogService.input(
    'Edit section name:',
    section.section || section.barRange || '',
    'text',
  );
  if (!newName || !newName.trim()) return;

  const newCurrentBpm = await DialogService.input(
    'Current tempo (BPM):',
    section.currentBpm || 60,
    'number',
  );
  const newTargetBpm = await DialogService.input(
    'Target tempo (BPM):',
    section.targetBpm || 100,
    'number',
  );

  section.section = newName.trim();
  section.currentBpm = parseInt(newCurrentBpm, 10) || section.currentBpm;
  section.targetBpm = parseInt(newTargetBpm, 10) || section.targetBpm;

  await db.updateSection(section);
  await loadData();
  renderPieceDetail(selectedPieceId);
}

async function editSectionBpm(section) {
  const currentBpmStr = await DialogService.input(
    'Current tempo for "' +
      (section.section || section.barRange || '') +
      '" (BPM):',
    section.currentBpm || 60,
    'number',
  );
  if (currentBpmStr === null) return;

  const targetBpmStr = await DialogService.input(
    'Target tempo for "' +
      (section.section || section.barRange || '') +
      '" (BPM):',
    section.targetBpm || 100,
    'number',
  );
  if (targetBpmStr === null) return;

  const newCurrent = parseInt(currentBpmStr, 10);
  const newTarget = parseInt(targetBpmStr, 10);

  if (
    isNaN(newCurrent) ||
    isNaN(newTarget) ||
    newCurrent <= 0 ||
    newTarget <= 0
  ) {
    await DialogService.alert(
      'Invalid tempo values. ' + 'Please enter positive numbers.',
      'warning',
    );
    return;
  }

  if (newCurrent > newTarget) {
    await DialogService.alert(
      'Current tempo cannot exceed target tempo.',
      'warning',
    );
    return;
  }

  section.currentBpm = newCurrent;
  section.targetBpm = newTarget;

  await db.updateSection(section);

  allSections = await db.getAllSections();
  dueSections = await db.getDueSections();
  renderDueList();

  await DialogService.alert(
    'Tempo updated: ' + newCurrent + ' / ' + newTarget + ' BPM',
    'success',
  );
}

async function archivePiece(pieceId) {
  const piece = allPieces.find((p) => p.id === pieceId);
  if (!piece) return;

  const confirmed = await DialogService.confirm(
    'Archive "' +
      piece.title +
      '"?\n\nPractice history will be preserved.',
  );
  if (!confirmed) return;

  await db.archivePiece(pieceId);
  log('DB', 'archivePiece', { pieceId });
  selectedPieceId = null;

  await loadData();
  backToPracticeToday();
}

async function archiveSection(sectionId) {
  const confirmed = await DialogService.confirm(
    'Archive this section?\n\nPractice history will be preserved.',
  );
  if (!confirmed) return;

  await db.archiveSection(sectionId);
  log('DB', 'archiveSection', { sectionId });
  await loadData();
  renderPieceDetail(selectedPieceId);
}

async function deleteActiveSection(section) {
  const confirmed = await DialogService.confirm(
    '🗑 Permanently delete "' +
      (section.section || section.barRange || '') +
      '"?\n\nPractice history will be preserved in statistics.\nThis cannot be undone.',
  );
  if (!confirmed) return;

  section.archived = true;
  section.deleted = true;
  await db.updateSection(section);
  log('DB', 'deleteActiveSection', { sectionId: section.id });
  await loadData();
  renderPieceDetail(selectedPieceId);
}

async function updateStreakStats() {
  const sessions = await db.getAllSessions();
  const dayMs = 86400000;

  if (!sessions || sessions.length === 0) {
    document.getElementById('statCurrentStreak').textContent = '0';
    document.getElementById('statMaxStreak').textContent = '0';
    return;
  }

  const uniqueDays = [
    ...new Set(
      sessions.map((s) => {
        const d = new Date(s.date);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      }),
    ),
  ].sort((a, b) => a - b);

  let maxStreak = 1;
  let run = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    if (uniqueDays[i] - uniqueDays[i - 1] === dayMs) {
      run++;
      if (run > maxStreak) maxStreak = run;
    } else {
      run = 1;
    }
  }

  const today = getTodayLocal().getTime();
  const lastDay = uniqueDays[uniqueDays.length - 1];
  const diffToToday = Math.round((today - lastDay) / dayMs);

  let currentStreak = 0;
  if (diffToToday <= 1) {
    currentStreak = 1;
    for (let i = uniqueDays.length - 2; i >= 0; i--) {
      if (uniqueDays[i + 1] - uniqueDays[i] === dayMs) {
        currentStreak++;
      } else break;
    }
  }

  document.getElementById('statCurrentStreak').textContent = currentStreak;
  document.getElementById('statMaxStreak').textContent = maxStreak;
}

function bindEvents() {
  document.getElementById('btnAddPiece').addEventListener('click', addPiece);

  document.getElementById('pieceAudioFileInput')?.addEventListener(
    'change',
    handlePieceAudioFileSelected,
  );

  document.getElementById('btnAddSection').addEventListener('click', () => {
    if (selectedPieceId) addSection(selectedPieceId);
  });

  document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderPiecesList();
  });

  document.getElementById('btnToggleArchive')?.addEventListener('click', () => {
    showArchived = !showArchived;
    renderArchivedPiecesList();
  });
}
