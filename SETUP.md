# Setup Guide for Daily Briefing System

This guide walks you through setting up the Daily Briefing System from scratch.

## Prerequisites

Before you begin, ensure you have:

- [ ] Bun installed (v1.0 or later)
- [ ] A Vercel account (free tier is fine)
- [ ] An OpenAI API key with GPT-4o access
- [ ] Git installed

## Step 1: Install Bun

If you don't have Bun installed:

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify installation:

```bash
bun --version
```

## Step 2: Install Dependencies

Navigate to the project directory and install dependencies:

```bash
cd daily-briefing
bun install
```

This will install all required packages including:
- Next.js 15
- OpenAI SDK
- Vercel KV client
- RSS parser
- Readability.js
- And more...

## Step 3: Set Up Environment Variables

1. **Copy the example file:**

   ```bash
   cp .env.local.example .env.local
   ```

2. **Edit `.env.local` and add your credentials:**

   ```env
   # Vercel KV - Get these from Step 4
   KV_REST_API_URL=your_kv_url_here
   KV_REST_API_TOKEN=your_kv_token_here

   # OpenAI API Key
   OPENAI_API_KEY=sk-your-openai-key-here

   # Cron Secret (generate a random string)
   CRON_SECRET=your-secure-random-string-here
   ```

3. **Generate CRON_SECRET:**

   ```bash
   openssl rand -hex 32
   ```

   Or use any random string generator.

## Step 4: Set Up Vercel KV (Local Development)

For local development, you have two options:

### Option A: Use Vercel KV with Local Tunneling

1. Create a Vercel account at https://vercel.com
2. Install Vercel CLI:

   ```bash
   bun add -g vercel
   ```

3. Link your project:

   ```bash
   vercel link
   ```

4. Create a KV database in Vercel dashboard:
   - Go to https://vercel.com/dashboard
   - Navigate to Storage → Create Database → KV
   - Copy the connection details

5. Pull environment variables:

   ```bash
   vercel env pull .env.local
   ```

### Option B: Use Mock KV for Development

You can develop without Vercel KV initially by using in-memory storage (for testing only).

## Step 5: Get OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy it to `.env.local`

**Cost Warning:** Make sure you have billing set up. GPT-4o costs approximately:
- $2.50 per 1M input tokens
- $10.00 per 1M output tokens

For this use case, expect ~$5-10/month for 20-30 articles/day.

## Step 6: Add Your First Sources

You have two options:

### Option A: Use UI (Recommended)

1. Start the dev server (Step 7)
2. Navigate to http://localhost:3000/sources
3. Click "Add Source"
4. Add sources one by one

### Option B: Manually Initialize Sources

Create a setup script:

```typescript
// scripts/init-sources.ts
import { addSource } from './lib/kv';

const initialSources = [
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    authority: 85,
  },
  {
    name: 'Hacker News',
    url: 'https://news.ycombinator.com/rss',
    authority: 80,
  },
  // Add more...
];

for (const source of initialSources) {
  await addSource({
    id: nanoid(),
    ...source,
    type: 'rss',
    isActive: true,
    createdAt: new Date().toISOString(),
  });
}
```

## Step 7: Run Development Server

Start the Next.js development server:

```bash
bun run dev
```

Open http://localhost:3000 in your browser.

You should see:
- Landing page with links to "View Today's Briefing" and "Manage Sources"

## Step 8: Test Content Aggregation

### Manual Test

1. Add at least one source via http://localhost:3000/sources
2. Trigger aggregation manually:

   ```bash
   curl -X POST http://localhost:3000/api/cron/aggregate
   ```

3. Check the response for errors
4. Visit http://localhost:3000/briefing to see results

### Expected Results

You should see:
- Topic clusters (if multiple sources covered the same story)
- Individual articles
- Article counts and statistics

## Step 9: Test Chat Functionality

1. Go to http://localhost:3000/briefing
2. Click the search bar or floating chat button
3. Ask a question like "What's happening today?"
4. Verify the AI responds with relevant information

## Step 10: Deploy to Vercel

### First Deployment

1. **Login to Vercel:**

   ```bash
   vercel login
   ```

2. **Deploy:**

   ```bash
   vercel
   ```

   Follow the prompts to create a new project.

3. **Set Environment Variables in Vercel Dashboard:**

   - Go to your project settings
   - Navigate to Environment Variables
   - Add all variables from `.env.local`:
     - `KV_REST_API_URL`
     - `KV_REST_API_TOKEN`
     - `OPENAI_API_KEY`
     - `CRON_SECRET`

4. **Create Vercel KV Database (if not done):**

   - In Vercel dashboard, go to Storage
   - Create a new KV database
   - Link it to your project
   - Copy the environment variables

5. **Deploy to Production:**

   ```bash
   vercel --prod
   ```

### Verify Cron Job

1. Go to Vercel dashboard → Your Project → Cron Jobs
2. Verify that `/api/cron/aggregate` is scheduled for "0 8 * * *" (8 AM daily)
3. Manually trigger it to test:
   - Click "Invoke Function"
   - Check logs for errors

## Step 11: Configure Cron Schedule (Optional)

The default schedule is 8:00 AM UTC. To change it:

1. Edit `vercel.json`:

   ```json
   {
     "crons": [
       {
         "path": "/api/cron/aggregate",
         "schedule": "0 9 * * *"  // 9 AM UTC
       }
     ]
   }
   ```

2. Redeploy:

   ```bash
   vercel --prod
   ```

Schedule format uses standard cron syntax:
- `0 8 * * *` = 8:00 AM UTC every day
- `0 */6 * * *` = Every 6 hours
- `0 0 * * 0` = Sunday at midnight

## Troubleshooting

### Error: "No active sources configured"

**Solution:** Add sources via `/sources` page

### Error: "Failed to fetch briefing"

**Possible causes:**
1. Cron hasn't run yet → Trigger manually
2. All sources failed to fetch → Check source URLs
3. KV connection issue → Verify KV environment variables

### Error: "OpenAI API error"

**Possible causes:**
1. Invalid API key → Check `.env.local`
2. Insufficient quota → Check OpenAI billing
3. Rate limit → Wait and retry

### Vercel Deployment Issues

**"Cron job not showing up":**
1. Verify `vercel.json` exists in project root
2. Redeploy after adding `vercel.json`
3. Check Vercel dashboard → Cron Jobs tab

**"Environment variables not working":**
1. Make sure variables are added in Vercel dashboard
2. Redeploy after adding environment variables
3. Use Production environment, not Preview

## Next Steps

After successful setup:

1. [ ] Add 5-10 sources you want to track
2. [ ] Test the aggregation and verify clustering works
3. [ ] Try the chat feature with different queries
4. [ ] Wait for the next scheduled cron run (or trigger manually)
5. [ ] Monitor OpenAI API costs in the first week

## Recommended Sources to Start With

Here are some good sources for tech/news:

**Tech News:**
- TechCrunch: `https://techcrunch.com/feed/`
- The Verge: `https://www.theverge.com/rss/index.xml`
- Ars Technica: `https://feeds.arstechnica.com/arstechnica/index`
- Hacker News: `https://news.ycombinator.com/rss`

**General News:**
- NYT Technology: `https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml`
- BBC Technology: `http://feeds.bbci.co.uk/news/technology/rss.xml`

**Developer Focused:**
- Dev.to: `https://dev.to/feed`
- CSS-Tricks: `https://css-tricks.com/feed/`

**AI/ML:**
- OpenAI Blog: `https://openai.com/blog/rss.xml`

## Support

If you encounter issues:

1. Check the README.md
2. Review Vercel deployment logs
3. Check browser console for frontend errors
4. Verify all environment variables are set correctly

## Cost Monitoring

Keep an eye on costs:

1. **OpenAI Dashboard:** https://platform.openai.com/usage
   - Monitor daily API usage
   - Set usage limits if needed

2. **Vercel Dashboard:**
   - Check function execution time
   - Monitor bandwidth usage
   - Verify KV storage usage (should stay under 256MB)

Expected monthly costs:
- Vercel: $0 (free tier)
- OpenAI: $5-10 (for ~30 articles/day)

---

**You're all set! Enjoy your personalized daily briefing system.** 🎉
