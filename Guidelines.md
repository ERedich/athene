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
- References to a **cost center** must respect **site consistency**: the cost center’s **`siteId`** must equal the owning record’s site (e.g. **`asset.siteId`** = **`costCenter.siteId`** when `asset.costCenterId` is set).

### Site color marking (`site.colorHex`)

- Every **site** (`Standort`) stores an accent color in **`colorHex`** (validated HEX, see migration `backend/migrations/004_site_add_color_hex.sql` and the Sites app).
- Whenever the UI shows a **site reference** (assignment, key/name, filters, table cells, dropdown labels), the **color marking is text-only**:
  - Render the site label as **plain text** (no color swatch, no filled badge/chip, no extra color box beside the name).
  - Apply **`readableSiteColor`** from [`frontend/src/lib/siteColor.ts`](frontend/src/lib/siteColor.ts) as the **font color** of that text, derived from the site’s stored `colorHex`, so contrast stays acceptable on both themes.
  - Put the full label and HEX in a **`title` / tooltip** (e.g. `KEY - Name (#rrggbb)`) where helpful.
  - For **multi-select** lists of sites, do **not** use chip/pill presentation (e.g. PrimeReact `display="chip"`); prefer **`display="comma"`** or equivalent plain text.
- **APIs** that expose site identity for other entities should include **`siteColorHex`** (joined from `site`) when they already return `siteKey` / `siteName`, so consumers can style text without an extra site fetch.
- Do **not** invent unrelated per-screen colors for sites; always derive the text color from stored `colorHex` (fallback only to the shared default in `siteColor.ts` when a value is missing).

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
- **Exception — Dashboard Athene greeting KPI**: the system KPI **`atheneGreeting`** spans **2 columns × 2 rows** on the desktop grid (≥1100px; smaller breakpoints use full-width × 2 rows). It shows a time-of-day greeting (**Guten Morgen / Guten Tag / Guten Abend** only — no night greeting) with the signed-in user’s `name`, a soft period-of-day background (visible opacity fade toward the right), and an Athene AI briefing split into **Nachrichten** (unread Mitteilungszentrale items), **Rückblick** (last 24h), and **Vorschau** (next 48h maintenance) via `GET /api/dashboard/athene-briefing`. It is not a DataTable; header search / row-count rules do not apply. Layout storage key: `athene.dashboardLayout.v2`.
- **Layout**: fixed **left navbar** (navigation, app switcher, settings entry points); **right main window** for all detail views, lists, and embedded content. Nested routes render inside the main window only.
- **PrimeReact themes**: use **Lara** (`lara-light-blue` / `lara-dark-blue`) loaded dynamically with `document.documentElement.dataset.theme` (`light` / `dark`) so Prime components match the active mode.
- **Primary colours (current web tokens)**: map Lara to Athene orange via CSS variables on `:root[data-theme="light"]` and `:root[data-theme="dark"]` — **`--color-primary: #f97316`**, **`--color-primary-container: #ea580c`**. Use these (and Tailwind mappings `primary` / `primary-container`) for accents, CTAs, and focus; override Prime defaults where Lara would otherwise paint blue.
- **Tables**: every PrimeReact `DataTable` in the app must use `app-data-table` so header and body cells share one font size. Do not add local `text-xs` / `text-sm` overrides inside table cells; use color, mono font, width, and alignment classes only unless a new table-specific design decision is documented here first.
- **Tables (global density toggle)**: table density is a single global user setting (not per table), controlled by the sidebar **Misc** `Aa` button. Persist and apply it via `document.documentElement.dataset.tableDensity` (`comfortable` default, `compact` optional). Do not introduce per-screen/per-table compact size classes.
- **Tables (headers, icons, width)**: header labels must stay on one line (no word wrap): use the shared `app-data-table` rules in [`frontend/src/index.css`](frontend/src/index.css) so sort and filter icons stay **beside** the title on one horizontal row (`inline-flex` / `flex-direction: row` on `.p-column-header-content`, including scrollable header tables), not stacked under the label. The table may be wider than the viewport: the Prime wrapper (`.p-datatable-wrapper` / `.p-treetable-wrapper`) already scrolls horizontally; do not squeeze wide grids with `table-layout: fixed` plus `width: 100%` unless documented here. Prefer explicit column `min-w-*` classes and/or `tableStyle={{ minWidth: "…" }}` so headers and body columns stay aligned. **TreeTable** must not use `min-w-0` / tight `max-w-*` on columns that forces header truncation; match flat `DataTable` min widths where the same data is shown. **Documented exceptions** (different wrap/overflow) must stay called out in this file — e.g. **App parameters** tabbed tables use `app-parameters-data-table` with wrapped cells and no horizontal growth.
- **Tables (row double-click)**: double-clicking a table row must trigger the same behavior as clicking that row's **Edit** action.
- **Exception — Translations**: the **Translations / Übersetzungen** app ([`frontend/src/pages/TranslationsPage.tsx`](frontend/src/pages/TranslationsPage.tsx)) edits DE/EN inline in row cells without a dialog; binding double-click is **not required** until a discrete edit affordance exists.
- **Exception — Kalendar**: the **Kalendar** app ([`frontend/src/pages/KalendarPage.tsx`](frontend/src/pages/KalendarPage.tsx)) uses a div/CSS-grid calendar (not a `DataTable`); CRUD context menu and row double-click rules do **not** apply. Users open work orders by clicking event bars; **right-click** an event bar opens **Athene** for planning help on that order. Header search and row count in the shell title still apply. Three views: **month** (week grid), **week** (one week row), **day** (horizontal 0–24h timeline with orders positioned by `plannedStart` / `plannedEnd`). Toolbar: view toggles, then prev/next/today for the active range. **Drag & drop** (month/week only) moves the whole work order (`plannedStart` / `plannedEnd`, duration preserved); drops before **today** (local midnight) are rejected; confirm in an overlay before `PUT`.
- **Exception — Schichtplaner**: the **Schichtplaner** app ([`frontend/src/pages/ShiftPlannerPage.tsx`](frontend/src/pages/ShiftPlannerPage.tsx)) uses a tabbed shell (three tabs; Phase 1 ships **Schichtüberblick** only) with a **div/CSS-grid week calendar** — not a `DataTable`. Tab **Schichtüberblick** exposes **Simpel / Komplex** toggle and **week navigation** (prev / Heute / next + period title with calendar week) in the **shell header** (top nav, before search; default **Komplex**). **Komplex**: vertical **24h time axis** (shared hour labels left of the week grid); shift blocks are **absolutely positioned** by start/end time; **overnight shifts** (end ≤ start) split into evening + morning segments across column borders (`continuesBefore` / `continuesAfter`). **Simpel**: stacked shift chips per day (no time axis, no vertical offset, compact blocks); overnight shifts stay one block with full time range. **Date-specific employee assignments** are managed via drag & drop from a **global employee pool** **above** the week grid (`isShiftPlanning && isActive` from `/api/employees`) onto shift blocks; persisted in `employeeShiftAssignment` via `/api/shift-planner/assignments` (an employee may be assigned to multiple shifts on the same calendar day; duplicate assignment to the same shift on the same day is prevented). In **Komplex** view, dropping an employee opens an **Ausrollen** popover (until date) via `POST /api/shift-planner/assignments/rollout`; **Simpel** keeps single-day assign on drop. Hover **X** on a shift block removes that weekday from the shift template; hover **+** in each day header adds shifts not yet on that day (disabled/grayed when none available). CRUD context menu and row double-click rules do **not** apply. Header search filters shift blocks and the employee pool by name/key (client-side). **`setHeaderRowCount` is not required** for this app.
- **Tables (context menu)**: every primary `DataTable`, `TreeTable`, or equivalent main-window list table on the **desktop** app must provide a **right-click context menu** with at least the three CRUD-aligned entries — **New**, **Edit**, and **Delete** — matching the shell header actions and i18n for that screen (Edit must match row double-click). Use the shared helpers in [`frontend/src/lib/useTableContextMenu.tsx`](frontend/src/lib/useTableContextMenu.tsx) (`useTableContextMenu` for flat tables, `useTreeTableContextMenu` for `TreeTable`). **Do not** omit or substitute a different menu for a given app **unless** an explicit product decision says otherwise; when an app is read-only, intentionally menu-free, or needs a custom set of items only, that exception must be **called out in this file** for that app.
- **Exception — Athene context menu entry**: **Assets**, **Aufträge / Work orders**, **Monitor / Monitoring**, **Ersatzteile / Spare parts**, and **Lager / Warehouses** must prepend **Athene fragen / Ask Athene** as the first context-menu item. It opens the single global Athene Assistant instance with the selected row as context; while Athene is busy, the menu item shows an idle/spinner state and is disabled.
- **Exception — Work-order big menu edit section**: On **Monitoring** and **Aufträge / Work orders**, the big context menu icon row includes **Folgeauftrag / Follow-up order** (opens the create/edit panel prefilled from the selected row, no name dialog). Below the icon rows, column sections sit side by side: **Status** | **Bearbeiten / Edit** (**Neu / New**, **Kopieren / Copy**; copy still uses the name dialog). Shell header **Neu** remains for blank create.
- **Exception — Monitoring subscribe entry**: the **Monitor / Monitoring** context menu includes one additional item for work-order subscriptions (**Auftrag abonnieren / Abonnement beenden**) so users can toggle monitoring notifications directly from the selected row.
- **Exception — Translations context menu**: the **Translations / Übersetzungen** matrix uses **Copy key** and **Reset row to bundled defaults** (clears DB overrides for that row) instead of New/Edit/Delete, because rows are predefined UI keys—not created or deleted via CRUD.
- **Tables (status icon)**: check icons that represent active/true/plant states in tables must be green (use global `app-data-table` styling for `i.pi.pi-check`; avoid neutral white/gray checks).
- **Tables (row count in shell title)**: every desktop **app** that ships a primary `DataTable`, `TreeTable`, or equivalent scrollable list must publish its currently visible row count to the shell header so the page title renders as `Title_ [count]`. Use `setHeaderRowCount` from the `AppShellOutletContext` ([`AppShellLayout.tsx`](frontend/src/layout/AppShellLayout.tsx)) — pass the **filtered/displayed** row count (after the header search filter is applied), and call `setHeaderRowCount(null)` on unmount. The shell formats the number via `Intl.NumberFormat(i18n.language)` (DE thousands separator `.`, EN `,`), keeps the signature `_` accent attached to the title text, and renders the brackets `[ ]` in **bold** with the number itself in **normal** weight (see `app-shell-title__name` rules in [`frontend/src/index.css`](frontend/src/index.css)). For **tabbed list apps** (e.g. App parameters), publish the count of the **active tab's** rows, not the union across tabs. **Mobile** clients are exempt — this header convention applies to the desktop frontend only.
- **Search (mandatory per app)**: every main-window **app** that shows a primary **DataTable** or equivalent **scrollable list** must expose a **header search** field. That includes **App parameters** (tabbed tables), **Sites**, **Users**, **Cost centers**, **Assets**, **Audit log**, **Translations / Übersetzungen**, and any future list apps. **Dashboard** and other placeholder-only views are exempt until they ship a list or table.
  - **Placement**: search is always part of the shell **header action row** via `setHeaderActions` from [`AppShellLayout.tsx`](frontend/src/layout/AppShellLayout.tsx). Put it at the **far right** (`<li className="ml-auto">`); CRUD or other actions stay to the left in the same `<ul>`. If an app has no other header actions, the `<ul>` still contains only the search item with `ml-auto` (same pattern as Audit log and App parameters). Use `<ul className="m-0 flex w-full list-none items-center gap-1 p-0">` for the action row.
  - **Component pattern**: PrimeReact `IconField` + `InputIcon` + `InputText` (search icon on the left).
  - **Sizing**: compact header control (`h-9`, about `w-56`) unless a screen documents a different width.
  - **Styling**: use the shared class **`app-header-search-input`** on `InputText` (padding/overrides live in [`frontend/src/index.css`](frontend/src/index.css)); do not rely only on utility padding because global `.p-inputtext` rules use `!important`. Add **`!rounded-sm text-sm`** on header search fields. CRUD and view-toggle header actions use **`app-header-action-nav-item`** (`h-9`, text label, hover/active like **Neu / Bearbeiten** on list apps); active toggles add **`app-header-action-nav-item--active`**. Prime **`app-header-toolbar-btn`** only when a header control must be a Prime `Button`.
  - **Behavior**: filter the **current** list or table **live** on the client (trimmed case-insensitive match), including within the **active tab** for tabbed apps, unless the product explicitly specifies server-side search.
- **Consistency**: reuse the same surface / on-surface / outline tokens as login; keep the “no-line” and typography rules from **Shared rules** above.

### Range filters (von–bis) and filter drawers

- **Mirror bis from von**: For every **from–to** pair in the UI (numbers, dates, or other bounded fields), **when the user changes the “from” (von) value, set the “to” (bis) value to the same value in one state update** so a single bound can be entered once. The user may still edit **bis** afterward for a true range. Apply this pattern consistently wherever von–bis controls appear (search panels, reports, etc.).
- **Enter submits Apply**: For **search / filter drawers** (or similar panels) that expose **Apply** and **Reset**, wrap the filter body in a **`<form>`**. Use **`type="submit"`** for Apply and **`type="button"`** for Reset; **`preventDefault`** on **`onSubmit`** and call the same handler as Apply. That way **Enter** in a text field submits the form and runs **Apply** (native form behavior).
- **Audit “created by” / “updated by” on work orders**: These are **discrete filters** on **`workOrder.createdBy` / `workOrder.updatedBy`** (user UUIDs), **not** free-text LIKE. Populate options from **`GET /api/users`** (or the same user directory source as the Users app); use **multi-select** and query params **`createdBy`** / **`updatedBy`** as repeated UUIDs, matching the backend list API.
- **Work order search panel — discrete vs free text**: Any field backed by a **foreign key** or **stable key/name column on a referenced entity** (site, asset, cost center, classification, work group, responsible employee, assignments, etc.) must use **discrete multi-select** (UUID params), **not** LIKE on keys or display names. **LIKE / substring filters** belong only on columns that store **real user-entered prose** on the order itself (e.g. **short name**, **description**). The header **quick search** string should similarly avoid searching FK display strings unless product asks otherwise; default is **order free text + order number** only.

### Reference affordances (“Referenzen” in tables)

Use these **background** colors for reference icon buttons (and matching border) so users can read the reference *type* from color alone. Implement via shared classes in `frontend/src/index.css` (`app-ref-button--…`); do not invent ad‑hoc hex values per screen.

| Reference kind | Meaning | Background (Tailwind token) | CSS class |
| --- | --- | --- | --- |
| **Documents** | For **Assets**: asset has document references. For **Work orders / Monitoring**: the work order itself has at least one document reference (`documentCount > 0`); the referenced asset may additionally have documents (`assetDocumentCount >= 0`). | **`cyan-300`** | `app-ref-button--documents` |
| **Documents (work order asset-only)** | Work order / monitoring row has **no documents directly on the work order** (`documentCount = 0`) but its referenced **asset has documents** (`assetDocumentCount > 0`). This is a source/type cue, **not** a permission cue. | **`green-300`** | `app-ref-button--documents-asset` |
| **Documents (inactive)** | Document column when **count = 0**; control stays **disabled**; **transparent** button background and border — only the file icon in a **soft blue** (`sky-300`, see [`frontend/src/index.css`](frontend/src/index.css)); must **not** use primary/orange fill. | — | `app-ref-button--documents-inactive` |
| **Employees / assignments** | Open planning / assignments for a row; **no numeric badge** — use `pi-user-plus` (plus is in the icon). | **`slate-300`** (neutral gray) | `app-ref-button--employees` |
| **Material** | Material / stock–related links | **`green-300`** | `app-ref-button--material` |
| **Purchase (Einkauf)** | Procurement / purchasing links | **`pink-300`** | `app-ref-button--purchase` |
| **Work orders (Aufträge)** | Asset has linked work orders (`workOrderCount > 0`), e.g. Baumstruktur Referenzen. | **`violet-300`** | `app-ref-button--work-orders` |
| **Inspection points (Prüfpunkte)** | Asset has inspection points (`inspectionPointCount > 0`), e.g. Assets / Baumstruktur Referenzen. | **`amber-300`** | `app-ref-button--inspection-points` |

- **Foreground**: keep icon and badge text **high contrast** on these pastel fills (the shared classes use a dark slate foreground; adjust only if documented here).
- **Document colors are not permission states**: for work orders / monitoring, **green means only asset document references exist** (`documentCount = 0`, `assetDocumentCount > 0`), **cyan/blue means at least one work-order document reference exists** (`documentCount > 0`, regardless of whether asset documents also exist), and transparent/soft-blue means no documents (`documentCount = 0`, `assetDocumentCount = 0`). Current permission checks are enforced by API access rules, not by document icon color.
- **Disabled / empty (other kinds)**: for **material**, **purchase**, and **work orders** (when count = 0), use neutral/transparent surface styling — **do not** use the strong green / pink / violet fills. **Documents** when empty: use **`app-ref-button--documents-inactive`** (transparent chrome, bluish icon only — not a filled pill). Work orders when empty: use **`app-ref-button--work-orders-empty`**.

---

## UI library

- **PrimeReact** — primary React component library: [PrimeReact documentation](https://primereact.org/).
- **Always** consult the PrimeReact guidelines on components, theming, and implementation at [https://primereact.org](https://primereact.org) **before applying changes** whenever anything about a component's API, props, styling hooks, theme tokens, or implementation pattern is unclear. Verify against the official docs first, then implement.

---

## Modal Handling

- There are two modal types: normal modal windows (MW) and big modal windows (BMW).
- BMW use 80% of screen width and 90% of screen height.
- MW and BMW must have a divider below the title, except when the modal contains a TabView immediately under the title — in that case the tab navigation border serves as the divider and the header divider is omitted.
- Clicking outside a modal window (MW/BMW) should close the modal.
- Every PrimeReact `Dialog` (via shared `AppDialog`) shows an **Athene** star control in the header icons, immediately left of the close (X) button. Clicking it opens the global Athene Assistant drawer with **modal help** context: the dialog title plus a catalog of visible form fields (labels and kinds for inputs, dropdowns, checkboxes, etc.) so Athene can explain those controls. The Athene drawer must stack **above** the modal (`z-index` higher than the dialog layer).
- Footer buttons (bottom-right) follow a strict pattern:
  - **Cancel / Abbrechen / Close** → outlined secondary (`severity="secondary" outlined`).
  - **Submit / OK / Save / Speichern** → filled primary color (PrimeReact `Button` default; no `severity` or `outlined`).

---

## Destructive actions (delete / remove)

- Destructive actions must be **red**, never the primary (orange) color.
- Use PrimeReact `severity="danger"` on the `Button`; this maps to `--color-danger` (red-500) / `--color-danger-container` (red-600) in our theme.
- Inline icon-only delete in lists/cards: `<Button text severity="danger" icon="pi pi-trash" aria-label="…" title="…" />` (red icon, no fill).
- Confirmation dialogs for destructive actions: pass `acceptClassName="p-button-danger"` so the confirm action renders as a red filled button.

---

## Tab Handling

- Use PrimeReact `TabView` / `TabPanel` for tabbed UI.
- Keep tab state controlled via `activeIndex` and `onTabChange`.
- Use named tab indexes instead of inline magic numbers.
- Tabs in BMW should stay sticky at the top and sit close to the title, while preserving PrimeReact's default TabView styling and selected-tab highlight.
- When a tab represents countable related data (for example documents, assignments, feedback entries/drafts), show the count directly in the tab label in both web and mobile, using the format `Label [n]` (example: `Dokumente [4]`).

---

## Internationalization (i18n)

- Primary languages: **DE** (default) and **EN**.
- All date/time inputs and rendered date/time values must follow the active locale format:
  - **DE**: `DD.MM.YYYY HH:MM`
  - **EN**: `MM/DD/YYYY HH:MM`

---

## Document management (unified)

All file attachments use a single backend model — not one table per app.

| Layer | Table / field | Meaning |
| --- | --- | --- |
| **Storage** | `"document"` | File bytes (`content`), metadata (`fileName`, `displayName`, `category`, `mimeType`, `fileSize`), audit columns |
| **Upload origin** | `"document"."referenceApp"` | App where the user triggered upload (e.g. `assets`, `workOrders`). Monitoring uploads use `workOrders`. |
| **Assignment** | `"documentLink"` | Links a document to exactly one entity today (`entityType` + `entityId`). Phase 1: `UNIQUE ("documentId")` on the link. |

**API shape:** Nested routes stay per parent entity (`POST /api/assets/:id/documents`, `POST /api/work-orders/:id/documents`). Routers are thin wrappers around `backend/src/documents/`.

**Work-order list UI:** `source` in JSON = `documentLink.entityType` (`workOrder` \| `asset`). Icon colors use `documentCount` (on the order) vs `assetDocumentCount` (on the linked asset) — not permissions.

**Adding documents to a new app:**

1. Extend `referenceApp` and `entityType` CHECK constraints in a migration + `backend/src/documents/documentTypes.ts`.
2. Add site/entity resolution in `documentAccess.ts`.
3. Expose nested routes on the app router calling `documentService`.
4. Add list `documentCount` subquery via `documentSql.ts` helpers.
5. Reuse shared categories: `frontend/src/constants/documentCategory.ts` (and i18n keys).

**Size limit:** `DOCUMENT_MAX_BYTES` (default 25 MB). Content may move to external storage later; keep list vs content endpoints separate.

### Document list UI (design foundation)

Source pattern: **Baumstruktur** document references. Apply the same treatment wherever document rows are listed (work orders / Auftragserstellung, assets, spare parts, etc.).

| Rule | Detail |
| --- | --- |
| **Mime icon size** | Fixed **1.25rem (20px)** slot via shared class **`app-doc-ref-icon`** (and Lucide `width`/`height={20}`). Do not use ad-hoc `h-5 w-5` alone without the clamp wrapper. Component: [`DocumentMimeIcon`](frontend/src/components/documents/DocumentMimeIcon.tsx). |
| **Image hover preview** | For image mime/extensions: **hover** shows a floating preview panel (220ms delay, blob URL cache, left of row). Click still opens full content. Hook + portal: [`useDocumentImageHoverPreview`](frontend/src/hooks/useDocumentImageHoverPreview.tsx). CSS: **`app-doc-image-preview`**. Hint i18n: `documentsUi.imagePreviewHint`. |
| **Legacy aliases** | `app-asset-refs-doc-icon` / `app-asset-refs-image-preview*` remain as aliases for the same rules. |

---

## Athene Assistant

- Product name: **Athene**. Athene is implemented with the OpenAI API and Neon/PostgreSQL vector capabilities (`pgvector`) for semantic retrieval over CMMS data and documents, combined with SQL-backed assistant tools for authoritative answers.
- Athene answers in the currently selected frontend language.
- Athene formats dates and times according to the currently selected frontend language:
  - **DE**: `DD.MM.YYYY HH:MM`
  - **EN**: `MM/DD/YYYY HH:MM`
- Athene can never delete data. If a user asks Athene to delete records, Athene must always answer with the same refusal and must not call tools: **"Ich bin nicht in der Lage Datensätze zu Löschen"** (localized equivalent allowed only where the active frontend language requires it).
- Athene knows the current user context: user name, login, working site, accessible sites, linked employee, workgroups / Fachgruppen, and future user context such as roles or permissions when those fields are introduced. Athene must never expose or infer password hashes, passwords, API keys, session secrets, or similar sensitive data, and must never change them.
- Athene respects site restrictions. A user must not receive answers, vector snippets, documents, or generated work orders for sites they cannot access. Assistant tools and retrieval queries must reuse the same site-access checks as the normal backend APIs.
- Athene understands UI context. When a record is selected in a supported app, Athene receives that context and can answer questions about the selected work order, asset, spare part (material), or warehouse.
- **Modal help:** Opening Athene from a dialog header star passes `intent: modalHelp` with `modalTitle` and `fields` (visible control labels/kinds). Athene explains those form fields, dropdowns, and checkboxes; it does not write master data from that mode alone.
- Athene supports **voice input** (microphone) in the assistant drawer and in work-order feedback fields. The client records audio, then `POST /api/assistant/transcribe-spoken` runs **OpenAI Whisper** with automatic language detection, transcribes faithfully, and returns text in the active UI language (de/en) — translate only when the detected language differs from the UI locale. Requires HTTPS (or localhost), microphone permission, and `OPENAI_API_KEY` on the backend. Audio is sent to the server briefly for transcription. The user still sends assistant messages with **Senden / Send**.
- **Work-order feedback (Rückmeldung)** on web and mobile: each feedback remark field (main remark and pause remark) has a **microphone** control using the same Whisper pipeline. A **Athene** control on the feedback dialog header (web: star icon left of close — shared with all dialogs via `AppDialog`, and on fullscreen WO edit in the page header; on Feedback tab the star opens feedback mode; mobile: sparkles + close on the quick modal, sparkles in the editor header on the feedback tab) opens Athene in **feedback mode** with draft remark text, asset/work-order context, and suggestion chips for similar asset history and proofreading. Corrections are offered via **Text übernehmen / Apply text** only after the user confirms; Athene never saves feedback automatically. Backend tool: `listWorkOrdersByAsset`. Legacy `POST /api/assistant/localize-spoken-text` (text-only) remains for debugging.
- Athene must not add, change, or delete records for apps in the **Stammdaten / master-data** category, including sites, users, employees, workgroups, cost centers, shifts, warehouses, **storage locations (Lagerplatz)**, spare parts, classifications, app parameters, translations, table viewer metadata, and **maintenance plans (Wartungspläne)**. Exception: Athene may **create** work-order **search configurations** (Suchkonfiguration / Auftragskonfig, `workOrderSearchPreset`) for the current user; Athene must not update, delete, or share presets.
- Athene may create work orders under user guidance via assistant tools `createWorkOrder` (explicit UUID references), `createWorkOrderFromOrder` (copy from an existing Auftragsnummer), or **`generateMaintenancePlanWorkOrder`** (create the next open maintenance WO from a plan). Copying must use the template tool so asset/cost-center/workgroup UUIDs are taken from the database, not from displayed business keys. Creation enforces the same required fields, site rules, workgroup rules, classification rules, and reference validations as the normal UI.
- **Athene + Suchkonfiguration:** Tools `listWorkOrderSearchPresets`, `searchEmployeesForFilter`, `searchWorkgroupsForFilter`, `searchAssetsForFilter`, `createWorkOrderSearchPreset`. Only set filter fields the user explicitly requests; leave all other advanced fields empty/default (no field-by-field questionnaire). If the preset name is missing, ask once for the name before calling create. When the user refers to themselves (`ich` / `mich` / `meine Aufträge`) in a filter sense, disambiguate: pseudo-class **`__ME__`** (“Ich”, resolves to the logged-in user’s linked employee at query time) vs. the concrete employee UUID from the user profile — unless the user already made that clear. Same idea for “meine Fachgruppen” → `__MY_WORKGROUPS__` vs. a named workgroup. After create, confirm the name and that the preset is selectable in the Monitoring / Work orders dropdown; do not set defaults or auto-apply the filter in the open UI.
- **Maintenance plans (Phase 1):** Stammdaten app under `/maintenance-plans`. Calendar-interval plans (`day|week|month|year`) store template fields and schedule (`anchorDate`, `nextDueAt`, `leadTimeDays`). A backend generator (API + daily job at app parameter `WO-GNWO`, Europe/Berlin) creates `maintenance` work orders and sets `workOrder.maintenancePlanId`. By default at most one open WO per plan unless `ignoreOpenWorkOrders` is set. Athene may **`listMaintenancePlans`** (read) and **`generateMaintenancePlanWorkOrder`** (generate WO); Athene must not CRUD plan master data.
- **Work-order follow-up vs copy (web):** **Folgeauftrag / Follow-up order** opens the shared create/edit panel immediately with fields copied from the template row, default Kurzbezeichnung **`Folgeauftrag: {name}`** / **`Follow-up: {name}`**, and `originalWo` set to the source UUID (no intermediate name dialog). **Kopieren / Copy** keeps the name dialog, then the same prefilled create panel (default name `{{name}} (Kopie)` / `(copy)`). Both set `originalWo` on `POST /api/work-orders`. Blank **Neu / New** leaves `originalWo` null. `originalWo` is immutable after create. Athene `createWorkOrderFromOrder` sets the same field when creating via chat.
- **Athene + Kalendar (planning):** On the **Kalendar** app, right-click a work-order event bar to open Athene with calendar context (visible date range + selected order). Assistant tools: `listWorkOrdersInPlanningWindow`, `analyzeWorkOrderPlanning`, `findPlanningSlots` (one order), **`shiftWorkOrdersInPlanningWindow`** (preview only — move **all** orders in a source week/range to a target week, e.g. KW 20 → KW 30), **`planSequentialWorkOrderSlots`** (only a short list on the **same asset** — **not** for whole KW moves), **`rescheduleWorkOrdersBatch`** (persists via `shiftPlan` or `assignments`), `rescheduleWorkOrder` (single order). **`shiftWorkOrdersInPlanningWindow` does not save** — persistence requires `rescheduleWorkOrdersBatch` (tool) or the UI button **Kalenderwoche verschieben (übernehmen)** / `POST /api/assistant/apply-planning-shift` (injected `rescheduleShift` meta after preview). Athene must **not** claim orders were moved unless `rescheduleWorkOrdersBatch` returned `ok: true` with matching `updatedCount`. Batch updates support **multiple assets** (no `mixed_assets` rejection). **Planning collisions** are warnings → `allowAssetOverlap: true` after user confirmation. **Not before today:** `plannedStart` not before calendar today (**Europe/Berlin**). UI apply: `[ATHENE_APPLY:reschedule:{…}]`, batch apply for small sets, or shift apply for whole weeks.
- Athene knows work orders in detail. It may read all accessible work-order fields and referenced tables needed to answer the user.
- Athene may read documents for work orders and assets when the API exposes usable content. Binary/PDF text extraction is a separate capability and must be handled explicitly when implemented.
- Documents use the unified `"document"` / `"documentLink"` model (see **Document management** above). Athene tools `listDocuments` and `readDocumentText` go through the same service and site checks as the REST API.
- **Vector ingest** (`assistantEmbeddingChunk`): embedded entities are **`asset`** (all asset fields), **`workOrder`** (full work-order row and references), **`workOrderDocument`** (documents on a work order plus asset documents visible on that order’s asset — same scope as work-order document listing), **`sparePart`** (spare-part master data plus `stockControl` / Lagerdaten lines that reference `storageLocation` master keys under a warehouse), and **`warehouse`** (warehouse master data plus aggregated stock in that warehouse). Site id on each chunk enforces the same site access as APIs at retrieval time.
- Vector snippets are **hints** only; tools remain required for exact lists, IDs, and live data. After deploy or bulk data import, run `npm run athene:reindex` (backend: `athene:reindex-embeddings`) with `OPENAI_API_KEY` and `ATHENE_EMBEDDING_ENABLED=1`. CRUD on assets, work orders, spare parts, warehouses, and in-scope documents triggers async re-index when enabled.

---

## Repository layout

- `backend/` — API, migrations (`backend/migrations/*.sql`), server-side logic; apply with root script `npm run migrate`
- `frontend/` — web app (PrimeReact)
- `mobile/` — Expo + React Native Web client (`mobile/README.md`)

---

## Security note (credentials)

- Never commit real database URLs, passwords, or API keys. Use `.env` locally and `.env.example` with placeholders only.
