# flowstate

Flowstate is adaptive LSAT prep. You learn by doing. The platform finds your exact weaknesses, feeds you questions at the right difficulty, and walks you through mistakes with a Socratic tutor that guides instead of giving answers.

## How it works

Adaptive questions. Every question is tagged by section, subtype, and difficulty. The app tracks your accuracy across each subtype and picks a target subtype and difficulty for your next question, so practice concentrates where you lose the most points. When it runs out of unseen questions at the right level, it generates a new one with an AI model and checks the generated question with a blind solve before showing it to you.

Score prediction. Your predicted score comes from a rolling window of recent performance, weighted by difficulty, mapped onto the LSAT scale.

Socratic tutor. When you miss a question, the tutor talks through your reasoning and nudges you toward the right answer without telling you what it is. It can unlock the next question once the conversation reaches a good stopping point.

## Getting started

You need Node and Postgres.

Install dependencies.

`npm install`

Set up a `.env` file with your database URL, Google OAuth credentials, Stripe key, and LLM provider key.

Push the schema.

`npm run db:push`

Seed the database with sample questions. Put your seed data in data/lsat_data.json and data/lessons.json first.

`npm run db:seed`

Start the dev server.

`npm run dev`

## Project layout

```
src/
  routes/    pages and API handlers
  lib/       shared code, including the LSAT helpers
  seed.js    database seeding
.framework/  the routing, server, and database framework
```

## Stack

Node with vanilla JavaScript, Postgres, the Vercel AI SDK for the tutor and question generation, and Stripe for subscriptions. No build step and no frontend framework.

## Content

Seed data lives in data/lsat_data.json and data/lessons.json. Seed data is local only and not tracked in the repo.
