# weather-mne-rokg

Weather aplikacija zasnovana na podacima **ZHMS Crne Gore / meteo.co.me**.

## Status

- Architecture v1 — **odobrena**
- Implementation Blueprint v1 — spreman
- Slice 1 (u pripremi): AWS current → normalize → DB → API → jedna stanica UI

## Principi

- ZHMS je izvor podataka; naša aplikacija ima sopstveni interni sloj
- Frontend **nikad** ne poziva meteo.co.me direktno
- `0` je validna merena vrednost; prazno → `null`
- Maksimalno korišćenje besplatnih servisa (Supabase + Cloudflare)

## Stack (Architecture v1)

| Sloj | Tehnologija |
|------|-------------|
| Frontend | React + TypeScript + Vite |
| Hosting | Cloudflare Pages |
| Baza + API | Supabase PostgreSQL + Edge Functions |
| Scheduler | Cloudflare Worker Cron → Supabase Edge |
| Mobilno (kasnije) | Capacitor |

## Struktura repoa

```
weather-mne-rokg/
├── apps/
│   └── web/                 # React + Vite frontend
├── supabase/
│   ├── migrations/          # SQL migracije
│   └── functions/           # Edge Functions (sync + API)
├── workers/
│   └── cron-sync/           # Cloudflare Worker (samo orkestracija)
├── docs/                    # Arhitektura i blueprint (referenca)
└── README.md
```

## Dokumentacija projekta

Tehnički dokumenti žive van ovog repoa (u projektnom folderu vlasnika):
- Master specifikacija
- MASTER_DATA_MODEL_SOURCE_MAPPING_v1
- WEATHER_ARCHITECTURE_v1
- IMPLEMENTATION_BLUEPRINT_v1

## Slice 1 cilj

AWS current merenja → normalizacija → Supabase → interni API → prikaz temperature jedne stanice (npr. Podgorica), **bez** direktnog poziva ZHMS-a iz frontenda.

---

*Rad u toku.*
