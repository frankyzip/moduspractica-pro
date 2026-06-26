# Changelog — ModusPractica Pro

All notable changes to this project are documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.2.0] — 2026-06-26

### Added
- `js/db.js`: IndexedDB store `pieceAudio` (database version 2) to save a
  local reference MP3 per piece; `setPieceAudio()`, `getPieceAudio()`,
  `deletePieceAudio()`, and `hasPieceAudio()`; 50 MB size limit per file.
- `js/dashboard.js`, `css/dashboard.css`: **🎧** button in piece detail to
  choose, replace, or remove a reference MP3 from the hard drive; built-in
  audio player in the piece detail view; button turns blue when audio is
  attached.
- `js/dialog.js`: `DialogService.menu()` for replace/remove audio choices.
- `dashboard.html`: hidden file input for MP3 selection (`accept` MP3 only).
- Backup/export format `pro-1.1` includes `pieceAudio` (base64-encoded MP3s).

### Changed
- `js/dashboard.js`: link dialog copy now explicitly mentions YouTube and web
  pages; external links remain separate from reference audio.
- `manual.html`, `releases.html`: documented reference MP3 audio and clarified
  link vs audio usage.
- `about.html`, `settings.html`: version 1.2.0 · build 20260626.

## [1.1.9] — 2026-06-25

### Added
- `js/db.js`: optional `link` field on pieces (sheet music, video, etc.).
- `js/dashboard.js`, `css/dashboard.css`: link icon in repertoire list (opens
  in new tab when set); link button in piece detail to add, edit, or remove a
  URL; icon grey when empty, accent blue when a link is saved.
- `js/utils.js`: `normalizePieceLink()` and `isValidPieceLink()` helpers.
- `js/dialog.js`: `DialogService.input()` fourth parameter `allowEmpty` to
  clear optional fields on save.

### Changed
- `manual.html`: documented optional external links on pieces.
- `dashboard.html`: welcome modal updated to v1.1.9 with refreshed feature
  highlights (month view, piece links, statistics).
- `releases.html`, `dashboard.html`, `about.html`, `settings.html`: version
  1.1.9 release notes and What's new modal (`mp_whatsnew_v119`).

## [1.1.8] — 2026-06-24

### Added
- `js/practice-session.js`: Analysis mode (🔍) is locked once a section
  enters Consolidation (`initialDaysDone >= 3`) — disabled button with
  tooltip; `?free=true` on section URLs is blocked; confirm dialog when
  using **Start Training Now** after an analysis session (cold-start
  reminder).
- `js/statistics.js`, `statistics.html`, `css/statistics.css`: Practice
  Time bar chart shows Free Practice as a third segment (green); legend
  updated; day tooltip shows **Total** first and Free Practice only when
  &gt; 0.

### Changed
- `manual.html`: documented analysis phase limit, chart breakdown, and
  analysis-to-training workflow.
- `releases.html`, `dashboard.html`, `about.html`: version 1.1.8 release
  notes and What's new modal (`mp_whatsnew_v118`).

## [1.1.7] — 2026-06-23

### Fixed
- `dashboard.js`: repertoire list and "Last practiced" sort now use session
  history for stats-only pieces — fixes misleading "Never practiced" label
  when time-only sessions were logged (cause: `lastPracticeDate` is not updated
  on sections excluded from FSRS planning).

### Changed
- `dashboard.html`: What's new modal updated for v1.1.7 (month view, time
  tracking only, repertoire dates); new `mp_whatsnew_v117` localStorage key.
- `releases.html`: Version 1.1 block extended with month view, time tracking
  only, and repertoire date fixes (versions 1.1.0 – 1.1.7); new items grouped
  under a visible "Latest — versions 1.1.5 – 1.1.7" section at the top.

## [1.1.6] — 2026-06-21

### Added
- `statsOnly` flag on pieces (`js/db.js`): pieces marked for time tracking
  only are excluded from FSRS planning.
- `js/utils.js`: `isPieceStatsOnly()` and `isSectionInPlanning()` helpers
  shared across dashboard, schedule, statistics, and print report.
- `dashboard.js`, `css/dashboard.css`: **Time tracking only** toggle in the
  piece detail panel; stats-only pieces show a 📊 label in the repertoire list.
- `practice-session.js`: stats-only pieces open in Analysis mode automatically;
  training counter and scheduling engine updates are skipped.
- `manual.html`: documented Time tracking only for sight reading and warm-ups.

### Changed
- `js/db.js`: `getDueSections()` and `getForecastSections()` skip sections
  whose parent piece has `statsOnly` enabled.
- `js/schedule.js`: list and month views exclude stats-only sections from
  planning and historical due simulation.
- `js/statistics.js`, `print-report.html`: overdue, neglected, and stability
  metrics exclude stats-only sections; session time still counts in piece stats.

### Fixed
- `dashboard.js`: fixed `ReferenceError` when toggling Time tracking only —
  called non-existent `renderDueToday()` instead of `renderDueList()`.

## [1.1.5] — 2026-06-20

### Added
- `schedule.html`, `js/schedule.js`, `css/schedule.css`: experimental Month
  view tab on the Schedule page — monthly calendar grid showing completed
  sessions (past days, green intensity by duration) and planned sections
  (today and future, due count); click a day for session and due detail;
  month navigation with Today shortcut; overdue sections aggregated on today.

### Changed
- `schedule.html`, `js/schedule.js`: existing list view preserved as default
  List tab; weeks-ahead selector only shown in list mode.
- `js/schedule.js`: Month view past-day completion uses session-replay
  simulation (reconstructs daily due sections from `createdAt` + session
  history) so partial days appear after `nextPracticeDate` updates; cell
  labels show session count (orange) and missed count (red).
- `css/schedule.css`: stronger diagonal partial gradient; future planned days
  styled yellow (`status-pending`); separate `.month-day-sessions` styling.
- `schedule.html`, `manual.html`: updated Month view legend copy.

## [1.1.4] — 2026-06-18

### Added
- `sitemap.xml`: XML sitemap for all public pages with priorities and lastmod
  dates (SEO).
- `robots.txt`: crawler directives for public pages, disallow debug/print pages,
  and sitemap reference (SEO).
- Canonical tags added to all public HTML pages (`dashboard.html`, `schedule.html`,
  `statistics.html`, `settings.html`, `about.html`, `manual.html`,
  `practice-session.html`, `science.html`, `releases.html`) for SEO.
- `index.html`: full SEO head section (meta tags, Open Graph, Twitter Card,
  JSON-LD structured data) and indexable HTML body content for search engines;
  JavaScript redirect to `dashboard.html` preserved for users.
- `dashboard.html`: "What's new in version 1.1" modal (`mp-whatsnew-overlay`)
  for returning users who already saw the welcome modal; shows three v1.1
  highlights, link to `releases.html`, and dismisses via `mp_whatsnew_v11`
  localStorage key.

### Changed
- `about.html`: version bumped to 1.1.4, build date 20260617.
- `.cursorrules`: release checklist step 7 — explicit version/build update
  locations in `about.html` and `dashboard.html`; build date format YYYYMMDD.
- `releases.html`: Version 1.1 header subtext listing included patch versions
  1.1.0–1.1.4.
- `manual.html`: chapter 4 (Dashboard) — updated archiving/deleting section
  paragraph to document delete buttons on both active and archived sections in
  piece detail view.

## [1.1.3] — 2026-06-15

### Changed
- `releases.html`: consolidated Version 1.1.2 and 1.1.3 patch blocks into a
  single Version 1.1 minor-release entry with five user-facing feature cards;
  removed redundant Version 1.1.1 and 1.1.0 blocks now covered by that entry.
- `.cursorrules`: expanded release procedure (section 7) with semantic
  versioning rules and separate policies for `CHANGELOG.md` vs `releases.html`.

### Added
- `js/dashboard.js`: permanent delete button (💀) on active section rows;
  `deleteActiveSection()` marks section as archived and deleted while
  preserving practice history in statistics.
- `js/dashboard.js`: permanent delete button (🗑) on archived section rows
  in piece detail view; reuses existing `deleteArchivedSection()`.

### Changed
- `js/practice-session.js`: FrustrationGuard now tracks Total Error Burden
  (`failedAttempts + streakResets`) for soft (5) and hard (8) limits, so
  Strict Gebrian mode cannot bypass the guard via streak resets alone;
  banner and hard-stop copy updated accordingly; `resetCorrectReps()` now
  calls `checkFrustrationGuard()` after each reset.
- `manual.html`: Chapter 3 FrustrationGuard section updated to explain Total
  Error Burden (failed attempts plus streak resets), soft/hard limits, and
  why resets count equally toward the guard; Statistics glossary entry aligned.
- `science.html`: FrustrationGuard section expanded with rationale for limits
  5 and 8, evidence-informed heuristics transparency note; references added
  for Miller (1956) and Joëls et al. (2006).
- `practice-session.html`, `js/practice-session.js`: FrustrationGuard copy now
  advises both a slower tempo and smaller section fragments (soft banner,
  hard-stop modal, archive flow); archive notes and dialogs no longer BPM-only.
- `manual.html`, `science.html`: frustration guidance updated to present tempo
  reduction and fragmentation as two options, with fragmentation noted as often
  more effective for complex motor patterns.
- `manual.html`: Introduction wording updated for scientific humility — the app
  "aims to provide the best possible plan" rather than stating it tells users
  exactly what to practice.
- `practice-session.html`: FrustrationGuard soft-limit banner now reads
  "5 failures or resets" (aligned with Total Error Burden terminology).
- `js/practice-session.js`: Hard-stop confirm and modal copy aligned to
  "failures or resets" terminology.
- `science.html`: FrustrationGuard soft/hard limit rationale and transparency
  note refined to match v1.1.3 scientific copy standards.

---

## [1.1.2] — 2026-06-15

### Added
- Global error handler (`js/errors.js`) that logs unhandled errors/promise
  rejections (ERROR category) and shows a single non-spamming user message;
  imported by all five page entry modules.
- `js/dashboard.js`: `loadData()` now reports data-loading failures to the
  user instead of failing silently.
- `science.html` references: Cepeda et al. (2006), Guadagnoli & Lee (2004),
  and Lee & Genovese (1988) to underpin spacing in motor learning and the
  tempo logic.

### Security
- Escape user-entered text (piece titles, composers, section names) at render
  time via new `escapeHtml()` helper in `utils.js`, applied across
  `dashboard.js`, `statistics.js` and `schedule.js`. Prevents stored
  HTML/script injection, including via imported backups. Stored values remain
  unescaped (encoding applied only at output).

### Changed
- Import is now atomic: clearing and rewriting all stores happens in a single
  IndexedDB transaction, so a failed import rolls back completely and leaves
  existing data intact (`db.js` `importDataRaw`). Removed the now-unused
  `addPieceRaw`/`addSectionRaw`/`addSessionRaw` helpers.
- Unified BPM display formatting via new `formatBpm()` helper in `utils.js`
  (dashboard due list, archived list, piece detail, and schedule now all use
  "cur → target BPM").
- Renamed internal variable `stabilityPct`/`motorPct` to `comfortPct` to match
  the Comfort label (no behaviour change).
- Relabelled the "Motor memory" metric to "Comfort" across dashboard,
  practice session (summary + live status), and printed report; the displayed
  value is the inverse-difficulty measure, not a memory-strength measurement.

### Fixed
- `science.html` / `js/engine.js`: corrected Duke, Simmons & Cash (2009)
  citation (Journal of Research in Music Education; fixed wrong "2011" year in
  `science.html`) and reframed the tempo-progression rationale so the specific
  step formula is presented as a design heuristic rather than derived from that
  source.
- `js/practice-session.js`: Save button is now disabled only after evaluation
  validation passes, preventing it from getting stuck disabled after an early
  validation return.
- `js/schedule.js`: "Today" highlight and week grouping now use local dates
  (`toDateOnly`) instead of UTC parsing, fixing incorrect day boundaries in
  UTC+ timezones.
- `js/db.js`: `getDueSections()` now uses a local date-only comparison
  (`getTodayLocal` + `toDateOnly`), consistent with `getForecastSections()`;
  removed unused `endOfToday()`.

---

## [1.1.0] — 2026-06-11

### Added
- Standalone Free Practice mode: accessible via navigation bar
  button ("🎹 Free Practice"). Launches practice-session.html
  with ?free=true, bypasses section requirement, skips FSRS
  engine update, and saves session as type 'analysis' /
  outcome 'FreePractice'.
- Navigation bar button "🎹 Free Practice" added to all pages
  (dashboard, schedule, statistics, settings, about, manual).
  Links directly to practice-session.html?free=true.
- Free Practice sessions now appear separately in Statistics:
  summary card shows count and total time, pieces table shows
  a dedicated "🎹 Free Practice" row, bar chart tooltip
  distinguishes Free Practice from Analysis time.
- `settings.html` / `css/settings.css` / `js/settings.js`: added a
  "Remember this API key" checkbox for the Groq key, allowing users to
  persist the key on trusted personal devices.

### Changed
- `statistics.html` / `js/statistics.js`: replaced the "At Target Tempo"
  summary card with "Year Daily Average", showing average daily practice
  time for the current year since the first session of the year.
- `manual.html`: updated the Statistics summary-card explanation to match
  the new "Year Daily Average" metric.
- `js/statistics.js`: Groq AI reports now read the API key from persistent
  local browser storage when the user has enabled remembering the key.
- `js/settings.js`: backup export filenames now use only the local date,
  removing the UTC-based time component from the downloaded JSON filename.

### Fixed
- `js/settings.js`: saving a Groq key without the remember checkbox now
  removes any previously remembered key; cause was the settings flow only
  supporting session-only storage.

## [1.1.1] — 2026-06-15

### Added
- `license.md`: Source Available License text for the project.
- **Manual: Include the transition note** (`manual.html`)
  New subsection in Chapter 3 explaining why each section
  repetition should include at least the first note of the
  following section. Grounded in motor chaining research
  (Rosenbaum, 2010; Gabrielsson, 1999). TOC updated.
- `science.html`: new transparency page documenting the scientific
  foundations of the app, the author's background, and the boundaries
  of the model.
- `about.html`: added 🧠 The Science button in hero,
  linking to `science.html`.
- schedule.js: logger integration added (NAV on load, UI on period change).
- statistics.js: logger integration added (NAV on load, UI on AI report request, ERROR on Groq failure).

### Changed
- **Manual: Transition tip in Chapter 1** (`manual.html`)
  Added internal link to the new Chapter 3 subsection
  "Include the transition note" for fuller context.
- Updated license block in about.html to ModusPractica Pro Source Available License v1.0.
- `science.html`: expanded "Tempo Progression" card to describe both
  the BPM increase logic (1–8 BPM based on gap and difficulty) and
  the reduction on poor performance (−2 BPM, floor at 50% of
  targetBpm). Added explicit transparency note that the scaling
  values are design choices, not empirically derived constants.
- `statistics.html` / `statistics.js`: replaced "Avg Entry Cost" summary card
  with "Sections at Target Tempo" — shows how many active sections have reached
  their target BPM. More meaningful as a global metric than a cross-section
  entry cost average.
- `manual.html`: updated Statistics chapter — replaced Avg Entry Cost definition
  with Sections at Target Tempo.

### Removed
- `settings.html`: removed "Import from ModusPractica Lite" section — ModusPractica Lite is discontinued.
- `settings.js`: removed `handleLiteImport()` function and `fileImportLite` event listener.
- `manual.html`: removed "Import from Lite" entry from TOC and chapter 7 — no longer relevant.
- `db.js`: removed Lite backup import detection, `isLiteExportFormat()`, and `_reconstructFromLite()`.
- `css/settings.css`: removed unused `.lite-import-badge` styles.

### Fixed
- `engine.js`: added defensive NaN guards in `processPracticeFeedback`.
  Corrupt or missing database values for `stability`, `difficulty`,
  `currentBpm`, and `targetBpm` are now sanitised before any calculation.
  A second guard before the date calculation catches any NaN that escapes
  through the arithmetic. Prevents `NaN-NaN-NaN` scheduling dates from
  being written to IndexedDB. Added guard against corrupt `lastPracticeDate`
  strings (e.g. `NaN-NaN-NaN`) that would cause `t = NaN` and propagate
  through the retrievability calculation. Invalid dates now fall back to
  `t = 0`.
- `dialog.js`: memory leak in `_show()` — `keydown` listener was not removed
  when the user closed the dialog by clicking a button or outside the box.
  Added `removeEventListener` to the `cleanup` function; redundant calls
  removed from the `onKey` handler.
- `js/engine.js`: BPM floor in SR-phase failure branch changed from hardcoded
  `Math.max(40, ...)` to `Math.max(Math.round(targetBpm * 0.5), ...)`.
  Previously, sections with currentBpm < 40 would have their BPM jump upward
  on a failed session; now the floor is always relative to the section's targetBpm.
- statistics.js: fixed bar chart tooltip — FreePractice sessions now correctly split from Analysis based on sessionOutcome field.
- practice-session.js: Analysis sessions (🔍 from a section) now saved with sessionOutcome 'Analysis' instead of 'FreePractice', enabling correct chart splitting.
- statistics.js: legacy FreePractice detection extended with sectionId fallback for pre-fix session records.

## [1.0.0] — 2026-06-08 (post-release additions)

### Added
- `about.html`: link to `assets/Neuromusical_Mastery.pdf` in the
  References section under Further Reading & Influences.

## [1.0.0] — 2026-06-07 (post-release additions)

### Added
- `manual.html`: browser compatibility warning in Chapter 1 (Chrome, Edge,
  Brave Shields, Firefox untested) and Brave-specific data-loss warning in
  Chapter 7 (Shields toggle, Google Analytics Consent Mode v2).

## [1.0.0] — 2026-06-06 (post-release additions)

### Added
- `releases.html`: new release notes page with plain-language descriptions
  of every feature, accessible from the About page.
- Release Notes button added to `about.html` hero section,
  linking to `releases.html`.
- `.cursorrules` updated: release procedure now includes
  updating `releases.html` with every new release.

### Changed
- **Success rate calculation** (`js/statistics.js`)
  `renderSummaryCards` now reads `correctRepetitions` and `failedAttempts`
  directly from the session object instead of via regex on the
  `feedback` text field. More robust when feedback strings differ or are missing.
  FrustrationGuard detection now uses `sessionOutcome` primarily,
  with fallback on `feedback` for legacy data.

- **`addSession` cleanup** (`js/db.js`)
  Removed redundant first `type: 'training'` definition from the
  object literal. Functionally unchanged.

- **AI payload success rate** (`js/statistics.js`)
  `buildAnalyticsPayload` now reads `correctRepetitions` and
  `failedAttempts` directly from the session object instead of
  via regex on the `feedback` text field. Consistent with the
  earlier fix in `renderSummaryCards`.

## [1.0.0] — 2026-06-06

### Added

- **Welcome modal** (`dashboard.html`)
  First-time welcome screen shown once per browser via `localStorage`
  key `mp_welcome_seen`. Describes core features, supported disciplines,
  and privacy policy. Closeable via ✕ button or main CTA button.

- **Debug logger system** (`js/logger.js`, `log.html`)
  Separate IndexedDB (`ModusPracticaLogDB`, max 2000 entries) logging
  all app actions across categories: ENGINE, DB, UI, NAV, ERROR,
  IMPORT_EXPORT. Accessible via secret URL `log.html`. Includes
  category/page/search filters, statistics row, JSON export and
  clear-log functionality. Log persists across browser sessions and
  is unaffected by app reset.

- **Logger integration** (`js/dashboard.js`)
  NAV log on page load; UI log on `selectPiece`; DB logs on
  `addPiece`, `addSection`, `archivePiece`, `archiveSection`.

- **Logger integration** (`js/practice-session.js`)
  NAV log on page load; UI logs on timer start/pause/stop,
  `correctReps` and `failedAttempts` adjustments; ENGINE logs
  for full input and output of `processPracticeFeedback`;
  DB logs for `addSession` and `updateSection`; ERROR log
  in `saveEvaluation` catch block.

- **Logger integration** (`js/settings.js`)
  NAV log on page load; IMPORT_EXPORT logs on export and import;
  DB log on `clearAllData` (app reset).

- **Manual: Hands separate, hands together** (`manual.html`)
  New subsection in Chapter 3 explaining the correct workflow
  for bimanual piano practice, grounded in motor learning research
  (Bangert et al., 2006; Watanabe et al., 2002). Includes practical
  summary tip block. TOC updated.

- **Manual: A model, not a measurement** (`manual.html`)
  New subsection in Chapter 2 clarifying that stability and
  difficulty values are mathematical approximations, not direct
  measurements of neural state. Includes reference to the
  Chapter 1 honesty warning. TOC updated.

- **Manual: Teach the hands-separate workflow explicitly** (`manual.html`)
  New subsection in Chapter 8 (Tips for Music Teachers) on
  guiding students through the hands-separate acquisition workflow.

- **Groq AI prompt improvements** (`js/statistics.js`)
  Stronger system role with strict rules (no speculation, no medical
  advice, skip absent data, stop if fewer than 3 sessions).
  Improved user prompt with explicit key for all metrics.
  `max_tokens` increased from 1000 to 1200.

- **Analytics payload enhancements** (`js/statistics.js`)
  Three new fields added to `buildAnalyticsPayload`:
  `acquisitionSections` (sections still in initialDaysDone < 3),
  `entryCostTrend` (last 5 sessions per section, where available),
  `difficultyTrend` (last 5 sessions per section).
  `initialDaysDone` added to `tempoProgressByPiece` per section.

- **marked.js integration** (`statistics.html`, `js/statistics.js`)
  Replaced fragile regex-based markdown renderer with
  `marked.js` 9.1.6 (CDN). Fallback to `<br>` replacement
  if library unavailable.

- **Cursor project rules** (`.cursorrules`)
  Agent rules file enforcing changelog updates, project structure,
  technical constraints, style rules, scientific integrity,
  privacy policy, and release procedure.

### Changed

- **Archived section title color** (`css/dashboard.css`)
  `.section-row.archived .section-row-name`: color changed from
  `var(--text-muted)` to `var(--accent-2)` (orange) for readability.
  Opacity of `.section-row.archived` increased from 0.5 to 0.8.

- **Archived piece item opacity** (`css/dashboard.css`)
  `.piece-item.archived`: opacity increased from 0.55 to 0.85
  to improve readability of piece subtitles against light background.

- **Section title font weight consistency** (`css/dashboard.css`)
  `.section-row-name`: `font-weight` changed from 500 to 600
  to match `due-item-section` in the Due Today list.

### Fixed

- **Log entry for `addSection` BPM values** (`js/dashboard.js`)
  Logger was recording the dialog input variable before the
  final processed value was assigned. Identified via log analysis;
  to be verified in next session after practice.

---

## [0.9.x] — Pre-release development

Internal development builds. No public changelog maintained.
Core features implemented: FSRS engine, IndexedDB data layer,
spaced repetition scheduling, BPM progression, FrustrationGuard,
Entry Cost, Analysis mode, streak tracking, print report,
Groq AI report (initial version), ModusPractica Lite import,
Google Analytics with Consent Mode v2.

---
