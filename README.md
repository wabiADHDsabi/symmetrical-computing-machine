# Letters to Son

A private journal of letters, deployed on Netlify, stored in Supabase.

---

## First-time setup (do this once)

### 1. Supabase

1. Go to [supabase.com](https://supabase.com) and create a free project
2. Go to **SQL Editor → New query**, paste the contents of `supabase-schema.sql`, and click **Run**
3. Go to **Storage → New bucket**, name it `media`, set it to **private**
4. Add a storage policy on the `media` bucket:
   - Dashboard → Storage → media → Policies → New policy → For full customization
   - Name: `allow_all`
   - Operations: SELECT, INSERT, UPDATE, DELETE
   - Target roles: `anon`
   - USING expression: `true`
   - WITH CHECK expression: `true`
5. Go to **Settings → API** and copy:
   - Project URL (looks like `https://xxx.supabase.co`)
   - `anon` / `public` key

### 2. Netlify

**Option A — GitHub (recommended for easy updates)**

1. Push this folder to a GitHub repo (can be private)
2. Go to [netlify.com](https://netlify.com) → New site from Git → connect your repo
3. Build settings (auto-detected from `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Deploy

**Option B — drag and drop**

1. Run `npm install && npm run build` locally
2. Drag the `dist/` folder to [app.netlify.com/drop](https://app.netlify.com/drop)

### 3. First visit

Open your Netlify URL. You'll see the setup wizard:
1. Enter your son's name
2. Enter your Supabase URL and anon key
3. Set a password

These are saved in your browser's localStorage — repeat on each new device.

---

## Daily use

Just open your Netlify URL, log in, and write.

- **Tap any bubble** to open Edit / Export / Delete
- **+ Add entry** to write a new letter
- Photos and videos upload directly to Supabase Storage

---

## Backup & longevity plan

Your letters live in Supabase (a Postgres database + file storage).  
Use **Export → .md** regularly and save the file somewhere permanent:
- A folder on your computer
- Google Drive
- A USB drive in a drawer

Markdown files are readable by any text editor forever.  
When your son turns 18, export everything and give him the folder.

---

## Local development

```bash
npm install
npm run dev
```

App runs at `http://localhost:5173`

---

## Project structure

```
letters-to-son/
  src/
    App.jsx          — full application
    supabase.js      — database client
    main.jsx         — React entry point
  index.html
  package.json
  vite.config.js
  netlify.toml       — Netlify build config
  supabase-schema.sql — run this in Supabase once
  README.md
```

---

## Roadmap

- [ ] PDF and EPUB export (via Pandoc or jsPDF)
- [ ] Read-only gift link for when he turns 18
- [ ] Search entries by keyword
- [ ] Video playback improvements
- [ ] PWA / add to home screen support
