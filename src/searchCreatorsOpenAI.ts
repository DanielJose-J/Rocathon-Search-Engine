import dotenv from "dotenv";
import OpenAI from "openai";
import { Pool } from "pg";
import { BrandProfile, RankedCreator } from "./types";

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

function toPgVector(vec: number[]): string {
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error("Cannot convert empty vector to pgvector format.");
  }

  if (vec.some((v) => typeof v !== "number" || Number.isNaN(v))) {
    throw new Error("Vector contains invalid numeric values.");
  }

  return `[${vec.join(",")}]`;
}

function buildQueryText(input: {
  query: string;
  brandProfile?: {
    keyCategories?: string[];
    targetAudience?: string[];
    preferredTags?: string[];
  };
}): string {
  const parts = [`Query: ${typeof input.query === "string" ? input.query : ""}`];

  if (input.brandProfile?.keyCategories?.length) {
    parts.push(`Categories: ${input.brandProfile.keyCategories.join(" ")}`);
  }

  if (input.brandProfile?.targetAudience?.length) {
    parts.push(`Audience: ${input.brandProfile.targetAudience.join(" ")}`);
  }

  if (input.brandProfile?.preferredTags?.length) {
    parts.push(`Preferred tags: ${input.brandProfile.preferredTags.join(" ")}`);
  }

  return parts.join("\n");
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

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

function computeGmvPenalty(totalGmv30d: number): number {
  if (totalGmv30d === 0) return 0.1;
  if (totalGmv30d < 5000) return 0.05;
  if (totalGmv30d < 15000) return 0.02;
  return 0;
}

function computeCategoryAlignmentBoost(
  contentStyleTags: string[],
  brandProfile: BrandProfile
): number {
  const tags = contentStyleTags.map(normalizeText);
  const industries = (brandProfile.industries ?? []).map(normalizeText);

  if (industries.length === 0 || tags.length === 0) {
    return 0;
  }

  let boost = 0;

  for (const industry of industries) {
    for (const tag of tags) {
      if (tag === industry) {
        boost += 0.06;
        continue;
      }

      if (
        industry.includes("smart home") &&
        (tag.includes("phones") || tag.includes("electronics") || tag === "home")
      ) {
        boost += 0.05;
        continue;
      }

      if (
        (industry.includes("home decor") ||
          industry.includes("home organization") ||
          industry.includes("furniture")) &&
        tag === "home"
      ) {
        boost += 0.04;
        continue;
      }

      if (industry.includes("smart home") && tag.includes("tools")) {
        boost += 0.02;
        continue;
      }

      if (tag.includes(industry) || industry.includes(tag)) {
        boost += 0.03;
      }
    }
  }

  return Math.min(boost, 0.1);
}

function computeAudienceBoost(
  creatorGender: string | null,
  creatorAgeRanges: string[] | null,
  brandProfile: BrandProfile
): number {
  let boost = 0;

  const targetGender = normalizeText(brandProfile.target_audience?.gender ?? "");
  const creatorGenderNorm = normalizeText(creatorGender ?? "");

  if (targetGender && creatorGenderNorm && creatorGenderNorm.includes(targetGender)) {
    boost += 0.03;
  }

  const targetAges = (brandProfile.target_audience?.age_ranges ?? []).map(normalizeText);
  const creatorAges = (creatorAgeRanges ?? []).map(normalizeText);

  const ageOverlap = targetAges.some((age) => creatorAges.includes(age));
  if (ageOverlap) {
    boost += 0.03;
  }

  return Math.min(boost, 0.06);
}

function computeFinalScore(
  semanticScore: number,
  projectedScore: number,
  totalGmv30d: number,
  contentStyleTags: string[],
  creatorGender: string | null,
  creatorAgeRanges: string[] | null,
  brandProfile: BrandProfile,
  semanticWeight = 0.45,
  projectedWeight = 0.55
): number {
  const projectedNormalized = normalizeProjectedScore(projectedScore);

  const baseScore =
    semanticScore * semanticWeight +
    projectedNormalized * projectedWeight;

  const gmvPenalty = computeGmvPenalty(totalGmv30d);
  const categoryBoost = computeCategoryAlignmentBoost(contentStyleTags, brandProfile);
  const audienceBoost = computeAudienceBoost(
    creatorGender,
    creatorAgeRanges,
    brandProfile
  );

  return baseScore - gmvPenalty + categoryBoost + audienceBoost;
}

function buildMatchReasons(input: {
  semanticScore: number;
  projectedScore: number;
  totalGmv30d: number;
  engagementRate: number;
  contentStyleTags: string[];
  creatorGender: string | null;
  creatorAgeRanges: string[] | null;
  brandProfile: BrandProfile;
}): string[] {
  const reasons: string[] = [];

  if (input.semanticScore >= 0.3) {
    reasons.push("Strong semantic relevance to the query");
  } else if (input.semanticScore >= 0.2) {
    reasons.push("Good semantic relevance to the query");
  }

  if (input.projectedScore >= 85) {
    reasons.push("Very strong projected commerce score");
  } else if (input.projectedScore >= 75) {
    reasons.push("Strong projected commerce score");
  }

  if (input.totalGmv30d >= 40000) {
    reasons.push("Strong recent GMV performance");
  } else if (input.totalGmv30d >= 10000) {
    reasons.push("Healthy recent GMV performance");
  } else if (input.totalGmv30d > 0 && input.totalGmv30d < 5000) {
    reasons.push("Low recent GMV so score is slightly penalized");
  } else if (input.totalGmv30d === 0) {
    reasons.push("No recent GMV so score is penalized");
  }

  if (input.engagementRate >= 0.1) {
    reasons.push("High engagement rate");
  }

  const categoryBoost = computeCategoryAlignmentBoost(
    input.contentStyleTags,
    input.brandProfile
  );
  if (categoryBoost >= 0.05) {
    reasons.push("Strong industry alignment with the brand");
  }

  const audienceBoost = computeAudienceBoost(
    input.creatorGender,
    input.creatorAgeRanges,
    input.brandProfile
  );
  if (audienceBoost > 0) {
    reasons.push("Audience aligns with the brand target");
  }

  if (reasons.length === 0) {
    reasons.push("Balanced contextual and commerce fit");
  }

  return reasons.slice(0, 4);
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

export async function searchCreatorsOpenAI(
  query: string,
  brandProfile: BrandProfile
): Promise<RankedCreator[]> {
  if (!query || !query.trim()) {
    throw new Error("Query cannot be empty.");
  }

  const searchText = buildQueryText({
    query: query.trim(),
    brandProfile: {
      keyCategories: brandProfile.industries,
      targetAudience: [
        brandProfile.target_audience.gender,
        ...(brandProfile.target_audience.age_ranges ?? []),
      ],
      preferredTags: [],
    },
  });

  let response;
  try {
    response = await client.embeddings.create({
      model: MODEL,
      input: searchText,
    });
  } catch (error: any) {
    throw new Error(getOpenAIErrorMessage(error));
  }

  const queryEmbedding = response.data[0].embedding;

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
      FROM creators_openai
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 50
      `,
      [toPgVector(queryEmbedding)]
    );
  } catch (error) {
    throw new Error(`OpenAI database search failed: ${String(error)}`);
  }

  if (result.rows.length === 0) {
    throw new Error("No OpenAI-embedded creators found. Run embed-creators-openai first.");
  }

  const ranked: RankedCreator[] = result.rows.map((row) => {
    const projectedScore = toSafeNumber(row.projected_score, "projected_score");
    const semanticScore = toSafeNumber(row.semantic_score, "semantic_score");
    const totalGmv30d = toSafeNumber(row.total_gmv_30d, "total_gmv_30d");
    const engagementRate = toSafeNumber(row.engagement_rate, "engagement_rate");
    const contentStyleTags = row.content_style_tags ?? [];

    const finalScore = computeFinalScore(
      semanticScore,
      projectedScore,
      totalGmv30d,
      contentStyleTags,
      row.major_gender,
      row.age_ranges ?? [],
      brandProfile
    );

    return {
      username: row.username,
      bio: row.bio,
      content_style_tags: contentStyleTags,
      projected_score: projectedScore,
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
      scores: {
        semantic_score: semanticScore,
        projected_score: projectedScore,
        final_score: finalScore,
      },
      match_reasons: buildMatchReasons({
        semanticScore,
        projectedScore,
        totalGmv30d,
        engagementRate,
        contentStyleTags,
        creatorGender: row.major_gender,
        creatorAgeRanges: row.age_ranges ?? [],
        brandProfile,
      }),
    };
  });

  ranked.sort((a, b) => {
    if (b.scores.final_score !== a.scores.final_score) {
      return b.scores.final_score - a.scores.final_score;
    }
    if (b.scores.projected_score !== a.scores.projected_score) {
      return b.scores.projected_score - a.scores.projected_score;
    }
    if (b.metrics.total_gmv_30d !== a.metrics.total_gmv_30d) {
      return b.metrics.total_gmv_30d - a.metrics.total_gmv_30d;
    }
    return a.username.localeCompare(b.username);
  });

  return ranked.slice(0, 10);
}

export async function closeSearchOpenAIPool() {
  await pool.end();
}