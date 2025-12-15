# Daily Briefing System

A personalized content aggregator that saves you hours every day by intelligently aggregating, deduplicating, summarizing, and enabling interactive exploration of content from your trusted sources.

## Features

✨ **Intelligent Aggregation**: Fetches content from RSS feeds and websites
🔍 **Smart Deduplication**: Groups similar articles into topic clusters using text similarity
🤖 **AI Summarization**: GPT-4o generates concise summaries for clusters and articles
💬 **Interactive Chat**: Ask questions about today's content (both high-level and article-specific)
⚙️ **Configurable Sources**: Easy-to-use UI for managing content sources
🚀 **Serverless**: Runs entirely on Vercel's free tier

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Runtime**: Bun
- **Database**: Vercel KV (Redis)
- **AI**: OpenAI GPT-4o
- **Styling**: Tailwind CSS
- **Deployment**: Vercel

## Quick Start

### Prerequisites

- Bun installed (`curl -fsSL https://bun.sh/install | bash`)
- Vercel account (free tier)
- OpenAI API key

### Installation

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.local.example .env.local
   ```

   Edit `.env.local` and add your keys:
   ```env
   KV_REST_API_URL=your_kv_url_here
   KV_REST_API_TOKEN=your_kv_token_here
   OPENAI_API_KEY=your_openai_api_key_here
   CRON_SECRET=your_secure_random_string_here
   ```

3. **Run development server:**
   ```bash
   bun run dev
   ```

4. **Open in browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Configuration

### Adding Content Sources

The system supports both **RSS feeds** and **regular website URLs**.

#### Via UI (Recommended)

1. Navigate to `/sources` in your browser
2. Click "Add Source"
3. Fill in:
   - **Name**: Display name (e.g., "TechCrunch")
   - **URL**: Feed URL or website URL
   - **Authority**: 0-100 (higher = preferred for cluster representatives)
4. Click "Add Source"

The system automatically detects whether the URL is:
- **RSS/Atom feed** (e.g., `https://techcrunch.com/feed/`)
- **HTML webpage** (e.g., `https://techcrunch.com`)

#### Example Sources

| Source | URL Type | URL |
|--------|----------|-----|
| TechCrunch | RSS | `https://techcrunch.com/feed/` |
| Hacker News | RSS | `https://news.ycombinator.com/rss` |
| The Verge | RSS | `https://www.theverge.com/rss/index.xml` |
| Ars Technica | RSS | `https://feeds.arstechnica.com/arstechnica/index` |

#### Authority Levels

- **80-100**: Tier 1 sources (established publications)
- **50-79**: Tier 2 sources (medium-sized publications)
- **0-49**: Tier 3 sources (personal blogs, niche sites)

## Usage

### Daily Workflow

1. **Morning**: Visit `/briefing` to see your daily briefing
2. **Explore**: Click clusters to expand, read articles, or ask questions
3. **Chat**: Use natural language to explore content

### Chat Capabilities

The system supports **both**:

**High-Level Questions:**
- "What's happening in AI today?"
- "Summarize the main topics"

**Article-Specific Questions:**
- "Tell me more about the AI regulation article"
- "Compare different perspectives on this topic"

## Deployment to Vercel

1. **Install Vercel CLI:**
   ```bash
   bun add -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel
   ```

3. **Set up Vercel KV:**
   - Create KV database in Vercel dashboard
   - Add environment variables to Vercel project

4. **Configure Cron:**
   Create `vercel.json`:
   ```json
   {
     "crons": [{
       "path": "/api/cron/aggregate",
       "schedule": "0 8 * * *"
     }]
   }
   ```

5. **Deploy to production:**
   ```bash
   vercel --prod
   ```

## Cost Estimate

For personal use (20-30 articles/day):

- Vercel Hosting: **FREE**
- Vercel KV: **FREE**
- OpenAI API: **~$5-10/month**

**Total: ~$5-10/month**

## Project Structure

```
daily-briefing/
├── app/              # Next.js 15 App Router
│   ├── api/          # API routes
│   ├── briefing/     # Dashboard page
│   └── sources/      # Source management
├── components/       # React components
├── lib/             # Core business logic
│   ├── services/    # Aggregation, clustering, summarization
│   └── utils/       # Helper functions
└── README.md
```

## Troubleshooting

### No Briefing Available
- Click "Generate Briefing Now"
- Check if sources are configured

### Source Not Fetching
- Verify URL is accessible
- Check source's `lastFetchedAt` timestamp

### Chat Not Responding
- Verify `OPENAI_API_KEY` is correct
- Check OpenAI API quota

## License

MIT License

---

**Built with ❤️ using Next.js 15, Vercel, and OpenAI GPT-4o**
