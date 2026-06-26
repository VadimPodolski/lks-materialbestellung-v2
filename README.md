# LKS-Materialbestellung V1

Kostenlose interne Web-App für Vercel + Supabase Free.

## Funktionen

- Login mit Supabase
- Bestellungen anlegen
- Bestellübersicht mit Statusfarben
- Lieferanten verwalten
- Bestellung per Button als fertige E-Mail öffnen
- Wareneingang buchen
- Status automatisch: teilweise geliefert / geliefert

## Einrichtung

1. Supabase-Projekt erstellen.
2. `supabase/schema.sql` im Supabase SQL Editor ausführen.
3. Supabase Auth aktivieren, Mitarbeiter als Nutzer anlegen.
4. Datei `.env.example` zu `.env.local` kopieren.
5. Werte aus Supabase eintragen:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Lokal starten:

```bash
npm install
npm run dev
```

7. Auf Vercel importieren und die gleichen Environment Variables setzen.

## Hinweis zur kostenlosen E-Mail

Die App nutzt `mailto:`. Dadurch öffnet sich Outlook/Gmail mit fertigem Text. Der Mitarbeiter sendet die Mail selbst ab. Kein SMTP-Server nötig.
