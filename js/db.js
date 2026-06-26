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
import {
  generateGUID,
  toDateOnly,
  getTodayLocal,
  isSectionInPlanning,
} from './utils.js';

const DB_NAME = 'ModusPracticaProDB';
const DB_VERSION = 2;
const STORES = {
  PIECES: 'pieces',
  SECTIONS: 'sections',
  SESSIONS: 'sessions',
  PIECE_AUDIO: 'pieceAudio',
};

const MAX_PIECE_AUDIO_BYTES = 50 * 1024 * 1024;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === 'string' ? result.split(',')[1] : '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mimeType = 'audio/mpeg') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function isProExportFormat(data) {
  return (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Array.isArray(data.pieces)
  );
}

function isProV6ExportFormat(data) {
  return (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    data.profileData &&
    typeof data.profileData === 'object' &&
    !Array.isArray(data.profileData)
  );
}

const PRO_DIFFICULTY_MAP = {
  Easy: 0.1,
  Normal: 0.2,
  Moderate: 0.3,
  Fair: 0.4,
  Difficult: 0.6,
  Hard: 0.7,
  Poor: 0.75,
  VeryHard: 0.85,
  FreePractice: 0.3,
  Good: 0.2,
};

function proToDifficulty(val) {
  if (typeof val === 'number' && !isNaN(val)) {
    return Math.round(val * 100) / 100;
  }
  return PRO_DIFFICULTY_MAP[val] ?? 0.3;
}

function convertProV6ToImportFormat(data) {
  const profileKeys = Object.keys(data.profileData || {});
  if (profileKeys.length === 0) {
    throw new Error('No profile data found in backup.');
  }
  const profile = data.profileData[profileKeys[0]];
  const musicPieces = profile.musicPieces || [];
  const globalHistory = profile.practiceHistory || [];

  const pieces = [];
  const sections = [];
  const sessions = [];
  const sessionKeys = new Set();

  for (const piece of musicPieces) {
    pieces.push({
      id: piece.id,
      title: piece.title || 'Unknown',
      composer: piece.composer || '',
      archived: (piece.lifecycleState || 0) !== 0,
      createdAt: piece.creationDate
        ? new Date(piece.creationDate).toISOString()
        : new Date().toISOString(),
    });

    for (const bs of piece.barSections || []) {
      const stability =
        typeof bs.stability === 'number'
          ? Math.max(1, bs.stability)
          : Math.max(1, Number(bs.interval) || 1);

      const difficulty = proToDifficulty(bs.difficulty);
      const stage = bs.practiceScheduleStage || 0;
      const initialDaysDone =
        stage >= 3 ? 3 : stage >= 2 ? 2 : stage >= 1 ? 1 : 0;

      sections.push({
        id: bs.id,
        pieceId: piece.id,
        title: piece.title || 'Unknown',
        section: bs.barRange || bs.description || '',
        barRange: bs.barRange || '',
        description: bs.description || '',
        stability,
        difficulty,
        initialDaysDone,
        currentBpm: bs.currentBpm ?? 60,
        targetBpm: bs.targetBpm ?? 100,
        targetReps: bs.targetRepetitions || 6,
        lastPracticeDate: bs.lastPracticeDate || null,
        nextPracticeDate:
          bs.nextReviewDate || new Date().toISOString(),
        nextReviewDate: bs.nextReviewDate || new Date().toISOString(),
        archived:
          (bs.lifecycleState || 0) === 2 ||
          (piece.lifecycleState || 0) !== 0,
        consolidated: (bs.lifecycleState || 0) === 2,
        practiceScheduleStage: stage,
        createdAt: bs.startDate || new Date().toISOString(),
      });

      for (const ps of piece.practiceSessions || []) {
        if (ps.sectionId !== bs.id) continue;
        if (sessionKeys.has(ps.id)) continue;
        sessionKeys.add(ps.id);

        const correct = ps.correctRepetitions || ps.repetitions || 0;
        const failed =
          ps.failedAttempts ||
          ps.executionFailures ||
          ps.attemptsTillSuccess ||
          0;
        const outcome = ps.sessionOutcome || 'FreePractice';
        const isFree = ps.isFreePractice || outcome === 'FreePractice';

        sessions.push({
          sectionId: bs.id,
          pieceId: piece.id,
          pieceTitle: piece.title || 'Unknown',
          sectionName: bs.barRange || '',
          date: ps.date || new Date().toISOString(),
          duration:
            typeof ps.durationSeconds === 'number'
              ? ps.durationSeconds
              : typeof ps.duration === 'number'
                ? ps.duration > 1000
                  ? Math.round(ps.duration / 1000)
                  : ps.duration
                : 0,
          type: isFree ? 'analysis' : 'training',
          feedback: isFree
            ? 'FreePractice'
            : outcome + ' (' + correct + 'C/' + failed + 'F)',
          performance: ps.performance || 'Good',
          notes: ps.notes || '',
          correctRepetitions: correct,
          failedAttempts: failed,
          streakResets: ps.streakResets || ps.totalFailures || 0,
          targetRepetitions:
            ps.targetRepetitions || bs.targetRepetitions || 6,
          energyLevel: ps.energyLevel || 'Normal',
          stability: ps.stability || stability,
          difficulty:
            ps.difficulty !== undefined
              ? proToDifficulty(ps.difficulty)
              : difficulty,
          currentBpm: ps.currentBpm || bs.currentBpm || 60,
          targetBpm: ps.targetBpm || bs.targetBpm || 100,
          sessionOutcome: outcome,
          entryCost: ps.entryCost || null,
        });
      }
    }
  }

  for (const ph of globalHistory) {
    if (sessionKeys.has(ph.id)) continue;
    sessionKeys.add(ph.id);

    const correct = ph.correctRepetitions || ph.repetitions || 0;
    const failed = ph.failedAttempts || ph.executionFailures || 0;
    const outcome = ph.sessionOutcome || 'FreePractice';
    const isFree = ph.isFreePractice || outcome === 'FreePractice';

    const matchedSection = sections.find((s) => s.id === ph.barSectionId);

    sessions.push({
      sectionId: ph.barSectionId || null,
      pieceId: ph.musicPieceId || null,
      pieceTitle: ph.musicPieceTitle || 'Unknown',
      sectionName: ph.barSectionRange || '',
      date: ph.date || new Date().toISOString(),
      duration:
        typeof ph.durationSeconds === 'number'
          ? ph.durationSeconds
          : typeof ph.duration === 'number'
            ? ph.duration > 1000
              ? Math.round(ph.duration / 1000)
              : ph.duration
            : 0,
      type: isFree ? 'analysis' : 'training',
      feedback: isFree
        ? 'FreePractice'
        : outcome + ' (' + correct + 'C/' + failed + 'F)',
      performance: ph.performance || 'Good',
      notes: ph.notes || '',
      correctRepetitions: correct,
      failedAttempts: failed,
      streakResets: ph.streakResets || ph.totalFailures || 0,
      targetRepetitions: ph.targetRepetitions || 6,
      energyLevel: ph.energyLevel || 'Normal',
      stability: ph.stability || matchedSection?.stability || 1,
      difficulty:
        ph.difficulty !== undefined
          ? proToDifficulty(ph.difficulty)
          : matchedSection?.difficulty || 0.3,
      currentBpm: ph.currentBpm || 60,
      targetBpm: ph.targetBpm || 100,
      sessionOutcome: outcome,
      entryCost: ph.entryCost || null,
    });
  }

  return { pieces, sections, sessions };
}

export const db = {
  instance: null,

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORES.PIECES)) {
          database.createObjectStore(STORES.PIECES, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(STORES.SECTIONS)) {
          database.createObjectStore(STORES.SECTIONS, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(STORES.SESSIONS)) {
          database.createObjectStore(STORES.SESSIONS, {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
        if (!database.objectStoreNames.contains(STORES.PIECE_AUDIO)) {
          database.createObjectStore(STORES.PIECE_AUDIO, { keyPath: 'pieceId' });
        }
      };

      request.onsuccess = (event) => {
        this.instance = event.target.result;
        resolve(this.instance);
      };

      request.onerror = (event) => reject(event.target.error);
    });
  },

  _transaction(storeNames, mode = 'readonly') {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    return this.instance.transaction(names, mode);
  },

  async _getStore(storeName, mode = 'readonly') {
    if (!this.instance) await this.init();
    const transaction = this._transaction(storeName, mode);
    return {
      store: transaction.objectStore(storeName),
      transaction,
    };
  },

  async _clearStore(storeName) {
    const { store } = await this._getStore(storeName, 'readwrite');
    return requestToPromise(store.clear());
  },

  async _put(storeName, record) {
    const { store } = await this._getStore(storeName, 'readwrite');
    return requestToPromise(store.put(record));
  },

  async _add(storeName, record) {
    const { store } = await this._getStore(storeName, 'readwrite');
    return requestToPromise(store.add(record));
  },

  async _get(storeName, id) {
    const { store } = await this._getStore(storeName, 'readonly');
    return requestToPromise(store.get(id));
  },

  async _getAll(storeName) {
    const { store } = await this._getStore(storeName, 'readonly');
    return requestToPromise(store.getAll());
  },

  async _delete(storeName, id) {
    const { store } = await this._getStore(storeName, 'readwrite');
    return requestToPromise(store.delete(id));
  },

  // ── PIECES ──────────────────────────────────────────────────────────────

  async addPiece(pieceData) {
    const now = new Date().toISOString();
    const piece = {
      id: pieceData.id || generateGUID(),
      title: pieceData.title || 'Untitled',
      composer: pieceData.composer || '',
      link: pieceData.link || '',
      audioFileName: pieceData.audioFileName || '',
      notes: pieceData.notes || '',
      statsOnly: pieceData.statsOnly ?? false,
      archived: false,
      createdAt: pieceData.createdAt || now,
      ...pieceData,
      statsOnly: pieceData.statsOnly ?? false,
      archived: pieceData.archived ?? false,
    };
    await this._add(STORES.PIECES, piece);
    return piece.id;
  },

  async updatePiece(pieceData) {
    if (!pieceData?.id) {
      throw new Error('updatePiece requires pieceData.id');
    }
    await this._put(STORES.PIECES, pieceData);
    return pieceData.id;
  },

  async getPiece(id) {
    return this._get(STORES.PIECES, id);
  },

  async getAllPieces() {
    return this._getAll(STORES.PIECES);
  },

  async archivePiece(id) {
    const piece = await this.getPiece(id);
    if (!piece) return;
    piece.archived = true;
    await this._put(STORES.PIECES, piece);

    const sections = await this.getSectionsByPiece(id);
    for (const section of sections) {
      section.archived = true;
      await this._put(STORES.SECTIONS, section);
    }
  },

  async deletePiecePermanently(id) {
    const piece = await this.getPiece(id);
    if (!piece) return;

    const sections = await this.getSectionsByPiece(id);
    const sectionIds = sections.map((s) => s.id);
    const pieceTitle = piece.title;

    return new Promise((resolve, reject) => {
      const transaction = this._transaction(
        [STORES.PIECES, STORES.SECTIONS, STORES.SESSIONS, STORES.PIECE_AUDIO],
        'readwrite',
      );
      const piecesStore = transaction.objectStore(STORES.PIECES);
      const sectionsStore = transaction.objectStore(STORES.SECTIONS);
      const sessionsStore = transaction.objectStore(STORES.SESSIONS);
      const audioStore = transaction.objectStore(STORES.PIECE_AUDIO);

      transaction.oncomplete = () => resolve();
      transaction.onerror = (event) => reject(event.target.error);
      transaction.onabort = (event) =>
        reject(event.target.error || new Error('Transaction aborted'));

      piecesStore.delete(id);
      audioStore.delete(id);

      for (const sectionId of sectionIds) {
        sectionsStore.delete(sectionId);
      }

      const cursorRequest = sessionsStore.openCursor();
      cursorRequest.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (sectionIds.includes(cursor.value.sectionId)) {
            const updated = { ...cursor.value };
            updated.sectionId = null;
            if (!updated.deletedPieceTitle) {
              updated.deletedPieceTitle = pieceTitle;
            }
            if (!updated.pieceTitle) {
              updated.pieceTitle = pieceTitle;
            }
            cursor.update(updated);
          }
          cursor.continue();
        }
      };
      cursorRequest.onerror = () => transaction.abort();
    });
  },

  // ── SECTIONS ────────────────────────────────────────────────────────────

  async addSection(sectionData) {
    const now = new Date().toISOString();
    const section = {
      ...sectionData,
      id: sectionData.id || generateGUID(),
      pieceId: sectionData.pieceId,
      section: sectionData.section || '',
      stability: sectionData.stability ?? 1.0,
      difficulty: sectionData.difficulty ?? 0.3,
      initialDaysDone: sectionData.initialDaysDone ?? 0,
      currentBpm: sectionData.currentBpm || 60,
      targetBpm: sectionData.targetBpm || 100,
      targetReps: sectionData.targetReps || 3,
      nextPracticeDate: sectionData.nextPracticeDate || now,
      lastPracticeDate: sectionData.lastPracticeDate ?? null,
      archived: sectionData.archived ?? false,
      consolidated: sectionData.consolidated ?? false,
      createdAt: sectionData.createdAt || now,
    };
    await this._add(STORES.SECTIONS, section);
    return section.id;
  },

  async updateSection(sectionData) {
    if (!sectionData?.id) {
      throw new Error('updateSection requires sectionData.id');
    }
    await this._put(STORES.SECTIONS, sectionData);
    return sectionData.id;
  },

  async getSection(id) {
    return this._get(STORES.SECTIONS, id);
  },

  async getAllSections() {
    return this._getAll(STORES.SECTIONS);
  },

  async getSectionsByPiece(pieceId) {
    const all = await this._getAll(STORES.SECTIONS);
    return all.filter((s) => s.pieceId === pieceId);
  },

  async getDueSections() {
    const [all, pieces] = await Promise.all([
      this._getAll(STORES.SECTIONS),
      this.getAllPieces(),
    ]);
    const pieceById = new Map(pieces.map((p) => [p.id, p]));
    const today = getTodayLocal();
    return all.filter((section) => {
      if (!isSectionInPlanning(section, pieceById)) {
        return false;
      }
      // Datum-only vergelijking (lokaal), consistent met getForecastSections.
      const nextDate = toDateOnly(section.nextPracticeDate);
      if (!nextDate) return false;
      return nextDate <= today;
    });
  },

  async getForecastSections(daysAhead = 28) {
    const [all, pieces] = await Promise.all([
      this._getAll(STORES.SECTIONS),
      this.getAllPieces(),
    ]);
    const pieceById = new Map(pieces.map((p) => [p.id, p]));
    const today = new Date();
    const maxDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + daysAhead
    );

    return all
      .filter((section) => {
        if (!isSectionInPlanning(section, pieceById)) return false;
        const nextDate = toDateOnly(section.nextPracticeDate);
        if (!nextDate) return false;
        return nextDate <= maxDate;
      })
      .sort(
        (a, b) =>
          toDateOnly(a.nextPracticeDate) - toDateOnly(b.nextPracticeDate),
      );
  },

  async archiveSection(id) {
    const section = await this.getSection(id);
    if (!section) return;
    section.archived = true;
    await this._put(STORES.SECTIONS, section);
  },

  async unarchiveSection(id) {
    const section = await this.getSection(id);
    if (!section) return;
    section.archived = false;
    return this.updateSection(section);
  },

  // ── SESSIONS ────────────────────────────────────────────────────────────

  async addSession(sessionData) {
    const session = {
      ...sessionData,
      type: sessionData.type || 'training',
    };
    return this._add(STORES.SESSIONS, session);
  },

  async deleteSession(id) {
    return this._delete(STORES.SESSIONS, id);
  },

  async getAllSessions() {
    return this._getAll(STORES.SESSIONS);
  },

  async getSessionsBySection(sectionId) {
    const all = await this.getAllSessions();
    return all.filter((s) => s.sectionId === sectionId);
  },

  async getPreviousNotes(sectionId) {
    const sessions = await this.getSessionsBySection(sectionId);
    const withNotes = sessions
      .filter((s) => s.notes && String(s.notes).trim())
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return withNotes.length > 0 ? withNotes[0].notes : '';
  },

  async getSessionsByPiece(pieceId) {
    const sections = await this.getSectionsByPiece(pieceId);
    const sectionIds = new Set(sections.map((s) => s.id));
    const piece = await this.getPiece(pieceId);
    const pieceTitle = piece?.title;

    const all = await this.getAllSessions();
    return all.filter(
      (s) =>
        (s.sectionId && sectionIds.has(s.sectionId)) ||
        (pieceTitle && s.pieceTitle === pieceTitle),
    );
  },

  // ── PIECE AUDIO ─────────────────────────────────────────────────────────

  async setPieceAudio(pieceId, file) {
    if (!pieceId || !file) {
      throw new Error('setPieceAudio requires pieceId and file');
    }
    if (file.size > MAX_PIECE_AUDIO_BYTES) {
      throw new Error(
        'MP3 file is too large (maximum ' +
          Math.round(MAX_PIECE_AUDIO_BYTES / (1024 * 1024)) +
          ' MB).',
      );
    }
    const isMp3 =
      file.type === 'audio/mpeg' ||
      file.type === 'audio/mp3' ||
      /\.mp3$/i.test(file.name || '');
    if (!isMp3) {
      throw new Error('Please choose an MP3 file.');
    }

    const record = {
      pieceId,
      fileName: file.name || 'audio.mp3',
      mimeType: file.type || 'audio/mpeg',
      blob: file,
      updatedAt: new Date().toISOString(),
    };
    await this._put(STORES.PIECE_AUDIO, record);

    const piece = await this.getPiece(pieceId);
    if (piece) {
      piece.audioFileName = record.fileName;
      await this.updatePiece(piece);
    }
    return record.fileName;
  },

  async getPieceAudio(pieceId) {
    return this._get(STORES.PIECE_AUDIO, pieceId);
  },

  async deletePieceAudio(pieceId) {
    await this._delete(STORES.PIECE_AUDIO, pieceId);
    const piece = await this.getPiece(pieceId);
    if (piece) {
      piece.audioFileName = '';
      await this.updatePiece(piece);
    }
  },

  async hasPieceAudio(pieceId) {
    const record = await this.getPieceAudio(pieceId);
    return !!(record && record.blob);
  },

  // ── IMPORT / EXPORT ─────────────────────────────────────────────────────

  async exportAllData() {
    const [pieces, sections, sessions, audioRecords] = await Promise.all([
      this.getAllPieces(),
      this._getAll(STORES.SECTIONS),
      this.getAllSessions(),
      this._getAll(STORES.PIECE_AUDIO),
    ]);

    const pieceById = new Map(pieces.map((p) => [p.id, p]));

    const sectionsWithTitles = sections.map((s) => {
      const piece = pieceById.get(s.pieceId);
      return {
        ...s,
        title: piece?.title || s.title || 'Unknown',
      };
    });

    const pieceAudio = [];
    for (const rec of audioRecords) {
      if (!rec?.blob || !rec.pieceId) continue;
      pieceAudio.push({
        pieceId: rec.pieceId,
        fileName: rec.fileName || 'audio.mp3',
        mimeType: rec.mimeType || 'audio/mpeg',
        dataBase64: await blobToBase64(rec.blob),
      });
    }

    const payload = {
      version: 'pro-1.1',
      exportDate: new Date().toISOString(),
      sections: sectionsWithTitles,
      sessions,
      pieces,
      pieceAudio,
    };

    return JSON.stringify(payload, null, 2);
  },

  _parseImportPayload(jsonString) {
    const data = JSON.parse(jsonString);
    if (typeof data === 'string') {
      return this._parseImportPayload(data);
    }
    return data;
  },

  async importDataRaw(jsonString) {
    const data = this._parseImportPayload(jsonString);
    let payload;

    if (isProV6ExportFormat(data)) {
      console.log('[db] Pro v6.x backup gedetecteerd — converteren...');
      payload = convertProV6ToImportFormat(data);
    } else if (isProExportFormat(data)) {
      console.log('[db] Nieuw Pro backup gedetecteerd — importeren...');
      payload = {
        pieces: data.pieces || [],
        sections: data.sections || [],
        sessions: data.sessions || [],
        pieceAudio: data.pieceAudio || [],
      };
    } else {
      throw new Error('Onbekend importformaat.');
    }

    // Zorg dat de database open is vóór we de transactie starten.
    if (!this.instance) await this.init();

    // Wis én schrijf alles binnen ÉÉN readwrite-transactie over de drie
    // stores. Atomair: faalt er iets, dan abort de transactie en blijft de
    // bestaande data ongewijzigd. GEEN await tussen de schrijfacties, anders
    // sluit de transactie voortijdig.
    return new Promise((resolve, reject) => {
      const tx = this._transaction(
        [STORES.PIECES, STORES.SECTIONS, STORES.SESSIONS, STORES.PIECE_AUDIO],
        'readwrite',
      );
      const piecesStore = tx.objectStore(STORES.PIECES);
      const sectionsStore = tx.objectStore(STORES.SECTIONS);
      const sessionsStore = tx.objectStore(STORES.SESSIONS);
      const audioStore = tx.objectStore(STORES.PIECE_AUDIO);

      tx.oncomplete = () => resolve();
      tx.onerror = (event) =>
        reject(event.target.error || new Error('Import transaction failed'));
      tx.onabort = (event) =>
        reject(event.target.error || new Error('Import transaction aborted'));

      try {
        piecesStore.clear();
        sectionsStore.clear();
        sessionsStore.clear();
        audioStore.clear();

        for (const piece of payload.pieces) {
          piecesStore.put(piece);
        }
        for (const section of payload.sections) {
          sectionsStore.put(section);
        }
        for (const session of payload.sessions) {
          const toInsert = { ...session };
          delete toInsert.id;
          sessionsStore.add(toInsert);
        }
        for (const audio of payload.pieceAudio || []) {
          if (!audio?.pieceId || !audio.dataBase64) continue;
          audioStore.put({
            pieceId: audio.pieceId,
            fileName: audio.fileName || 'audio.mp3',
            mimeType: audio.mimeType || 'audio/mpeg',
            blob: base64ToBlob(audio.dataBase64, audio.mimeType || 'audio/mpeg'),
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        try { tx.abort(); } catch (_) {}
        reject(err);
      }
    });
  },

  async importData(jsonString) {
    let backup = null;
    try {
      backup = await this.exportAllData();
    } catch (backupErr) {
      return Promise.reject(
        new Error(
          'Import geannuleerd: backup van bestaande data mislukt. ' +
            backupErr.message,
        ),
      );
    }

    try {
      await this.importDataRaw(jsonString);
    } catch (err) {
      console.error('Import mislukt, bezig met herstellen van backup...', err);
      try {
        await this.importDataRaw(backup);
        return Promise.reject(
          new Error(
            'Import mislukt en teruggedraaid naar vorige data. Fout: ' +
              err.message,
          ),
        );
      } catch (restoreErr) {
        return Promise.reject(
          new Error(
            'Kritieke fout: import mislukt én restore mislukt. Exporteer uw data onmiddellijk. ' +
              restoreErr.message,
          ),
        );
      }
    }
  },

  async clearAllData() {
    await Promise.all([
      this._clearStore(STORES.PIECES),
      this._clearStore(STORES.SECTIONS),
      this._clearStore(STORES.SESSIONS),
      this._clearStore(STORES.PIECE_AUDIO),
    ]);
  },
};
