import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL in .env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    const totalCreators = await pool.query(`
      SELECT COUNT(*) AS count
      FROM creators
    `);

    const embeddedCreators = await pool.query(`
      SELECT COUNT(*) AS count
      FROM creators
      WHERE embedding IS NOT NULL
    `);

    const missingUsernames = await pool.query(`
      SELECT COUNT(*) AS count
      FROM creators
      WHERE username IS NULL OR TRIM(username) = ''
    `);

    const missingBios = await pool.query(`
      SELECT COUNT(*) AS count
      FROM creators
      WHERE bio IS NULL OR TRIM(bio) = ''
    `);

    const missingTags = await pool.query(`
      SELECT COUNT(*) AS count
      FROM creators
      WHERE content_style_tags IS NULL OR array_length(content_style_tags, 1) IS NULL
    `);

    const missingProjectedScores = await pool.query(`
      SELECT COUNT(*) AS count
      FROM creators
      WHERE projected_score IS NULL
    `);

    const missingEmbeddings = await pool.query(`
      SELECT COUNT(*) AS count
      FROM creators
      WHERE embedding IS NULL
    `);

    console.log("Sanity Check Results");
    console.log("--------------------");
    console.log("Total creators:", totalCreators.rows[0].count);
    console.log("Creators with embeddings:", embeddedCreators.rows[0].count);
    console.log("Missing usernames:", missingUsernames.rows[0].count);
    console.log("Missing bios:", missingBios.rows[0].count);
    console.log("Missing content_style_tags:", missingTags.rows[0].count);
    console.log("Missing projected_score:", missingProjectedScores.rows[0].count);
    console.log("Missing embeddings:", missingEmbeddings.rows[0].count);

    const hasIssues =
      Number(missingUsernames.rows[0].count) > 0 ||
      Number(missingBios.rows[0].count) > 0 ||
      Number(missingTags.rows[0].count) > 0 ||
      Number(missingProjectedScores.rows[0].count) > 0;

    if (hasIssues) {
      console.warn("\nSanity check completed with data quality warnings.");
      process.exitCode = 1;
    } else {
      console.log("\nSanity check passed.");
    }
  } catch (error) {
    console.error("Sanity check failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();