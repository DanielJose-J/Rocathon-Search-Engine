CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS creators_local;
DROP TABLE IF EXISTS creators_openai;

CREATE TABLE creators_local (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  bio TEXT NOT NULL,
  content_style_tags TEXT[] NOT NULL,
  projected_score NUMERIC NOT NULL,
  follower_count BIGINT NOT NULL,
  total_gmv_30d NUMERIC NOT NULL,
  avg_views_30d NUMERIC NOT NULL,
  engagement_rate NUMERIC NOT NULL,
  gpm NUMERIC NOT NULL,
  major_gender TEXT,
  gender_pct NUMERIC,
  age_ranges TEXT[],
  embedding vector(256)
);

CREATE TABLE creators_openai (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  bio TEXT NOT NULL,
  content_style_tags TEXT[] NOT NULL,
  projected_score NUMERIC NOT NULL,
  follower_count BIGINT NOT NULL,
  total_gmv_30d NUMERIC NOT NULL,
  avg_views_30d NUMERIC NOT NULL,
  engagement_rate NUMERIC NOT NULL,
  gpm NUMERIC NOT NULL,
  major_gender TEXT,
  gender_pct NUMERIC,
  age_ranges TEXT[],
  embedding vector(1536)
);