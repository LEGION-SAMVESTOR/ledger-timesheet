# Ledger — Daily Timesheet

A single-file timesheet app that mirrors a Google Sheets time-tracking format. Log tasks with a live timer or manual sessions, then copy the day as tab-separated rows that paste straight into the sheet.

## Features

- **Login** — name + PIN (hashed, stored locally). Each user's data is kept separately in the browser's localStorage.
- **Brands** — fixed dropdown (KN, ZW, RW, AUJ, SV, Default Task) with color-coded pills matching the sheet.
- **Time tracking** — ▶/⏹ live timer per task, or manual `HH:MM` session entry. Tasks can have multiple sessions.
- **Statuses** — Done, In Progress, Paused, Preview Sent (color-coded like the sheet).
- **Copy for Sheets** — one row per session, columns `Brand → Project → Task → Start Time → End Time → Time Spent → Status`, with Brand/Project/Task/Status only on a task's first row. Hours are decimal (e.g. 8 min → 0.13).
- **Retention** — keeps today and the previous working day (weekends skipped); older days are pruned automatically.

## Run

Open `index.html` in a browser, or host it anywhere static (GitHub Pages, Netlify). No backend, no build step.

> Note: data is per browser, per device — localStorage does not sync between machines.
