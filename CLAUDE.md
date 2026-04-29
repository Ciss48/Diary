# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

The frontend requires no build step — open any HTML file in a browser or use VSCode Live Server.

The AI suggestion feature routes through a Vercel serverless function (`api/suggest.js`). To run it locally:
1. Copy `.env.example` to `.env.local` and fill in `GROQ_API_KEY`
2. Run `npx vercel dev`

Production deploys to Vercel; `GROQ_API_KEY` must be set as an environment variable there. The Supabase `SUPABASE_URL` and `SUPABASE_ANON_KEY` are hardcoded in `app.js` (safe — anon key is public by design).

**Note:** `TASK_PHASE4_AUTH.md`, `TASK_PHASE5_IMAGES.md`, `TASK_PHASE6_TODO.md` are historical design specs for completed features — they describe what was built, not pending work.

## Architecture

**Frontend:** Pure client-side — HTML + CSS + Vanilla JS. All logic is in `app.js`, all styles in `style.css`, shared across all pages. The Supabase client is initialized as the global `db` at the top of `app.js` and used by all page-level functions.

**Backend:** One Vercel serverless function at `api/suggest.js` that proxies Groq API calls (keeps the API key server-side).

**Page routing** is determined by `data-page` attribute on `<body>`:
- `data-page="index"` → `initIndexPage()`
- `data-page="history"` → `initHistoryPage()`
- `data-page="entry"` → `initEntryPage()`
- `data-page="auth"` → `initAuthPage()`

`app.js` auto-dispatches on `DOMContentLoaded` based on this attribute.

**External dependencies (all via CDN, no npm on frontend):**
- Supabase JS: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js`
- heic2any (HEIC image conversion): loaded from CDN, used in `initPhotoStrip` before uploading
- Fonts: Google Fonts (Playfair Display, Lora, EB Garamond)

**AI:** `app.js` posts to `/api/suggest` (Vercel function) → Groq `llama-3.1-8b-instant`. The prompt is written for a Vietnamese user learning English — preserve this context when modifying it.

## Database (Supabase project: `tsdzrzrsjbetkalgthfx`)

RLS is enabled on all tables. All queries rely on RLS for user isolation — no manual `user_id` filtering needed in SELECT queries.

**`diary_entries`** — one row per user per date:
```
id uuid PK, user_id uuid FK, date date, content text, ai_suggestion text (JSON), created_at, updated_at
UNIQUE: (user_id, date)
```

**`entry_images`** — up to 3 photos per entry:
```
id uuid PK, entry_id uuid FK → diary_entries, user_id uuid FK, storage_path text, display_order int, created_at
```
Images stored in Supabase Storage bucket `diary-images` (private, accessed via signed URLs expiring 1hr). Path: `{user_id}/{entry_date}/{timestamp}_{filename}`.

**`entry_todos`** — daily task list:
```
id uuid PK, user_id uuid FK, entry_date date, task text, completed bool, display_order int, created_at, updated_at
```
Note: tied to `entry_date` (not `entry_id`) so todos work even when no diary entry exists for that day.

## Auth Flow

All pages call `requireAuth()` on load — redirects to `auth.html` if no session. Current user is cached at `window._currentUser` (set by `requireAuth()`). Sign-out is handled by `addSignOutButton()` which injects a button into `.app-header`.

`db.auth.onAuthStateChange` listens for `SIGNED_OUT` events and redirects to `auth.html`.

## Key Patterns in app.js

- **Auto-save**: debounced 2s after typing on `index.html`, calls `upsertEntry(date, content)`. `entry.html` uses a manual Save button.
- **Upsert conflict key**: `(user_id, date)` — ensures one entry per user per day.
- **AI suggestion**: `suggestBetterEnglish(text)` → `/api/suggest` → parses `IMPROVED:`, `WHAT I CHANGED:`, `WRITING ANALYSIS:` sections. Regex uses `[:\*]*` to tolerate markdown the model may add around headers.
- **Split editor layout**: when AI suggestion is shown, `.editor-layout` gets class `split`, `.container` gets class `wide`, `.ai-bottom-panel` gets class `visible`. `activateSplit(container)` / `deactivateSplit(container)` manage this.
- **AI persistence**: saved as JSON in `ai_suggestion` column, restored on page load via `renderAiBox(container, result)`.
- **Line numbers**: `initLineNumbers(textarea, lineNumEl)` syncs scroll between textarea and sibling line-number div. Works on both textarea (original) and div (AI improved text).
- **Past/future date editing**: `initIndexPage()` reads `?date=YYYY-MM-DD`; if present, that date is used instead of today. All dates on the calendar are clickable (no future-date restriction).
- **Entry page routing**: `initEntryPage()` reads `?id=UUID`; redirects to `history.html` if missing or not found.
- **Photo strip**: `initPhotoStrip(stripEl, entryRef, entryDate, getContent)` — handles upload, optimistic preview, delete. HEIC files are converted via `heic2any` before compression. Max 3 images; slot count drives `+ Add Photo` visibility. If no entry exists yet at upload time, creates one first.
- **Todo section**: `initTodoSection(sectionEl, date)` — two-column layout (Pending / Completed). Clicking an item toggles and re-renders. Inline add via `+ Add a task` link → input → Enter/blur to commit.
- **Image compression**: `compressImage(file, maxWidth, quality)` uses Canvas API. Reads file as data URL first (Safari HEIC compatibility) before drawing to canvas.

## Design System

CSS variables at the top of `style.css`. Old paper / classic diary aesthetic:
- `--bg-page: #f5f0e8`, `--bg-paper: #faf7f2`, `--accent: #8b4513`
- Textarea uses `repeating-linear-gradient` to simulate ruled notebook lines
- Serif fonts: Playfair Display (dates/headings), Lora (body content)
