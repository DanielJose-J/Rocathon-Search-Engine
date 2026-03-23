# RoCathon Hybrid Search Engine

A hybrid creator search engine built for the **ReturnOnCreators RoCathon** using **TypeScript (Node.js)**, **PostgreSQL**, and **pgvector**.

This project retrieves creators using **semantic similarity search** and then re-ranks them using **projected business performance**, ensuring strong contextual relevance is balanced with commercial value.

---

## Overview

The goal of this project is to build a **vector-based creator search system** that retrieves and ranks creators not only by semantic relevance, but also by their projected ability to drive business outcomes.

Instead of relying on pure embedding similarity alone, this implementation combines:

- **Vector retrieval** for contextual relevance
- **Commerce-aware re-ranking** for business alignment
- **Category alignment signals** for improved brand fit

This directly addresses the challenge expectation that:

> **High vibe / zero GMV should rank lower than good vibe / high GMV**

---

## Challenge Requirements Addressed

### Tech Stack

This project uses:

- **TypeScript (Node.js)**
- **PostgreSQL**
- **pgvector**
- **Docker** for local database setup

### Required API

This repository implements the required interface:

```ts
searchCreators(query: string, brandProfile: BrandProfile): Promise<RankedCreator[]>
```

Because the implementation interacts with the database, the function is asynchronous and returns a `Promise<RankedCreator[]>`.

### Deliverables Checklist

This repository addresses the requested deliverables:

- Git repo link
- README setup instructions
- DB ingest instructions
- Output JSON: `RankedCreator[]` for `brand_smart_home` profile

---

## Business Problem

Brands do not just want creators who sound relevant semantically. They want creators who are:

- **Contextually aligned** with the search intent
- **Commercially promising** based on performance-related signals

A pure semantic search system can produce false positives by ranking creators who match the wording of the query but have weak business value.

This project solves that problem by combining:

- **Vector retrieval** over creator context
- **Business-aware re-ranking** using `projected_score`
- **GMV-sensitive scoring adjustments**
- **Category alignment boosts**

---

## Solution Overview

### 1. Retrieval Layer

Creator embeddings are generated from:

- `bio`
- `content_style_tags`

The search query is embedded and used to retrieve the top candidate creators through **pgvector similarity search**.

Example retrieval pattern:

ORDER BY embedding <=> $1::vector
LIMIT 50

This satisfies the challenge requirement to use a **vector database approach** and avoids performing a full linear scan in application code.

### 2. Ranking Layer

The retrieved creators are re-ranked using a hybrid scoring approach based on:

- `semantic_score`
- `projected_score`
- GMV-aware penalties
- Category alignment boosts

This ensures the final ranking is not only semantically relevant, but also aligned with likely business outcomes.

## Ranking Strategy

The challenge expects ranking behavior where:

> **High vibe / zero GMV ranks lower than good vibe / high GMV**

This solution explicitly addresses that requirement.

### Base Hybrid Score

'''ts
final_score = (semantic_score * 0.45) + ((projected_score / 100) * 0.55)'''

### Additional Scoring Logic

After the base hybrid score is calculated, the system applies:

- **GMV penalty** for creators with zero or very low GMV
- **Category alignment boost** for creators whose tags match the target brand profile

### Why This Matters

This prevents semantically strong but commercially weak creators from consistently outranking creators who are slightly less semantically aligned but significantly stronger from a business perspective.

### Vector DB Requirement

This implementation satisfies the vector database constraint because:

- Embeddings are stored in **PostgreSQL + pgvector**
- Retrieval happens through **vector similarity SQL**
- No TypeScript-side linear scan is used to find candidates

### Project Structure

.
├── data/
│   └── creators.json
├── outputs/
│   ├── output.brand_smart_home.local.json
│   ├── output.brand_smart_home.local.<timestamp>.json
│   ├── output.brand_smart_home.openai.json
│   └── output.brand_smart_home.openai.<timestamp>.json
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
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md


## Database Design

This project uses two tables:

### `creators_local`

- Stores creator metadata
- Stores locally generated embeddings
- Used for the standard local evaluation workflow

### `creators_openai`

- Stores creator metadata
- Stores OpenAI-generated embeddings
- Supports the optional higher-quality semantic retrieval path

This separation allows both retrieval modes to coexist cleanly without overwriting one another.

## Example Full Run

### Local Path

```bash
npm install
docker run --name rocathon-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=rocathon \
  -p 5433:5432 \
  -d pgvector/pgvector:pg17

psql postgresql://postgres:postgres@localhost:5433/rocathon -f sql/schema.sql
npx ts-node src/checkData.ts
npx ts-node src/ingest.ts
npx ts-node src/embedCreators.ts
npx ts-node src/search.ts
```

### OpenAI Path

```bash
npm install
docker run --name rocathon-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=rocathon \
  -p 5433:5432 \
  -d pgvector/pgvector:pg17

psql postgresql://postgres:postgres@localhost:5433/rocathon -f sql/schema.sql
npx ts-node src/checkData.ts
npx ts-node src/ingest.ts
npx ts-node src/embedCreatorsOpenAI.ts
npx ts-node src/searchOpenAI.ts
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install```

### 2. Start PostgreSQL + pgvector in Docker

```bash
docker run --name rocathon-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=rocathon \
  -p 5433:5432 \
  -d pgvector/pgvector:pg17```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/rocathon
OPENAI_API_KEY=your_openai_api_key_here```

`OPENAI_API_KEY` is optional if you are only using the local embedding path.

### 4. Create Database Schema

```bash
psql postgresql://postgres:postgres@localhost:5433/rocathon -f sql/schema.sql```

## Database Ingest Instructions

### 1. Validate Source Data

```bash
npx ts-node src/checkData.ts
```

This checks whether the creator dataset is well-formed before ingestion.

### 2. Ingest Creator Records

```bash
npx ts-node src/ingest.ts
```

This loads creator metadata into PostgreSQL.

### 3. Generate and Store Embeddings

For local embeddings:

```bash
npx ts-node src/embedCreators.ts
```

For OpenAI embeddings:

```bash
npx ts-node src/embedCreatorsOpenAI.ts
```

After this step, the creator records are ready for vector search.

## Search Execution

### Local Embedding Path

Run the local search flow:

```bash
npx ts-node src/search.ts
```

Or call the main function from code:

```ts
import { searchCreators } from "./src/searchCreators";

const results = await searchCreators("smart home gadgets", brandProfile);
console.log(results);
```

### OpenAI Embedding Path

If you want to use OpenAI embeddings for potentially better semantic matching:

```bash
npx ts-node src/searchOpenAI.ts
```

Or:

```ts
import { searchCreatorsOpenAI } from "./src/searchCreatorsOpenAI";

const results = await searchCreatorsOpenAI("smart home gadgets", brandProfile);
console.log(results);
```

---

## Output JSON for `brand_smart_home`

The final output is written in `RankedCreator[]` format.

Example output shape:

```json
[
  {
    "creator_id": "c_001",
    "handle": "@smarthomeliving",
    "semantic_score": 0.8421,
    "projected_score": 87,
    "final_score": 0.8549
  },
  {
    "creator_id": "c_014",
    "handle": "@techwithmaya",
    "semantic_score": 0.8012,
    "projected_score": 91,
    "final_score": 0.8615
  }
]
```

Generated files are written to the `outputs/` directory, including timestamped variants for reproducibility.

---

## Brand Profile Used

Example `brand_smart_home` profile:

```ts
const brand_smart_home = {
  brand_name: "SmartHome Co",
  categories: ["smart home", "home automation", "consumer tech"],
  preferred_content_styles: ["educational", "demo-driven", "practical"],
  target_keywords: ["smart home gadgets", "automation", "connected devices"]
};
```

This profile is used during re-ranking to apply category-aware alignment boosts.

---

## Enhancements Beyond the Minimum Requirements

In addition to the core challenge requirements, this project includes several quality improvements:

### 1. Hybrid Ranking Instead of Pure Similarity

Rather than ranking creators only by embedding distance, the system combines:

- Semantic relevance
- Projected business performance
- Business-alignment heuristics

### 2. Category Alignment Boost

Creators with content tags that align closely with the brand’s target category receive a controlled ranking boost.

### 3. GMV-Aware Suppression

Creators with very weak business history, especially zero GMV, are prevented from dominating the ranking purely because they sound semantically relevant.

### 4. Separate Local and OpenAI Embedding Paths

This allows:

- A fully local, reproducible version
- An optional higher-quality semantic retrieval path

### 5. Timestamped Output Snapshots

Search results are saved with stable and timestamped output files for easier testing, comparison, and submission review.

---

## Edge Cases and Robustness Improvements

This implementation is designed to behave more reliably in real-world ranking situations and under hidden evaluation cases.

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

### Very Short or Underspecified Queries

Queries such as `"home"` or `"tech"` may be too broad to represent clear intent.

**Handled by:**  
The system still retrieves candidates, but hybrid reranking and category alignment help reduce weak broad matches.

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

### Broad Semantic Match but Weak Domain Fit

A creator may match general lifestyle or home language but not the intended commercial subcategory, such as true smart-home product review content.

**Handled by:**  
Category alignment boost improves ranking for on-theme creators while limiting broad but weakly aligned matches.

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

You can run a quick validation script to verify the ranking behavior:

```bash
npx ts-node src/sanityCheck.ts
```

This is useful for confirming that:

- Ranking output is returned in the expected format
- Higher-value creators are appropriately prioritized
- The scoring logic behaves as intended for edge cases

---

## Optional OpenAI API Key Settings

If you want to use the OpenAI-based embedding path, set:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

If no API key is provided, you can still run the local embedding flow successfully.

This makes the project flexible for both:

- Evaluator environments, where local reproducibility matters most
- Improved semantic retrieval experiments, where OpenAI embeddings may help

---

## Repository Link

```md
[GitHub Repository](https://github.com/DanielJose-J/Rocathon-Search-Engine)
```

