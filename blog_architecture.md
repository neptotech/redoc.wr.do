# Blog Architecture — redoc.wr.do

## Constraints & Goals
- Hosted on **Vercel free tier** (no persistent filesystem, serverless only)
- Custom domain already set up
- **Private markdown** — no public GitHub commits for post content
- Write **frequently** and comfortably
- Same theme: particles bg, navbar, glassmorphism, accent colors
- Future **ad scripts** per post

---

## The Core Problem

Vercel free is serverless — no running Node process, no DB.  
You need **an external place to store your posts privately**, and a **Vercel serverless function** to proxy it so your API keys never hit the client.

---

## Recommended Stack: **Notion as CMS + Vercel API Routes**

### Why Notion?
- You already likely use it — write like you normally would
- Private by default (your workspace, not public)
- Accessible from phone, tablet, anywhere
- Free forever for personal use
- Supports inline images, code blocks, callouts — all map to markdown
- One database = your blog "table" with Title, Slug, Published date, Tags columns

### The Flow

```
You write in Notion
        ↓
Notion Database (private)
        ↓
Vercel Serverless Function  (/api/posts, /api/posts/[slug])
   — hides your Notion API token
   — converts Notion blocks → HTML/Markdown
        ↓
blog.html / blog-post.html
   — fetches from your own /api/* routes
   — renders with marked.js
   — same navbar, particles, CSS vars
```

### Everyday Writing Flow
1. Open your Notion workspace
2. Go to your **Blog Posts** database
3. Write a new page (Notion's editor = comfortable rich writing)
4. When ready → flip the **"Published"** toggle to ✅
5. It immediately appears on your live blog — zero deploy needed

---

## Alternative: Sanity CMS (if you want a purpose-built blog editor)

- **Sanity Studio** — a web UI you deploy once to `studio.yourdomain.com`
- Free tier: 500k API reads/month, plenty for a personal blog
- Better structured content (schema for title, slug, body, tags, SEO fields)
- Slightly more setup, but the editing experience is cleaner for long-form writing
- `@sanity/client` in a Vercel function proxies everything

**Pick Sanity if** you want a proper CMS feel.  
**Pick Notion if** you want to write where you already live.

---

## File Structure (minimal, keeps your site mostly static)

```
redoc.wr.do/
├── index.html          ← unchanged
├── style.css           ← unchanged (shared)
├── script.js           ← unchanged
├── blog/
│   ├── index.html      ← blog listing page (same theme)
│   └── post.html       ← single post renderer (same theme)
└── api/                ← Vercel serverless functions
    ├── posts.js        ← GET /api/posts  → list all published posts
    └── post.js         ← GET /api/post?slug=xyz  → single post content
```

> Vercel auto-detects the `/api` folder and deploys each file as a serverless function.  
> Your Notion/Sanity token lives in **Vercel environment variables** (Settings → Environment Variables) — never in your code.

---

## Blog Listing Page (`blog/index.html`)

Same boilerplate as `index.html`:
- Copy the `<head>`, particles div, navbar, theme toggle, custom cursor
- Content area: fetches `GET /api/posts`, renders cards with title + date + tags
- Each card links to `blog/post.html?slug=your-post-slug`

## Blog Post Page (`blog/post.html`)

- Same boilerplate
- Reads `?slug=` from URL
- Fetches `GET /api/post?slug=...`
- Renders markdown → HTML using **marked.js** (already in your CDN stack)
- Ad script slots go here — e.g. before/after post body `<div id="ad-top">`, `<div id="ad-bottom">`

---

## SEO — Important on Vercel Free

Vercel free can't do true SSR for dynamic HTML meta tags (that needs a framework).  
Two clean options:

| Option | What it means |
|--------|---------------|
| **Accept static meta** | blog/post.html has generic meta, content is JS-rendered. Fine for most personal blogs. |
| **Migrate to Next.js** | Full SSR/SSG, dynamic `<title>` and `<meta>` per post, much better for SEO long-term. Migration is ~1 day. |

> **Recommendation:** Start with plain HTML for now (fast to build), migrate to Next.js when you have enough posts and want SEO juice.

---

## Ads Integration (Later)

Since `post.html` is your template, you add ad slots once:

```html
<!-- Top ad -->
<div id="ad-slot-top" class="ad-container"></div>

<!-- ...post content... -->

<!-- Bottom ad -->
<div id="ad-slot-bottom" class="ad-container"></div>
```

Then your ad script (Google AdSense, Carbon, etc.) targets those IDs.  
You control which posts show ads via a flag in Notion/Sanity (e.g. `show_ads: true`).

---

## Setup Checklist (Notion path)

- [ ] Create a **Notion integration** at notion.so/my-integrations → get secret token
- [ ] Create a **Blog Posts database** in Notion with columns: Title, Slug, Published (checkbox), Date, Tags
- [ ] Share the database with your integration
- [ ] Add `NOTION_TOKEN` and `NOTION_DB_ID` to Vercel Environment Variables
- [ ] Install `@notionhq/client` and `notion-to-md` in your repo (`npm init` if needed)
- [ ] Write `api/posts.js` and `api/post.js` serverless functions
- [ ] Build `blog/index.html` and `blog/post.html` with the shared theme
- [ ] Add `"Thoughts & Ramblings"` nav link in your main navbar pointing to `/blog`

---

## Quick Reality Check

| Thing | Status |
|-------|--------|
| Vercel free supports API routes? | ✅ Yes, up to 100GB-hrs/month |
| Notion API free? | ✅ Yes, no cost |
| Private posts? | ✅ Only published=true are served |
| Ad scripts? | ✅ You control the template |
| Git repo stays clean? | ✅ Posts live in Notion, not your repo |
| Need a framework? | ❌ Not yet — plain HTML works fine to start |
