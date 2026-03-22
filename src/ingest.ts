import { promises as fs } from "fs";
import path from "path";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL in .env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

type Creator = {
  username: string;
  bio: string;
  content_style_tags: string[];
  projected_score: number;
  metrics: {
    follower_count: number;
    total_gmv_30d: number;
    avg_views_30d: number;
    engagement_rate: number;
    gpm: number;
    demographics?: {
      major_gender?: string;
      gender_pct?: number;
      age_ranges?: string[];
    };
  };
};

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid or missing ${fieldName}`);
  }
  return value.trim();
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(`Invalid or missing ${fieldName}`);
  }
  return value;
}

function requireNumber(value: unknown, fieldName: string): number {
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid number for ${fieldName}: ${value}`);
  }
  return num;
}

function validateCreator(raw: any): Creator {
  return {
    username: requireNonEmptyString(raw.username, "username"),
    bio: requireNonEmptyString(raw.bio, "bio"),
    content_style_tags: requireStringArray(raw.content_style_tags, "content_style_tags"),
    projected_score: requireNumber(raw.projected_score, "projected_score"),
    metrics: {
      follower_count: requireNumber(raw.metrics?.follower_count, "metrics.follower_count"),
      total_gmv_30d: requireNumber(raw.metrics?.total_gmv_30d, "metrics.total_gmv_30d"),
      avg_views_30d: requireNumber(raw.metrics?.avg_views_30d, "metrics.avg_views_30d"),
      engagement_rate: requireNumber(raw.metrics?.engagement_rate, "metrics.engagement_rate"),
      gpm: requireNumber(raw.metrics?.gpm, "metrics.gpm"),
      demographics: {
        major_gender:
          raw.metrics?.demographics?.major_gender != null
            ? String(raw.metrics.demographics.major_gender)
            : undefined,
        gender_pct:
          raw.metrics?.demographics?.gender_pct != null
            ? requireNumber(raw.metrics.demographics.gender_pct, "metrics.demographics.gender_pct")
            : undefined,
        age_ranges:
          raw.metrics?.demographics?.age_ranges != null
            ? requireStringArray(raw.metrics.demographics.age_ranges, "metrics.demographics.age_ranges")
            : undefined,
      },
    },
  };
}

async function main() {
  const filePath = path.join(process.cwd(), "data", "creators.json");

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read dataset at ${filePath}: ${String(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Dataset JSON is malformed: ${String(error)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Dataset must be a JSON array of creators.");
  }

  const creators: Creator[] = [];
  for (let i = 0; i < parsed.length; i++) {
    try {
      creators.push(validateCreator(parsed[i]));
    } catch (error) {
      throw new Error(`Invalid creator at index ${i}: ${String(error)}`);
    }
  }

  let successCount = 0;

  for (const creator of creators) {
    try {
      await pool.query(
        `
        INSERT INTO creators (
          username,
          bio,
          content_style_tags,
          projected_score,
          follower_count,
          total_gmv_30d,
          avg_views_30d,
          engagement_rate,
          gpm,
          major_gender,
          gender_pct,
          age_ranges
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
        )
        ON CONFLICT (username)
        DO UPDATE SET
          bio = EXCLUDED.bio,
          content_style_tags = EXCLUDED.content_style_tags,
          projected_score = EXCLUDED.projected_score,
          follower_count = EXCLUDED.follower_count,
          total_gmv_30d = EXCLUDED.total_gmv_30d,
          avg_views_30d = EXCLUDED.avg_views_30d,
          engagement_rate = EXCLUDED.engagement_rate,
          gpm = EXCLUDED.gpm,
          major_gender = EXCLUDED.major_gender,
          gender_pct = EXCLUDED.gender_pct,
          age_ranges = EXCLUDED.age_ranges
        `,
        [
          creator.username,
          creator.bio,
          creator.content_style_tags,
          creator.projected_score,
          creator.metrics.follower_count,
          creator.metrics.total_gmv_30d,
          creator.metrics.avg_views_30d,
          creator.metrics.engagement_rate,
          creator.metrics.gpm,
          creator.metrics.demographics?.major_gender ?? null,
          creator.metrics.demographics?.gender_pct ?? null,
          creator.metrics.demographics?.age_ranges ?? null,
        ]
      );

      successCount += 1;
      console.log(`Inserted/updated: ${creator.username}`);
    } catch (error) {
      throw new Error(`Failed inserting creator ${creator.username}: ${String(error)}`);
    }
  }

  const countResult = await pool.query("SELECT COUNT(*) FROM creators");
  console.log("Inserted/updated creators:", successCount);
  console.log("Total rows in creators table:", countResult.rows[0].count);

  await pool.end();
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});