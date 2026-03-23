# RoCathon Hybrid Search Engine

A hybrid creator search engine built for **ReturnOnCreators RoCathon** using **TypeScript (Node.js)**, **PostgreSQL**, and **pgvector**.

This solution retrieves creators by **semantic relevance** and then re-ranks them using **projected business performance**, **GMV-aware penalties**, **audience fit**, and **category alignment boosts** so results better reflect both creator fit and commerce value.

---

## Table of Contents

- [Overview](#overview)
- [Challenge Requirements Covered](#challenge-requirements-covered)
- [Execution Plan](#execution-plan)
- [How the Solution Works](#how-the-solution-works)
- [How the Ranking Matches the Challenge Rules](#how-the-ranking-matches-the-challenge-rules)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Design](#database-design)
- [Environment Variables](#environment-variables)
- [Data Ingestion](#data-ingestion)
- [Embedding Modes](#embedding-modes)
- [Running Search](#running-search)
- [Required Output for `brand_smart_home`](#required-output-for-brand_smart_home)
- [Required API](#required-api)
- [Enhancements Added](#enhancements-added)
- [Edge Cases and Robustness Improvements](#edge-cases-and-robustness-improvements)
- [Sanity Check](#sanity-check)
- [Example End-to-End Runs](#example-end-to-end-runs)

---

## Overview

Brands do not just want creators who *sound* relevant. They want creators who are:

- contextually aligned with the search query
- commercially promising

Pure semantic search can produce false positives: creators who match the vibe but have weak business performance.

This project solves that with a **two-stage hybrid pipeline**:

1. **Vector retrieval** over creator context
2. **Business-aware reranking** using projected score, GMV-aware logic, audience fit, and category alignment

---

## Challenge Requirements Covered

### Required Tech Stack

This project uses:

- **TypeScript (Node.js)**
- **PostgreSQL**
- **pgvector**
- **Docker** for local setup

### Required API

The repo implements the required search interface in reusable form:

```ts
searchCreators(query: string, brandProfile: BrandProfile): Promise<RankedCreator[]>
```

Because the implementation uses database calls, the function is asynchronous and returns `Promise<RankedCreator[]>`.

### Deliverables Checklist

This repo addresses the requested deliverables:

- Git repo link
- README setup instructions
- DB ingest instructions
- Output JSON: `RankedCreator[]` for `brand_smart_home`
- Loom video (to be recorded separately)

---

## Execution Plan

Follow these steps in order to reproduce the results.

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL + pgvector in Docker

```bash
docker run --name rocathon-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=rocathon \
  -p 5433:5432 \
  -d pgvector/pgvector:pg17
```

### 3. Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

Then update `.env` with your own values.

### 4. Create the database schema

```bash
psql postgresql://postgres:postgres@localhost:5433/rocathon -f sql/schema.sql
```

### 5. Validate the dataset

```bash
npm run check-data
```

### 6. Ingest creators into PostgreSQL

```bash
npm run ingest
```

This loads creator data into:
- `creators_local`
- `creators_openai`

### 7. Choose one execution path

#### Option A: Local evaluator-friendly path

Generate local embeddings:

```bash
npm run embed-creators
```

Run sanity checks:

```bash
npm run sanity-check
```

Run search:

```bash
npm run search
```

Expected output files:

- `outputs/top10_brand_smart_home_affordable_home_decor.local.json`
- `outputs/top10_brand_smart_home_affordable_home_decor.local.<timestamp>.json`

#### Option B: OpenAI-powered path

Generate OpenAI embeddings:

```bash
npm run embed-creators-openai
```

Run search:

```bash
npm run search-openai
```

Expected output files:

- `outputs/top10_brand_smart_home_affordable_home_decor.openai.json`
- `outputs/top10_brand_smart_home_affordable_home_decor.openai.<timestamp>.json`

### Recommended evaluation path

For evaluators, the recommended path is:

1. `npm run ingest`
2. `npm run embed-creators`
3. `npm run sanity-check`
4. `npm run search`

This path is fully runnable without paid API usage and produces the required top-10 `brand_smart_home` output JSON.

---

## How the Solution Works

### 1. Ingestion

- Read `creators.json`
- Validate creator records
- Insert creator data into PostgreSQL

### 2. Embedding

Creator vectors are generated from:

- `bio`
- `content_style_tags`

This repo supports **two modes**:

- **Local mode**: evaluator-friendly, no paid API dependency
- **OpenAI mode**: optional higher-quality semantic retrieval

### 3. Retrieval

A natural-language query is embedded and the **top 50** creators are retrieved using **pgvector** similarity search.

Example retrieval pattern:

```sql
ORDER BY embedding <=> $1::vector
LIMIT 50
```

### 4. Re-ranking

The retrieved candidates are re-ranked using:

- `semantic_score`
- `projected_score`
- GMV-aware penalty
- category alignment boost
- audience-fit boost

Only the **top 10** final ranked creators are returned for submission.

---

## How the Ranking Matches the Challenge Rules

The challenge states:

> **High vibe / zero GMV must rank lower than good vibe / high GMV**  
> **Must use a vector DB approach (no linear scan)**

### Rule 1: Vector DB Approach

This is satisfied because:

- embeddings are stored in **PostgreSQL + pgvector**
- similarity retrieval is performed in SQL
- no TypeScript-side brute-force linear scan is used for candidate ranking

### Rule 2: High Vibe / Zero GMV Must Rank Lower

This is addressed by:

- hybrid reranking using `semantic_score` and `projected_score`
- a **strong penalty for zero GMV**
- a **smaller penalty for very low GMV**
- category alignment boosts to keep results on-theme
- audience boosts to better align creators with the target brand profile

Base hybrid formula:

```ts
const final_score =
  (semantic_score * 0.45) + ((projected_score / 100) * 0.55);
```

Then the system adjusts that score with:

- **GMV penalties**
- **category alignment boosts**
- **audience-fit boosts**

This keeps semantically relevant but commercially weak creators from dominating the final ranking.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript / Node.js |
| Database | PostgreSQL |
| Vector Search | pgvector |
| Local DB Runtime | Docker |
| Optional Semantic Upgrade | OpenAI embeddings |

---

## Project Structure

```text
.
├── data/
│   └── creators.json
├── outputs/
│   ├── top10_brand_smart_home_affordable_home_decor.local.json
│   ├── top10_brand_smart_home_affordable_home_decor.local.<timestamp>.json
│   ├── top10_brand_smart_home_affordable_home_decor.openai.json
│   └── top10_brand_smart_home_affordable_home_decor.openai.<timestamp>.json
├── sql/
│   └── schema.sql
├── src/
│   ├── checkData.ts
│   ├── embedCreators.ts
│   ├── embedCreatorsOpenAI.ts
│   ├── ingest.ts
│   ├── localEmbed.ts
│   ├── outputWriter.ts
│   ├── sanityCheck.ts
│   ├── search.ts
│   ├── searchOpenAI.ts
│   ├── searchCreators.ts
│   ├── searchCreatorsOpenAI.ts
│   └── types.ts
├── .env.example
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

---

## Database Design

The project uses two tables so both retrieval modes can coexist cleanly.

### `creators_local`

Used for:

- local embeddings
- default evaluator-friendly search path

### `creators_openai`

Used for:

- OpenAI embeddings
- optional higher-quality search path

This avoids overwriting embeddings when switching between local and OpenAI modes.

---

## Environment Variables

Copy the example file:

```bash
cp .env.example .env
```

Then update `.env` with your own values.

### Example `.env`

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5433/rocathon
OPENAI_API_KEY=your_openai_api_key_here
```

**Notes**
- `DATABASE_URL` is required
- `OPENAI_API_KEY` is only required for the optional OpenAI path
- never commit your real `.env` file

### OpenAI API Key and Billing

To use the optional OpenAI embedding/search path:

1. Sign in to the OpenAI API platform.
2. Select the correct **project**.
3. Go to **API Keys**.
4. Click **Create new secret key**.
5. Copy and store the key securely.

**Recommended key permissions**
- **Permission level:** `Restricted`
- **List models:** `Read`
- **Model capabilities:** `Write`
- **All other permissions:** `None`

**Billing notes**
- API billing is separate from ChatGPT subscriptions.
- Billing must be enabled for the **same project** where the key was created.
- New API users may need to add prepaid credits before the OpenAI path will work.
- There may be a short delay after adding credits before API usage becomes active.

**Practical note**
For initial troubleshooting, an **All** permission key may be easier to use. For a cleaner final setup, a **Restricted** key is recommended.

---

## Data Ingestion

### Validate the dataset

```bash
npm run check-data
```

### Load creators into PostgreSQL

```bash
npm run ingest
```

This inserts creator records into:
- `creators_local`
- `creators_openai`

---

## Embedding Modes

### Local Mode

Default evaluator-friendly mode.

Generate local embeddings:

```bash
npm run embed-creators
```

### OpenAI Mode

Optional higher-quality semantic mode.

Generate OpenAI embeddings:

```bash
npm run embed-creators-openai
```

---

## Running Search

### Local Search

```bash
npm run search
```

This writes:

- `outputs/top10_brand_smart_home_affordable_home_decor.local.json`
- `outputs/top10_brand_smart_home_affordable_home_decor.local.<timestamp>.json`

### OpenAI Search

```bash
npm run search-openai
```

This writes:

- `outputs/top10_brand_smart_home_affordable_home_decor.openai.json`
- `outputs/top10_brand_smart_home_affordable_home_decor.openai.<timestamp>.json`

---

## Required Output for `brand_smart_home`

The submission form asks for:

> a JSON file showing the **top 10** results for the example query  
> **"Affordable home decor for small apartments"**  
> using the **`brand_smart_home`** profile

This repo generates that deliverable in both modes.

### Local output

```text
outputs/top10_brand_smart_home_affordable_home_decor.local.json
```

### OpenAI output

```text
outputs/top10_brand_smart_home_affordable_home_decor.openai.json
```

The output shape is `RankedCreator[]` and each of the 10 objects includes:

- `username`
- `bio`
- `content_style_tags`
- `projected_score`
- `metrics`
- `scores`
- optional `match_reasons`

---

## Required API

The reusable search function is implemented as:

```ts
searchCreators(query: string, brandProfile: BrandProfile): Promise<RankedCreator[]>
```

### Brand profile used for submission

```ts
const brandProfile = {
  id: "brand_smart_home",
  industries: ["smart home", "home decor", "home organization"],
  target_audience: {
    gender: "FEMALE",
    age_ranges: ["18-24", "25-34", "35-44"]
  },
  gmv: 50000
};
```

### Submission query used in the search scripts

```text
Affordable home decor for small apartments
```

---

## Enhancements Added

After covering the core hackathon requirements, the following enhancements were added.

### GMV-Aware Penalty

To better enforce:

> high vibe / zero GMV must rank lower than good vibe / high GMV

the system applies:

- strong penalty for zero GMV
- moderate penalty for very low GMV
- no penalty for healthy GMV

### Category Alignment Boost

Creators receive an additional score boost when `content_style_tags` align with `brandProfile.industries`.

This helps category-specific results rank above broadly relevant but less on-theme creators.

### Audience-Fit Boost

The scorer also checks whether creator demographics overlap with the brand target audience.

This improves alignment to the provided `brand_smart_home` submission profile.

### Match Reasons

Each ranked creator includes `match_reasons`, such as:

- strong semantic relevance
- strong projected commerce score
- strong recent GMV performance
- industry alignment with the brand
- audience alignment with the brand target

### Dual Retrieval Modes

The repo includes:

- a no-cost evaluator-friendly local path
- an optional OpenAI-enhanced path

### Historical Output Files

Both search modes write:

- one stable “latest” output file
- one timestamped archive file per run

### Deterministic Tie-Breaking

When final scores are very close, ties are broken using:
1. higher `projected_score`
2. higher `total_gmv_30d`
3. alphabetical `username`

This keeps outputs stable and easier to evaluate.

---

## Edge Cases and Robustness Improvements

This implementation is designed to behave more reliably in real-world ranking situations and hidden evaluation cases.

### High Semantic Match, Weak Business Value

A creator may strongly match the query language but have poor or zero historical business performance.

**Handled by:**  
Re-ranking with `projected_score` weighting and GMV penalty logic.

### Good Business Value, Slightly Lower Semantic Similarity

A creator may be slightly less semantically aligned but much stronger commercially.

**Handled by:**  
Higher weighting for business performance in the final score.

### Category Mismatch

A creator may semantically match broad keywords but not actually belong to the target vertical.

**Handled by:**  
Category alignment boost only for creators whose tags or metadata match the intended domain.

### Overly Generic Queries

Broad queries can surface creators with vague relevance.

**Handled by:**  
Vector retrieval narrows candidates first, then business-aware ranking improves prioritization among the candidate set.

### Zero-GMV “Vibe Match” Creators

This is one of the most important hidden-test scenarios for the challenge.

**Handled by:**  
Explicit suppression logic so strong wording overlap does not automatically outrank economically stronger creators.

### Empty or Whitespace-Only Queries

A user may submit an empty string or a query containing only spaces.

**Handled by:**  
Input validation rejects empty queries before retrieval begins.

### No Strong Semantic Match in the Dataset

A query may ask for a niche creator type that is poorly represented in the dataset.

**Handled by:**  
The system still returns the best available vector matches without failing, while reranking keeps stronger commercial fits more competitive.

### Missing or Null Embeddings

Some rows may not yet have embeddings due to partial runs or interrupted processing.

**Handled by:**  
Search queries only retrieve rows where `embedding IS NOT NULL`.

### Partial Embedding Runs

An embedding process may stop midway due to API, permission, or quota issues.

**Handled by:**  
Embedding scripts can be rerun, and search paths only use rows that have valid embeddings.

### Malformed or Incomplete JSON Input

A dataset row may be missing required fields such as `username`, `bio`, `content_style_tags`, or numeric metrics.

**Handled by:**  
Validation is applied during ingestion, and invalid records are caught before database insert.

### Invalid Numeric Values

Metrics such as `projected_score`, `total_gmv_30d`, or `engagement_rate` may arrive in unexpected formats.

**Handled by:**  
Safe numeric parsing and validation are applied before scoring.

### Duplicate Creator Records

The dataset may contain repeated usernames or duplicate creator rows.

**Handled by:**  
Database upsert logic with `ON CONFLICT (username)` prevents duplicate creator entries.

### Very Close Final Scores

Two creators may produce nearly identical final scores.

**Handled by:**  
Deterministic tie-breaking is applied using:
1. higher `projected_score`
2. higher `total_gmv_30d`
3. alphabetical `username`

### Output File Overwrites

Running search multiple times can overwrite a single output file and make result comparison difficult.

**Handled by:**  
The system writes both:
- a stable latest output file
- timestamped historical archive files

### Separate Local and OpenAI Result Paths

Different retrieval modes can overwrite or mix outputs if not clearly separated.

**Handled by:**  
Local and OpenAI runs write to different output filenames, making comparisons easier and preventing accidental overwrites.

### Missing API Key or Incorrect API Permissions

The optional OpenAI path may fail due to missing keys, insufficient scopes, or project-level permission issues.

**Handled by:**  
Environment validation and explicit OpenAI error messaging are included to surface permission, quota, and authentication problems clearly.

---

## Sanity Check

Run:

```bash
npm run sanity-check
```

This verifies:

- total creator count
- embedding count
- missing usernames
- missing bios
- missing tags
- missing projected scores

---

## Example End-to-End Runs

### Local Path

```bash
psql postgresql://postgres:postgres@localhost:5433/rocathon -f sql/schema.sql
npm run ingest
npm run embed-creators
npm run sanity-check
npm run search
```

### OpenAI Path

```bash
psql postgresql://postgres:postgres@localhost:5433/rocathon -f sql/schema.sql
npm run ingest
npm run embed-creators-openai
npm run search-openai
```

---