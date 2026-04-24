# Athene CMMS — Guidelines

All implementation work **must** follow this document.

---

## Basic programming guidelines

- I will always do just what I asked for and never change existing code unless asked to
- I will never delete anything unless asked to
- I will never create tables or alter tables or columns and rows unless asked to
- I will run database migrations myself when schema changes are part of the work: from the repository root execute `npm run migrate` (requires `DATABASE_URL` in the environment). After pulling new migration files, run migrations again before assuming the database is up to date.
- I will inform user about his todos when done with my work
- I will follow all guidelines presented in this document whenever I implement / code something
- I will always keep output short in cavemen style and only clarify more when asked
- I will always make suggestions when I see flaws or possible errors or room for improvements

---

## Data consistency

- All data have a unique id that will not be seen by user, a key and a name field
- All basic apps / data will be assigned to a site with a `fkSiteId`
- All columns and tables should use camel case

---

## Design system — consolidated (light vs dark)

North star differs by theme but shared principles: **precision / industrial**, **asymmetry**, **“no-line” rule** (avoid heavy 1px borders for structure; use tonal layers, spacing, wireframe accents).

### Shared rules

- Prefer **surface layering** over shadows for hierarchy; use soft ambient shadow only for floating layers (modals, popovers).
- **Ghost border** if a perimeter is required (accessibility): faint outline, low opacity — not a heavy frame.
- **Typography**: Space Grotesk for display / headline / label (technical voice). Dark theme adds **Manrope** for title/body (human voice, dense UI).
- **Labels**: `label-sm` style — uppercase, increased letter-spacing (~0.1em) for field / metadata “coordinates”.
- **Do**: asymmetry, negative space, tertiary color as thin guides / corner brackets (L-shapes), industrial chips (sharp corners where specified).
- **Don’t**: heavy structural borders, `<hr>` dividers (use vertical gap), over-rounded “soft SaaS” radii on primary shells (keep sm / default).

### Light theme — “The Precision Architect”

- **Mood**: high-key clinical light + aggressive **red-orange** primary (`#ad2c00` → gradient to `#d83900` on CTAs, ~135°).
- **Surfaces**: base `#f7f9fc`, sections `#f2f4f7`, interaction panels `#e0e3e6`; glass panels: semi-transparent low surface + ~20px backdrop blur.
- **Tertiary / wireframe accent**: `#006099` — guides only, **not** for primary actions.
- **Inputs**: filled `surface-container-low`, no bottom-border trope; focus = **2px tertiary vertical line** at start (technical edit).
- **Secondary button**: `surface-container-highest` + **2px tertiary** accent on left edge.
- **Chips**: square (0 radius); active uses primary-fixed / on-primary-fixed-variant tokens from spec.

### Dark theme — “The Kinetic Blueprint”

- **Mood**: deep night charcoal/navy, low fatigue; interactive elements “glow” (cyan primary family).
- **Surfaces**: dim/base `#0f1419`, panels `#1b2025`, active `#30353b` / `#252a30` (align with spec naming: surface_container_low `#171c21`, etc.).
- **Glass / gradient**: floating login/modal — glass (`surface_container` ~60% opacity, **24px** blur); CTA gradient **primary `#a8e8ff` → primary_container `#00d4ff`**, ~135°; text on primary **on_primary_fixed `#001f27`**.
- **Inputs**: sunken fields — `surface_container_highest` + **bottom-only** primary accent on focus (sm height accent), body in `on_surface`.
- **Shadow (float)**: e.g. `0 20px 40px rgba(0, 212, 255, 0.06)` (tinted glow).
- **Secondary text**: avoid pure white — use `on_surface_variant` (~`#bbc9cf`).
- **Status chips**: e.g. `tertiary_container` / `on_tertiary_container` for high-visibility industrial status.

### Login page structure

- Follow layout from project reference: branding left (desktop), access card right, header/footer framing, optional grid/blur background.
- **Theme switch** on login toggles light vs dark; tokens above drive colors (light = red-orange industrial; dark = cyan kinetic).

### Main application shell (post-login)

- After successful login, users land in the **Dashboard** app first. Dashboard may ship with no feature content until modules are added.
- **Layout**: fixed **left navbar** (navigation, app switcher, settings entry points); **right main window** for all detail views, lists, and embedded content. Nested routes render inside the main window only.
- **PrimeReact themes**: use **Lara** (`lara-light-blue` / `lara-dark-blue`) loaded dynamically with `document.documentElement.dataset.theme` (`light` / `dark`) so Prime components match the active mode.
- **Primary colours (current web tokens)**: map Lara to Athene orange via CSS variables on `:root[data-theme="light"]` and `:root[data-theme="dark"]` — **`--color-primary: #f97316`**, **`--color-primary-container: #ea580c`**. Use these (and Tailwind mappings `primary` / `primary-container`) for accents, CTAs, and focus; override Prime defaults where Lara would otherwise paint blue.
- **Consistency**: reuse the same surface / on-surface / outline tokens as login; keep the “no-line” and typography rules from **Shared rules** above.

---

## UI library

- **PrimeReact** — primary React component library: [PrimeReact documentation](https://primereact.org/).

---

## Internationalization (i18n)

- Primary languages: **DE** (default) and **EN**.

---

## AI / data / documents

- Heavy **AI** usage; PostgreSQL with **vector** capabilities planned; assistant product name: **Athene**.
- Documents stored in DB initially; later may move to external file server to avoid DB bloat — design APIs with that migration path in mind.

---

## Repository layout

- `backend/` — API, migrations (`backend/migrations/*.sql`), server-side logic; apply with root script `npm run migrate`
- `frontend/` — web app (PrimeReact)
- `mobile/` — React Native app (future focus)

---

## Security note (credentials)

- Never commit real database URLs, passwords, or API keys. Use `.env` locally and `.env.example` with placeholders only.
