# ModusPractica Pro

**Practice smarter, not longer.**

ModusPractica Pro is een gratis, browsergebaseerde oefenplanner voor muzikanten. De app gebruikt spaced repetition (FSRS-algoritme) en inzichten uit cognitieve en motorische leerwetenschap om te bepalen wanneer en hoe vaak elk deel van je repertoire aandacht nodig heeft.

🌐 **Live app:** [parturamusic.be/ModusPractica_Pro](https://parturamusic.be/ModusPractica_Pro/)  
📋 **Versie:** 1.1.9

---

## Over de app

In plaats van passages eindeloos te herhalen tot ze “goed voelen”, plant ModusPractica Pro je oefeningen op basis van wetenschappelijk onderbouwde algoritmen. Je brein consolideert motorische vaardigheden het efficiëntst wanneer oefening over tijd wordt gespreid — niet in lange, repetitieve blokken.

Geschikt voor piano, gitaar, viool en elk ander instrument.

### Belangrijkste functies

- **Spaced repetition** — optimale herhalingsmomenten na elke oefensessie
- **Stability & difficulty** — persoonlijke geheugen- en moeilijkheidsscores per sectie
- **BPM-progressie** — automatisch tempo-beheer richting je streefsnelheid
- **FrustrationGuard** — stopt de sessie bij herhaalde fouten; plant een nieuwe poging na een nacht consolidatie
- **Memory zones** — Exploration, Consolidation en Mastery tonen waar je staat in de leercurve
- **Entry cost** — meet fouten vóór de eerste correcte herhaling als signaal van echte consolidatie
- **Dashboard & repertoire** — stukken en secties beheren, optionele links naar partituren of video’s
- **Planning & statistieken** — kalender, voortgang en AI-ondersteunde rapporten (optioneel, via eigen Groq API-sleutel)
- **Offline-first** — data lokaal opgeslagen in de browser (IndexedDB)

### Technologie

Statische webapp: HTML, CSS en vanilla JavaScript. Geen build-stap of server vereist om lokaal te draaien — open `index.html` of serveer de map via een eenvoudige webserver.

---

## Projectstructuur

```
├── index.html          # Startpagina
├── dashboard.html      # Repertoire & overzicht
├── practice-session.html
├── schedule.html
├── statistics.html
├── settings.html
├── manual.html         # Gebruikershandleiding
├── science.html        # Wetenschappelijke achtergrond
├── js/                 # Applicatielogica (engine, db, sessies, …)
├── css/                # Styling
└── assets/             # Afbeeldingen en documenten
```

Zie [CHANGELOG.md](CHANGELOG.md) voor releasegeschiedenis.

---

## Licentie

Copyright © 2026 Frank De Baere. Alle rechten voorbehouden.

ModusPractica Pro is **gratis te gebruiken voor persoonlijk, niet-commercieel oefengebruik**. De broncode is publiek beschikbaar voor studie en transparantie.

**Zonder voorafgaande schriftelijke toestemming van de auteur is het niet toegestaan om:**

- de software te wijzigen, aan te passen of afgeleide werken te maken
- de broncode of delen daarvan te herdistribueren of opnieuw te publiceren
- de software voor commerciële doeleinden te gebruiken
- een gewijzigde of ongewijzigde versie onder een andere naam of op een ander domein te deployen

Elk gebruik buiten het bovenstaande vereist expliciete schriftelijke toestemming.

📧 Contact: [info@parturamusic.be](mailto:info@parturamusic.be)

De volledige licentietekst staat in [LICENSE.md](LICENSE.md). De software wordt geleverd “as is”, zonder enige garantie.

---

## Auteur

**Frank De Baere** — pianist & software developer (met pensioen)  
📍 Vlaanderen, België  
🔗 [parturamusic.be](https://www.parturamusic.be) · [GitHub @frankyzip](https://github.com/frankyzip)
