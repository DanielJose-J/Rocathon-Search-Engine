function normalizeText(text: unknown): string {
    if (typeof text !== "string") return "";
    return text.toLowerCase();
  }
  
  function tokenize(text: string): string[] {
    return normalizeText(text)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }
  
  function hashToken(token: string, dims: number): number {
    let hash = 2166136261;
  
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  
    return Math.abs(hash) % dims;
  }
  
  export function buildCreatorText(input: {
    bio: string;
    content_style_tags: string[];
  }): string {
    const bio = typeof input.bio === "string" ? input.bio : "";
    const tags = Array.isArray(input.content_style_tags) ? input.content_style_tags : [];
    return `Bio: ${bio}\nTags: ${tags.join(" ")}`;
  }
  
  export function buildQueryText(input: {
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
  
  export function embedTextLocal(text: string, dims = 256): number[] {
    if (!Number.isInteger(dims) || dims <= 0) {
      throw new Error(`Invalid embedding dimension: ${dims}`);
    }
  
    const tokens = tokenize(text);
    const vector = new Array(dims).fill(0);
  
    for (const token of tokens) {
      const index = hashToken(token, dims);
      vector[index] += 1;
    }
  
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  
    if (norm === 0) {
      return vector;
    }
  
    return vector.map((v) => v / norm);
  }
  
  export function toPgVector(vec: number[]): string {
    if (!Array.isArray(vec) || vec.length === 0) {
      throw new Error("Cannot convert empty vector to pgvector format.");
    }
  
    if (vec.some((v) => typeof v !== "number" || Number.isNaN(v))) {
      throw new Error("Vector contains invalid numeric values.");
    }
  
    return `[${vec.join(",")}]`;
  }