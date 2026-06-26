# ModusPractica Pro

**Practice smarter, not longer.**

ModusPractica Pro is a free, browser-based practice planner for musicians. It uses spaced repetition (FSRS algorithm) and insights from cognitive and motor learning science to determine when and how often each section of your repertoire needs attention.

🌐 **Live app:** [parturamusic.be/ModusPractica_Pro](https://parturamusic.be/ModusPractica_Pro/)  
📋 **Version:** 1.1.9

---

## About the app

Instead of repeating passages until they “feel right”, ModusPractica Pro schedules your practice using evidence-based algorithms. Your brain consolidates motor skills most efficiently when practice is spaced over time — not massed into long, repetitive blocks.

Suitable for piano, guitar, violin, and any other instrument.

### Key features

- **Spaced repetition** — optimal review timing after each practice session
- **Stability & difficulty** — personal memory and difficulty scores per section
- **BPM progression** — automatic tempo management toward your target speed
- **FrustrationGuard** — stops the session after repeated failures; schedules a fresh attempt after a night of consolidation
- **Memory zones** — Exploration, Consolidation, and Mastery show where you are on the learning curve
- **Entry cost** — tracks errors before the first correct repetition as a sign of genuine consolidation
- **Dashboard & repertoire** — manage pieces and sections; optional links to sheet music or videos
- **Schedule & statistics** — calendar, progress tracking, and AI-assisted reports (optional, via your own Groq API key)
- **Offline-first** — data stored locally in the browser (IndexedDB)

### Technology

Static web app: HTML, CSS, and vanilla JavaScript. No build step or server required to run locally — open `index.html` or serve the folder with any simple web server.

---

## Project structure

```
├── index.html          # Landing page
├── dashboard.html      # Repertoire & overview
├── practice-session.html
├── schedule.html
├── statistics.html
├── settings.html
├── manual.html         # User manual
├── science.html        # Scientific background
├── js/                 # Application logic (engine, db, sessions, …)
├── css/                # Styling
└── assets/             # Images and documents
```

See [CHANGELOG.md](CHANGELOG.md) for release history.

---

## Licensing

Copyright © 2026 Frank De Baere. All rights reserved.

This project is **dual-licensed**. It is available under the **GNU GPLv3** for non-commercial and open-source use. For commercial use, integration into proprietary software, or commercial exploitation, a separate commercial license must be obtained from the copyright holder.

### Open Source (GNU GPLv3)

You may use, modify, and redistribute this software under the terms of the [GNU General Public License v3.0](LICENSE) (or, at your option, any later version published by the Free Software Foundation).

### Commercial use

Use, modification, or distribution of this software for **commercial purposes**, or integration into **proprietary (closed-source) products**, is **not permitted** under the GPLv3 alone. A prior **written commercial license agreement** is required.

**Commercial licensing inquiries:** [info@parturamusic.be](mailto:info@parturamusic.be)

The full GPLv3 license text is in [LICENSE](LICENSE).

---

## Author

**Frank De Baere** — pianist & software developer (retired)  
📍 Flanders, Belgium  
🔗 [parturamusic.be](https://www.parturamusic.be) · [GitHub @frankyzip](https://github.com/frankyzip)
