import dotenv from "dotenv";
import OpenAI from "openai";
import { Pool } from "pg";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL in .env");
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY in .env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "text-embedding-3-small";
const MAX_RETRIES = 3;

function toPgVector(vec: number[]): string {
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error("Cannot convert empty vector to pgvector format.");
  }

  if (vec.some((v) => typeof v !== "number" || Number.isNaN(v))) {
    throw new Error("Vector contains invalid numeric values.");
  }

  return `[${vec.join(",")}]`;
}

function buildCreatorEmbeddingText(input: {
  bio: string;
  content_style_tags: string[];
}): string {
  const bio = typeof input.bio === "string" ? input.bio : "";
  const tags = Array.isArray(input.content_style_tags)
    ? input.content_style_tags
    : [];

  return `Bio: ${bio}\nTags: ${tags.join(", ")}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOpenAIErrorMessage(error: any): string {
  const status = error?.status;
  const message = error?.error?.message || error?.message || "Unknown OpenAI error";

  if (status === 401) {
    return `OpenAI authentication/permission error: ${message}`;
  }

  if (status === 429) {
    return `OpenAI quota or rate limit error: ${message}`;
  }

  if (status >= 500) {
    return `OpenAI server error: ${message}`;
  }

  return `OpenAI request failed: ${message}`;
}

function isRetryableOpenAIError(error: any): boolean {
  const status = error?.status;
  return status === 429 || (status >= 500 && status < 600);
}

async function createEmbeddingWithRetry(input: string): Promise<number[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.embeddings.create({
        model: MODEL,
        input,
      });

      return response.data[0].embedding;
    } catch (error) {
      lastError = error;

      if (!isRetryableOpenAIError(error) || attempt === MAX_RETRIES) {
        throw new Error(getOpenAIErrorMessage(error));
      }

      const backoffMs = attempt * 1500;
      console.warn(
        `Embedding request failed on attempt ${attempt}. Retrying in ${backoffMs} ms...`
      );
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

async function main() {
  let result;
  try {
    result = await pool.query(`
      SELECT id, bio, content_style_tags
      FROM creators_openai
      WHERE embedding IS NULL
      ORDER BY id
    `);
  } catch (error) {
    throw new Error(`Failed to fetch OpenAI creators for embedding: ${String(error)}`);
  }

  console.log(`Creators to embed with OpenAI: ${result.rows.length}`);

  if (result.rows.length === 0) {
    throw new Error("No creators found in creators_openai requiring embeddings.");
  }

  let successCount = 0;
  const failedIds: number[] = [];

  for (const row of result.rows) {
    try {
      const text = buildCreatorEmbeddingText({
        bio: row.bio,
        content_style_tags: row.content_style_tags,
      });

      const embedding = await createEmbeddingWithRetry(text);

      await pool.query(
        `
        UPDATE creators_openai
        SET embedding = $1::vector
        WHERE id = $2
        `,
        [toPgVector(embedding), row.id]
      );

      successCount += 1;
      console.log(`OpenAI embedded creator id ${row.id}`);
    } catch (error) {
      failedIds.push(row.id);
      console.error(`Failed OpenAI embedding for creator id ${row.id}: ${String(error)}`);
    }
  }

  const check = await pool.query(`
    SELECT COUNT(*) AS count
    FROM creators_openai
    WHERE embedding IS NOT NULL
  `);

  console.log("Successfully OpenAI-embedded creators:", successCount);
  console.log("OpenAI creators with embeddings:", check.rows[0].count);

  if (failedIds.length > 0) {
    console.warn("Creators that failed OpenAI embedding:", failedIds.join(", "));
    process.exitCode = 1;
  }

  await pool.end();
}

main().catch((err) => {
  console.error("OpenAI embedding failed:", err);
  process.exit(1);
});