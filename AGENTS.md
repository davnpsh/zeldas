# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project
**zeldas** — a bookmark/link manager built on the DASH stack: **Deno + oak**, **Alpine.js**, **SQLite** (`node:sqlite`), **HTMX**.

- Server/API: `main.ts` (oak router, SQLite via built-in `node:sqlite`, HTML fragment rendering).
- UI: `public/index.html` (Alpine `x-data` state + HTMX), `public/app.js` (modal-close events, JS masonry), `public/styles.css`.
- Vendored libs (no CDN): `public/vendor/alpine.min.js`, `public/vendor/htmx.min.js`.

## Conventions
- Deno 2.9.2. Run `deno task dev` (seeds ~100–200 demo links when DB empty + `DENO_ENV=development`), `deno task start`, or `deno task compile`.
- Permissions required at runtime: `--allow-net --allow-read --allow-write --allow-env`.
- `node:sqlite` is built in — **no `--allow-ffi`**. DB file lives at `data/zeldas.db` (override with `ZELDAS_DB`); the `data/` dir is created at startup.
- SQLite schema is migrated in JS (`CREATE TABLE IF NOT EXISTS` + `try/catch` `ALTER TABLE` for new columns) — keep that pattern when adding columns.
- All user-facing strings are HTML-escaped with `esc()` server-side. Never inject raw user input into rendered HTML.
- UI preferences: **no glow effects**, pastel cards, Pinterest-style masonry (row-major via JS in `app.js`), full-card click opens link, hover-only delete, color chosen via swatch picker.
- Keep comments out of source unless explicitly requested.

## Useful commands
- `deno check main.ts` — type-check the server.
- `deno compose build` / `docker compose up` — production build (multi-stage `Dockerfile`, runtime `debian:13-slim`, DB persisted via `./data:/app/data`).
