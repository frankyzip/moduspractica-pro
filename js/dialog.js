/**
 * DialogService — Vervangt native alert() en confirm() door CSS-modals.
 *
 * Motivatie: Native browser dialogen (alert, confirm) blokkeren de Electron
 * event loop en veroorzaken keyboard-input failures op Windows.
 * (Gedocumenteerd probleem in Electron >= v20, zie Electron issue #19977)
 *
 * Gebruik:
 *   await DialogService.alert("Bericht", "success");
 *   const confirmed = await DialogService.confirm("Weet je het zeker?");
 */
export const DialogService = {
  /**
   * Interne methode: bouwt en toont de modal, verwijdert hem na interactie.
   * @param {Object} options
   * @param {string} options.message - De te tonen tekst (mag \n bevatten)
   * @param {string} options.type - 'info' | 'success' | 'warning' | 'danger'
   * @param {boolean} options.isConfirm - true voor confirm, false voor alert
   * @returns {Promise<boolean>} true = OK/Bevestig, false = Annuleren
   */
  _show({ message, type = "info", isConfirm = false }) {
    return new Promise((resolve) => {
      // Verwijder eventuele eerdere dialog (veiligheidshalve)
      const existing = document.getElementById("dialog-service-overlay");
      if (existing) existing.remove();

      // Kleurcodering per type
      const colorMap = {
        info: "var(--accent, #00a8e8)",
        success: "var(--success, #4caf50)",
        warning: "var(--warning, #ff6b00)",
        danger: "var(--danger,  #e53935)",
      };
      const iconMap = {
        info: "ℹ️",
        success: "✅",
        warning: "⚠️",
        danger: "❌",
      };
      const accentColor = colorMap[type] || colorMap.info;
      const icon = iconMap[type] || iconMap.info;

      // Zet newlines om naar <br> voor leesbaarheid
      const safeMessage = message
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");

      // Bouw de overlay
      const overlay = document.createElement("div");
      overlay.id = "dialog-service-overlay";
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        animation: dialogFadeIn 0.15s ease;
      `;

      // Bouw de modal box
      overlay.innerHTML = `
        <style>
          @keyframes dialogFadeIn {
            from { opacity: 0; transform: scale(0.96); }
            to   { opacity: 1; transform: scale(1); }
          }
          #dialog-service-box {
            background: var(--surface, #1e1e2e);
            border: 1px solid ${accentColor};
            border-radius: 12px;
            padding: 2rem;
            max-width: 420px;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            font-family: inherit;
            color: var(--text-primary, #e0e0e0);
          }
          #dialog-service-icon {
            font-size: 2rem;
            margin-bottom: 0.75rem;
            text-align: center;
          }
          #dialog-service-message {
            font-size: 0.95rem;
            line-height: 1.6;
            margin-bottom: 1.5rem;
            text-align: center;
            color: var(--text-primary, #e0e0e0);
          }
          #dialog-service-buttons {
            display: flex;
            gap: 0.75rem;
            justify-content: center;
          }
          .dialog-btn {
            padding: 0.5rem 1.5rem;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 600;
            transition: opacity 0.15s;
          }
          .dialog-btn:hover { opacity: 0.85; }
          .dialog-btn-primary {
            background: ${accentColor};
            color: #fff;
          }
          .dialog-btn-secondary {
            background: var(--surface-2, #2a2a3e);
            color: var(--text-secondary, #aaa);
            border: 1px solid var(--border, #444);
          }
        </style>
        <div id="dialog-service-box">
          <div id="dialog-service-icon">${icon}</div>
          <div id="dialog-service-message">${safeMessage}</div>
          <div id="dialog-service-buttons">
            ${
              isConfirm
                ? `<button class="dialog-btn dialog-btn-secondary" id="dialog-btn-cancel">Cancel</button>
                  <button class="dialog-btn dialog-btn-primary" id="dialog-btn-ok">Confirm</button>`
                : `<button class="dialog-btn dialog-btn-primary" id="dialog-btn-ok">OK</button>`
            }
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Focus de OK knop voor keyboard-toegankelijkheid
      const btnOk = document.getElementById("dialog-btn-ok");
      if (btnOk) btnOk.focus();

      // Event handlers
      const cleanup = (result) => {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        resolve(result);
      };

      document
        .getElementById("dialog-btn-ok")
        .addEventListener("click", () => cleanup(true));

      if (isConfirm) {
        document
          .getElementById("dialog-btn-cancel")
          .addEventListener("click", () => cleanup(false));
      }

      // Sluit bij klik buiten de box (alleen voor alert, niet voor confirm)
      if (!isConfirm) {
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) cleanup(true);
        });
      }

      // Keyboard: Enter = OK, Escape = Annuleren (of OK bij alert)
      const onKey = (e) => {
        if (e.key === "Enter") cleanup(true);
        if (e.key === "Escape") cleanup(isConfirm ? false : true);
      };
      document.addEventListener("keydown", onKey);
    });
  },

  /**
   * Toont een informatieve melding. Vervangt alert().
   * @param {string} message
   * @param {string} type - 'info' | 'success' | 'warning' | 'danger'
   * @returns {Promise<void>}
   */
  async alert(message, type = "info") {
    await this._show({ message, type, isConfirm: false });
  },

  /**
   * Toont een bevestigingsdialog. Vervangt confirm().
   * @param {string} message
   * @returns {Promise<boolean>} true = bevestigd, false = geannuleerd
   */
  async confirm(message) {
    return await this._show({ message, type: "warning", isConfirm: true });
  },

  /**
   * Toont een invoerdialog met een tekstveld. Vervangt prompt().
   * @param {string} message - De vraagtekst
   * @param {string|number} defaultValue - Vooraf ingevulde waarde (optioneel)
   * @param {string} inputType - 'text' | 'number' | 'url' (standaard: 'text')
   * @param {boolean} allowEmpty - true = lege waarde bij OK is geldig (standaard: false)
   * @returns {Promise<string|null>} De ingevoerde waarde, of null bij annuleren
   */
  async input(message, defaultValue = "", inputType = "text", allowEmpty = false) {
    return new Promise((resolve) => {
      // Verwijder eventuele eerdere dialog
      const existing = document.getElementById("dialog-service-overlay");
      if (existing) existing.remove();

      const accentColor = "var(--accent, #00a8e8)";

      const safeMessage = String(message)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");

      const overlay = document.createElement("div");
      overlay.id = "dialog-service-overlay";
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        animation: dialogFadeIn 0.15s ease;
      `;

      overlay.innerHTML = `
        <style>
          @keyframes dialogFadeIn {
            from { opacity: 0; transform: scale(0.96); }
            to   { opacity: 1; transform: scale(1); }
          }
          #dialog-service-box {
            background: var(--surface, #1e1e2e);
            border: 1px solid ${accentColor};
            border-radius: 12px;
            padding: 2rem;
            max-width: 420px;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            font-family: inherit;
            color: var(--text-primary, #e0e0e0);
          }
          #dialog-service-message {
            font-size: 0.95rem;
            line-height: 1.6;
            margin-bottom: 1rem;
            color: var(--text-primary, #e0e0e0);
          }
          #dialog-service-input {
            width: 100%;
            box-sizing: border-box;
            padding: 0.6rem 0.8rem;
            border-radius: 8px;
            border: 1px solid ${accentColor};
            background: var(--surface-2, #2a2a3e);
            color: var(--text-primary, #e0e0e0);
            font-size: 1rem;
            font-family: inherit;
            margin-bottom: 1.5rem;
            outline: none;
          }
          #dialog-service-input:focus {
            border-color: ${accentColor};
            box-shadow: 0 0 0 2px rgba(0, 168, 232, 0.2);
          }
          #dialog-service-buttons {
            display: flex;
            gap: 0.75rem;
            justify-content: center;
          }
          .dialog-btn {
            padding: 0.5rem 1.5rem;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 600;
            transition: opacity 0.15s;
          }
          .dialog-btn:hover { opacity: 0.85; }
          .dialog-btn-primary {
            background: ${accentColor};
            color: #fff;
          }
          .dialog-btn-secondary {
            background: var(--surface-2, #2a2a3e);
            color: var(--text-secondary, #aaa);
            border: 1px solid var(--border, #444);
          }
        </style>
        <div id="dialog-service-box">
          <div id="dialog-service-message">${safeMessage}</div>
          <input
            id="dialog-service-input"
            type="${inputType}"
            value="${String(defaultValue).replace(/"/g, "&quot;")}"
            ${inputType === "number" ? "min='1'" : ""}
          />
            <div id="dialog-service-buttons">
            <button class="dialog-btn dialog-btn-secondary" id="dialog-btn-cancel">Cancel</button>
            <button class="dialog-btn dialog-btn-primary"   id="dialog-btn-ok">OK</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const inputEl = document.getElementById("dialog-service-input");
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }

      const cleanup = (result) => {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
        resolve(result);
      };

      document.getElementById("dialog-btn-ok").addEventListener("click", () => {
        const val = inputEl ? inputEl.value : "";
        if (val === "" && !allowEmpty) {
          cleanup(null);
        } else {
          cleanup(val);
        }
      });

      document
        .getElementById("dialog-btn-cancel")
        .addEventListener("click", () => {
          cleanup(null);
        });

      const onKey = (e) => {
        if (e.key === "Enter") {
          const val = inputEl ? inputEl.value : "";
          if (val === "" && !allowEmpty) {
            cleanup(null);
          } else {
            cleanup(val);
          }
        }
        if (e.key === "Escape") {
          cleanup(null);
        }
      };
      document.addEventListener("keydown", onKey);
    });
  },
};
