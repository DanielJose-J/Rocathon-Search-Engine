import dotenv from "dotenv";
import { Pool } from "pg";
import {
  buildCreatorText,
  embedTextLocal,
  toPgVector,
} from "./localEmbed";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL in .env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const EMBED_DIMS = 256;

function isZeroVector(vec: number[]): boolean {
  return vec.every((v) => v === 0);
}

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
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
    throw new Error(`Failed to fetch creators for embedding: ${String(error)}`);
  }

  console.log(`Creators to embed: ${result.rows.length}`);

  if (result.rows.length === 0) {
    throw new Error("No creators found to embed. Run ingestion first.");
  }

  let successCount = 0;

  for (const row of result.rows) {
    try {
      const bio = typeof row.bio === "string" ? row.bio : "";
      const tags = ensureStringArray(row.content_style_tags);

      const text = buildCreatorText({
        bio,
        content_style_tags: tags,
      });

      const embedding = embedTextLocal(text, EMBED_DIMS);

      if (embedding.length !== EMBED_DIMS) {
        throw new Error(
          `Embedding dimension mismatch for creator id ${row.id}. Expected ${EMBED_DIMS}, got ${embedding.length}`
        );
      }

      if (isZeroVector(embedding)) {
        throw new Error(`Zero vector generated for creator id ${row.id}`);
      }

      await pool.query(
        `
        UPDATE creators
        SET embedding = $1::vector
        WHERE id = $2
        `,
        [toPgVector(embedding), row.id]
      );

      successCount += 1;
      console.log(`Embedded creator id ${row.id}`);
    } catch (error) {
      throw new Error(`Failed embedding creator id ${row.id}: ${String(error)}`);
    }
  }

  const check = await pool.query(`
    SELECT COUNT(*) AS count
    FROM creators
    WHERE embedding IS NOT NULL
  `);

  console.log("Successfully embedded creators:", successCount);
  console.log("Creators with embeddings:", check.rows[0].count);

  await pool.end();
}

main().catch((err) => {
  console.error("Local embedding failed:", err);
  process.exit(1);
});