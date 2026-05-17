# My Health Schedule
 
AI-powered medication tracker that reads prescription labels with Claude vision, checks drug interactions, and builds your weekly schedule automatically.
 
**[Live Demo](https://my-med-app-tau.vercel.app)**
 
## What it does
 
- **Label scanning** — photograph a prescription bottle and Claude's vision AI extracts the drug name, dose, quantity, and instructions automatically
- **Weekly schedule** — medications organized by day and time of day, auto-populated from frequency text like "twice daily" or "three times a week"
- **Dose tracking** — mark doses as taken, feeds into a 5-week adherence history with percentage stats
- **Drug interaction checking** — cross-references your full medication list against drug databases
- **Discontinuation warnings** — flags missed doses for medications with withdrawal risk (SSRIs, benzodiazepines, corticosteroids, etc.)
## Tech Stack
 
**Frontend:** React 19, Vite 7, plain inline styles, Lucide React, Google Fonts
 
**Backend:** Vercel Serverless Functions (Node.js, ES modules)
 
**AI:** Anthropic Claude API — Haiku first, falls back to Opus
 
**APIs:** RxNorm, OpenFDA, DrugBank (all called server-side)
 
**Persistence:** localStorage only — no database, no user accounts
 
## Privacy
 
No account required. Data stays on your device except for label scans and interaction lookups.
