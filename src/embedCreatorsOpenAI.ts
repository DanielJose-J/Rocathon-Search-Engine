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

async function main() {
  let result;
  try {
    result = await pool.query(`
      SELECT id, bio, content_style_tags
      FROM creators
      ORDER BY id
    `);
  } catch (error) {
    throw new Error(`Failed to fetch creators for OpenAI embedding: ${String(error)}`);
  }

  console.log(`Creators to embed with OpenAI: ${result.rows.length}`);

  if (result.rows.length === 0) {
    throw new Error("No creators found. Run ingestion first.");
  }

  let successCount = 0;

  for (const row of result.rows) {
    try {
      const text = buildCreatorEmbeddingText({
        bio: row.bio,
        content_style_tags: row.content_style_tags,
      });

      const response = await client.embeddings.create({
        model: MODEL,
        input: text,
      });

      const embedding = response.data[0].embedding;

      await pool.query(
        `
        UPDATE creators
        SET embedding = $1::vector
        WHERE id = $2
        `,
        [toPgVector(embedding), row.id]
      );

      successCount += 1;
      console.log(`OpenAI embedded creator id ${row.id}`);
    } catch (error) {
      throw new Error(`Failed OpenAI embedding for creator id ${row.id}: ${String(error)}`);
    }
  }

  const check = await pool.query(`
    SELECT COUNT(*) AS count
    FROM creators
    WHERE embedding IS NOT NULL
  `);

  console.log("Successfully OpenAI-embedded creators:", successCount);
  console.log("Creators with embeddings:", check.rows[0].count);

  await pool.end();
}

main().catch((err) => {
  console.error("OpenAI embedding failed:", err);
  process.exit(1);
});