# Project Thoth — Frontend

React + Vite + TypeScript + Tailwind SPA for the Project Thoth knowledge system.
Built to match the Figma design; talks to the FastAPI backend.

## Run

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

The Vite dev server proxies `/api/*` to the backend at `http://localhost:8000`
(see `vite.config.ts`). Start the backend separately:

```bash
# from project root
uvicorn app.main:app --reload --port 8000
```

If the backend requires auth, copy `.env.example` to `.env.local` and set
`VITE_BENCHMARK_API_KEY`. Without the backend running, the UI renders with
placeholder (`–`) stats.

## Structure

- `src/pages/Home.tsx` — dashboard screen (banner, quick actions, stat cards, disclaimer)
- `src/components/Sidebar.tsx` — left nav + live System Status panel
- `src/api/client.ts` — typed client; `fetchDashboardStats()` derives the cards from `/smes` and `/knowledge`
```
