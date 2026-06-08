# Quick Start Guide

Get your Daily Briefing System up and running in 5 minutes.

## Prerequisites

- Bun installed
- OpenAI API key
- Vercel account (optional for local dev)

## 5-Minute Setup

### 1. Install Dependencies (30 seconds)

```bash
cd daily-briefing
bun install
```

### 2. Configure Environment (1 minute)

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:
```env
OPENAI_API_KEY=sk-your-key-here
CRON_SECRET=any-random-string
# KV vars optional for initial testing
```

### 3. Start Dev Server (10 seconds)

```bash
bun run dev
```

### 4. Add Sources (2 minutes)

Open http://localhost:3000/sources

Add a few sources:
- **TechCrunch**: `https://techcrunch.com/feed/`
- **Hacker News**: `https://news.ycombinator.com/rss`
- **The Verge**: `https://www.theverge.com/rss/index.xml`

### 5. Generate First Briefing (1 minute)

```bash
curl -X POST http://localhost:3000/api/cron/aggregate
```

Visit http://localhost:3000/briefing

**Done!** 🎉

## What You Get

✅ **Dashboard** - Topic clusters + individual articles
✅ **AI Summaries** - GPT-4o summarizes everything
✅ **Chat** - Ask questions about today's content
✅ **Source Management** - Easy add/remove/configure

## Next Steps

1. Add more sources you care about
2. Try the chat feature (click 💬 button)
3. Deploy to Vercel (see README.md)
4. Set up daily cron job (automatic at 8 AM)

## Common Commands

```bash
# Start dev server
bun run dev

# Manually trigger aggregation
curl -X POST http://localhost:3000/api/cron/aggregate

# Deploy to Vercel
vercel
vercel --prod
```

## Troubleshooting

**No briefing showing?**
→ Add sources first, then trigger aggregation

**Chat not working?**
→ Check your OPENAI_API_KEY in .env.local

**Source not fetching?**
→ Verify the URL is a valid RSS feed

## Need Help?

See the full documentation:
- `README.md` - Complete guide
- `SETUP.md` - Detailed setup instructions
- PRD in `/scratchpad/` - Full system design

---

**Enjoy your personalized daily briefing!** ☕️📰
