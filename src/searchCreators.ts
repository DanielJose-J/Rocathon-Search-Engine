import dotenv from "dotenv";
import { Pool } from "pg";
import { buildQueryText, embedTextLocal, toPgVector } from "./localEmbed";
import { BrandProfile, RankedCreator } from "./types";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL in .env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

type RawCreatorRow = {
  username: string;
  bio: string;
  content_style_tags: string[];
  projected_score: string;
  follower_count: string;
  total_gmv_30d: string;
  avg_views_30d: string;
  engagement_rate: string;
  gpm: string;
  major_gender: string | null;
  gender_pct: string | null;
  age_ranges: string[] | null;
  semantic_score: number;
};

function isZeroVector(vec: number[]): boolean {
  return vec.every((v) => v === 0);
}

function toSafeNumber(value: string | number | null, fieldName: string): number {
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid numeric value for ${fieldName}: ${value}`);
  }
  return num;
}

function normalizeProjectedScore(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  return clamped / 100;
}

function computeFinalScore(
  semanticScore: number,
  projectedScore: number,
  semanticWeight = 0.45,
  projectedWeight = 0.55
): number {
  return semanticScore * semanticWeight + normalizeProjectedScore(projectedScore) * projectedWeight;
}

function buildMatchReasons(input: {
  semanticScore: number;
  projectedScore: number;
  totalGmv30d: number;
  engagementRate: number;
  contentStyleTags: string[];
  brandProfile: BrandProfile;
}): string[] {
  const reasons: string[] = [];

  if (input.semanticScore >= 0.3) {
    reasons.push("Strong semantic relevance to the search query");
  } else if (input.semanticScore >= 0.2) {
    reasons.push("Good semantic relevance to the search query");
  }

  if (input.projectedScore >= 85) {
    reasons.push("Very high projected business score");
  } else if (input.projectedScore >= 75) {
    reasons.push("Strong projected business score");
  }

  if (input.totalGmv30d >= 40000) {
    reasons.push("Strong recent GMV performance");
  } else if (input.totalGmv30d >= 10000) {
    reasons.push("Healthy recent GMV performance");
  }

  if (input.engagementRate >= 0.1) {
    reasons.push("High engagement rate");
  } else if (input.engagementRate >= 0.06) {
    reasons.push("Solid engagement rate");
  }

  const tagText = input.contentStyleTags.map((t) => t.toLowerCase()).join(" ");
  const profileTerms = [
    ...(input.brandProfile.keyCategories ?? []),
    ...(input.brandProfile.preferredTags ?? []),
  ]
    .map((v) => v.toLowerCase());

  const hasOverlap = profileTerms.some((term) => tagText.includes(term));
  if (hasOverlap) {
    reasons.push("Content style aligns with the brand profile");
  }

  if (reasons.length === 0) {
    reasons.push("Balanced contextual and performance fit");
  }

  return reasons.slice(0, 4);
}

export async function searchCreators(
  query: string,
  brandProfile: BrandProfile
): Promise<RankedCreator[]> {
  if (!query || !query.trim()) {
    throw new Error("Query cannot be empty.");
  }

  const safeBrandProfile: BrandProfile = {
    keyCategories: brandProfile?.keyCategories ?? [],
    targetAudience: brandProfile?.targetAudience ?? [],
    preferredTags: brandProfile?.preferredTags ?? [],
  };

  const searchText = buildQueryText({
    query: query.trim(),
    brandProfile: safeBrandProfile,
  });

  const queryEmbedding = embedTextLocal(searchText, 256);

  if (isZeroVector(queryEmbedding)) {
    throw new Error("Query embedding is empty. Please provide a more descriptive query.");
  }

  let result;
  try {
    result = await pool.query<RawCreatorRow>(
      `
      SELECT
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
        age_ranges,
        1 - (embedding <=> $1::vector) AS semantic_score
      FROM creators
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 50
      `,
      [toPgVector(queryEmbedding)]
    );
  } catch (error) {
    throw new Error(`Database search failed: ${String(error)}`);
  }

  if (result.rows.length === 0) {
    throw new Error(
      "No creators found. Make sure ingestion and embedding generation have been completed."
    );
  }

  const ranked = result.rows.map((row) => {
    const projectedScore = toSafeNumber(row.projected_score, "projected_score");
    const semanticScore = toSafeNumber(row.semantic_score, "semantic_score");
    const totalGmv30d = toSafeNumber(row.total_gmv_30d, "total_gmv_30d");
    const engagementRate = toSafeNumber(row.engagement_rate, "engagement_rate");
    const finalScore = computeFinalScore(semanticScore, projectedScore);

    return {
      username: row.username,
      bio: row.bio,
      content_style_tags: row.content_style_tags ?? [],
      projected_score: projectedScore,
      semantic_score: semanticScore,
      final_score: finalScore,
      match_reasons: buildMatchReasons({
        semanticScore,
        projectedScore,
        totalGmv30d,
        engagementRate,
        contentStyleTags: row.content_style_tags ?? [],
        brandProfile: safeBrandProfile,
      }),
      metrics: {
        follower_count: toSafeNumber(row.follower_count, "follower_count"),
        total_gmv_30d: totalGmv30d,
        avg_views_30d: toSafeNumber(row.avg_views_30d, "avg_views_30d"),
        engagement_rate: engagementRate,
        gpm: toSafeNumber(row.gpm, "gpm"),
        demographics: {
          major_gender: row.major_gender,
          gender_pct: row.gender_pct !== null ? toSafeNumber(row.gender_pct, "gender_pct") : null,
          age_ranges: row.age_ranges ?? [],
        },
      },
    };
  });

  ranked.sort((a, b) => b.final_score - a.final_score);

  return ranked;
}

export async function closeSearchPool() {
  await pool.end();
}