export const engine = {
  /**
   * Berekent de nieuwe geheugenstabiliteit en moeilijkheidsgraad op basis van motorische weerstand.
   * @param {Object} section - Het database-record van de sectie.
   * @param {Object} sessionResult - De resultaten van de klik-sessie {correctReps, failedAttempts, outcome}
   * @param {Boolean} isLowEnergy - Indien true, wordt de faal-penalty verzacht.
   * @returns {Object} Geüpdatet section-object.
   */
  processPracticeFeedback(section, sessionResult, isLowEnergy = false) {
    const now = new Date();
    // Voeg de BPM parameters toe aan de destructuring (met fallbacks voor oude data)
    let {
      stability = 1.0,
      difficulty = 0.3,
      lastPracticeDate,
      initialDaysDone = 0,
      currentBpm = 60,
      targetBpm = 60,
    } = section;
    const {
      correctReps = 0,
      failedAttempts = 0,
      outcome = "Success",
    } = sessionResult || {};

    // Defensieve sanitatie tegen corrupte of ontbrekende databasewaarden.
    // Math.max(1, NaN) geeft NaN terug in JS — de fallbacks hier zijn dus noodzakelijk.
    if (!Number.isFinite(stability) || stability <= 0)  stability  = 1.0;
    if (!Number.isFinite(difficulty) || difficulty < 0 || difficulty > 1) difficulty = 0.3;
    if (!Number.isFinite(currentBpm) || currentBpm <= 0) currentBpm = 60;
    if (!Number.isFinite(targetBpm)  || targetBpm  <= 0) targetBpm  = 60;

    let isFrustration = false;
    // De 'isSameDay' check is puur kalender-gebaseerd, wat de 'nachtrust'-consolidatie regel volgt.
    const isSameDay =
      lastPracticeDate &&
      new Date(lastPracticeDate).toDateString() === now.toDateString();

    if (!isSameDay || outcome === "FrustrationGuard") {
      let t = 0;
      if (lastPracticeDate) {
        const parsed = new Date(lastPracticeDate).getTime();
        // Defensieve check: een corrupte datumstring (bv. "NaN-NaN-NaN") geeft NaN terug.
        // In dat geval valt t terug op 0 — de engine gedraagt zich dan als bij een eerste sessie.
        t = Number.isFinite(parsed)
          ? (now.getTime() - parsed) / (1000 * 60 * 60 * 24)
          : 0;
      }

      const retrievability = Math.exp((t * Math.log(0.5)) / stability);

      if (outcome === "FrustrationGuard" || outcome === "Aborted") {
        isFrustration = true;
        // Wetenschappelijke basis: frustratie en afbreking verstoren motorische consolidatie,
        // maar niet proportioneel aan de volledige opgebouwde stabiliteit (Rosenbaum, 2010).
        // Een halvering van de interval is verdedigbaar; 70% verlies is empirisch niet onderbouwd.
        // Low energy: lichtere penalty (0.85×) want de oorzaak is fysiologisch, niet motorisch.
        stability *= isLowEnergy ? 0.85 : 0.6;
        difficulty = Math.min(0.99, difficulty + 0.15);
        // Bij FrustrationGuard/Aborted op een nieuwe dag: verhoog initialDaysDone met 1, maar enkel als initialDaysDone < 2.
        // Wetenschappelijke basis: tijdsverloop telt als dag in acquisitiefase, ongeacht sessiekwaliteit.
        if (!isSameDay && initialDaysDone < 2) {
          initialDaysDone += 1;
        }
      } else if (!isSameDay) {
        if (initialDaysDone < 2) {
          // Fase: Acquisitie (Dag 1 en Dag 2 na toevoegen)
          initialDaysDone += 1;
          stability = 1.0;

          const totalAttempts = correctReps + failedAttempts;
          const successRatio =
            totalAttempts > 0 ? correctReps / totalAttempts : 1.0;
          if (successRatio >= 0.85) {
            difficulty = Math.max(0.01, difficulty - 0.05);
          } else if (successRatio < 0.6) {
            difficulty = Math.min(0.99, difficulty + 0.08);
          }
        } else {
          // Fase: Spaced Repetition (Dag 3 en verder)
          initialDaysDone = 3;
          const totalAttempts = correctReps + failedAttempts;
          const successRatio =
            totalAttempts > 0 ? correctReps / totalAttempts : 1.0;

          // Wetenschappelijke basis: moeilijke secties consolideren trager dan eenvoudige
          // (Ye et al., 2022 — FSRS). De difficulty-factor remt de groei proportioneel af.
          // baseGrowth 1.6 is gekozen zodat het gedrag bij difficulty=0.3 (gemiddeld) nagenoeg
          // identiek blijft aan de vorige constante van 1.3.
          const growthFactor =
            1.6 *
            (1 - difficulty * 0.5) *
            successRatio *
            (2.0 - retrievability);

          // --- NIEUW: Tempo en Stabiliteit Logica ---
          if (successRatio >= 0.85) {
            difficulty = Math.max(0.01, difficulty - 0.05);

            // Als we foutloos spelen én het doeltempo is nog niet bereikt
            if (currentBpm < targetBpm) {
              // Wetenschappelijke basis: effectief oefenen verhoogt het tempo pas wanneer de
              // uitvoering accuraat is, en stemt de uitdaging af op de moeilijkheid
              // (Duke, Simmons & Cash, 2009 — Journal of Research in Music Education;
              // challenge point framework: Guadagnoli & Lee, 2004 — J. Motor Behavior).
              // De exacte stapformule hieronder (factor 0.15, stap proportioneel aan het gat,
              // omgekeerd evenredig met difficulty) is een ontwerpheuristiek, niet uit deze
              // bronnen afgeleid.
              // baseFactor 0.15 betekent: bij difficulty=0.3 en een gat van 40 BPM → stap = ~4.2 BPM
              // Minimum 1 BPM zodat er altijd vooruitgang is, maximum 8 BPM per sessie.
              const bpmGap = targetBpm - currentBpm;
              const bpmStep = Math.min(
                8,
                Math.max(1, Math.round(0.15 * (1 - difficulty) * bpmGap)),
              );
              currentBpm = Math.min(targetBpm, currentBpm + bpmStep);

              // Omdat het tempo nu hoger ligt, remmen we de stabiliteitsgroei met 20% af.
              // Het brein heeft iets sneller een herhaling nodig voor dit nieuwe tempo.
              stability *= Math.max(1.05, growthFactor * 0.8);
            } else {
              // Doeltempo is bereikt, laat de stabiliteit voluit groeien
              stability *= Math.max(1.1, growthFactor);
            }
          } else if (successRatio >= 0.6) {
            // Matige prestatie: lichte moeilijkheidsverhoging, beperkte stabiliteitsgroei (max 20%)
            // Wetenschappelijke basis: Kornell & Bjork (2008) — gedeeltelijk succes rechtvaardigt
            // geen volledige spacing-bonus, maar ook geen straf.
            difficulty = Math.min(0.99, difficulty + 0.03);
            stability = Math.max(1, stability * Math.min(1.2, growthFactor));
            // Bij matige prestatie blijft het tempo gelijk
          } else {
            // Slechte prestatie (< 60% succes): stabiliteit daalt licht.
            // Wetenschappelijke basis: bij mislukte herinnering wordt de volgende interval
            // verkort (Ye et al., 2022 — FSRS). Een factor 0.85 is conservatief maar correct.
            difficulty = Math.min(0.99, difficulty + 0.08);
            stability = Math.max(1, stability * 0.85);
            // Bij veel fouten verlagen we het tempo om te herstellen.
            // Vloer = 50% van targetBpm zodat de verlaging nooit boven het huidige
            // tempo uitkomt bij secties met een laag doeltempo.
            currentBpm = Math.max(Math.round(targetBpm * 0.5), currentBpm - 2);
          }
        }
      }
    }

    // Laatste vangnet: als een NaN door de berekeningen is ontsnapt, reset naar veilige waarde.
    if (!Number.isFinite(stability) || stability <= 0) stability = 1.0;
    // Bij frustratie is minimum 0.5 dagen (12u) om penalty te laten doorwerken (Ye et al., 2022 — FSRS).
    stability = Math.max(isFrustration ? 0.5 : 1, Math.min(365, stability));
    // Bij frustratie: forceer nextPracticeDate naar het begin van de volgende kalenderdag.
    // Wetenschappelijke basis: motorische consolidatie vereist één nachtslaap, niet een exact
    // tijdsinterval (Walker et al., 2003; Korman et al., 2007). Dit voorkomt dat een
    // penalty-interval van 0.5 dagen nog op dezelfde kalenderdag valt en isSameDay blokkeert.
    const nextDate = isFrustration
      ? (() => {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);
          return tomorrow;
        })()
      : new Date(Date.now() + stability * 24 * 60 * 60 * 1000);

    return {
      ...section,
      stability,
      difficulty,
      initialDaysDone,
      currentBpm, // <--- Sla nieuw tempo op
      targetBpm, // <--- Sla doeltempo op
      lastPracticeDate: now.toISOString(),
      nextPracticeDate: nextDate.getFullYear() + '-' +
        String(nextDate.getMonth() + 1).padStart(2, '0') + '-' +
        String(nextDate.getDate()).padStart(2, '0'),
    };
  },

  /**
   * Simpele suggestie voor een startwaarde van `targetReps` gebaseerd op stabiliteit.
   */
  suggestTargetReps(stability = 1) {
    if (stability < 2) return 3;
    if (stability < 5) return 4;
    if (stability < 15) return 5;
    return 6;
  },
};
