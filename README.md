# AM/NS India SFI Portal — complete frontend + backend package

This package preserves the supplied AM/NS red/white SFI form/register layout and adds the submitter email field, live backend refresh, server-side storage, photo uploads, action closure, and Power Automate webhook notifications.

## What this package does
- **No dummy/sample records**: the frontend starts with an empty in-memory list and reads records only from `GET /api/sfis`. No `localStorage` or seeded data is used.
- **Shared backend data**: creates and closes records through the server API; refresh button, tab switching, page visibility, and a 30-second polling interval fetch current backend records.
- **Submitter email ID**: required field stored in the database and included in the notification payload.
- **Unique SFI references**: server generates random non-sequential IDs such as `SFI-2026-AB12CD34EF`; the database primary key prevents duplicates.
- **Persistent database and photo storage**: SQLite + uploaded images. Use a persistent disk/volume in the hosting provider or data may be lost on redeploy.
- **Email automation**: backend emits `SFI_CREATED`, `SFI_CLOSED_ON_CREATION`, and `SFI_CLOSED` events to Power Automate. Emails only send after you configure the flow and `PA_WEBHOOK_URL`.

## Deploy to Render (recommended simple hosted option)
1. Upload all package contents to the root of one GitHub repository. Do not upload only `index.html`; the backend files are required. Keep `public/index.html` at that exact path.
2. Commit and push the repository.
3. In Render, create a **Blueprint** from that repository using `render.yaml`. The blueprint provisions a web service and a persistent disk at `/var/data`.
4. After the service is created, open **Environment** and set `PA_WEBHOOK_URL` to your Power Automate HTTP trigger URL. Optionally set `PA_SHARED_SECRET` if you implement validation in a gateway/flow. Save/redeploy.
5. Open the service URL. Check `/api/health`; it should return `ok: true` and `database: connected`.
6. Test a real SFI submission, verify it in Live Register, refresh the page, and confirm the record remains. Test email in Power Automate run history.

**Important:** A persistent disk generally requires a paid web-service plan on hosting platforms. Do not use ephemeral storage for the database or uploads. The `render.yaml` declares a persistent disk; confirm the plan/cost in your Render account before creating it.

## Local test (optional)
Requires Node.js 20+ and npm:
```bash
npm install
cp .env.example .env
npm start
```
Then open `http://localhost:3000`. For Windows, copy `.env.example` to `.env` instead of using `cp`. Without `PA_WEBHOOK_URL`, records still save but email automation will not trigger.

## Hosting settings
- `PORT`: supplied by host, normally do not set manually.
- `DATA_DIR`: folder for SQLite database.
- `UPLOAD_DIR`: folder for photo files.
- `PA_WEBHOOK_URL`: private Power Automate HTTP POST trigger URL.
- `PA_SHARED_SECRET`: optional header value; only use when you have configured validation for it.

## API
- `GET /api/health` — service/database and email-configuration status.
- `GET /api/sfis` — all backend records, newest first, no cache.
- `GET /api/sfis/:id` — one SFI record.
- `POST /api/sfis` — multipart form create; image fields `beforePhoto` and optional `afterPhoto`.
- `POST /api/sfis/:id/close` — multipart closure fields `actionTaken` and required `afterPhoto`.

## Important deployment/security limitations
This is a complete starter implementation, not a fully hardened enterprise application. There is no login or role-based access control, and photo URLs are publicly served by the app. Deploy behind organisation-approved authentication/network access before using sensitive employee data. Do not store personal or confidential information unless approved. Configure backups and monitor Power Automate run history. Email is not guaranteed until the flow and trigger URL are tested successfully.

See `POWER_AUTOMATE_GUIDE.md` for detailed flow setup.
