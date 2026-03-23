export type BrandProfile = {
    id: string;
    industries: string[];
    target_audience: {
      gender: string;
      age_ranges: string[];
    };
    gmv: number;
  };
  
  export type RankedCreator = {
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
      demographics: {
        major_gender: string | null;
        gender_pct: number | null;
        age_ranges: string[] | null;
      };
    };
    scores: {
      semantic_score: number;
      projected_score: number;
      final_score: number;
    };
    match_reasons?: string[];
  };