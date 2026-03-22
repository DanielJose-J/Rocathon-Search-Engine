import { promises as fs } from "fs";
import path from "path";
import { searchCreators, closeSearchPool } from "./searchCreators";
import { BrandProfile } from "./types";

function buildTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function writeOutputs(
  results: unknown,
  baseName: string,
  query: string,
  brandProfile: BrandProfile
) {
  const outputDir = path.join(process.cwd(), "outputs");
  await fs.mkdir(outputDir, { recursive: true });

  const latestResultsPath = path.join(outputDir, `${baseName}.json`);
  const archiveResultsPath = path.join(
    outputDir,
    `${baseName}.${buildTimestamp()}.json`
  );

  const latestPayload = JSON.stringify(results, null, 2);

  const archivePayload = JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      query,
      brandProfile,
      results,
    },
    null,
    2
  );

  await fs.writeFile(latestResultsPath, latestPayload, "utf-8");
  await fs.writeFile(archiveResultsPath, archivePayload, "utf-8");

  return {
    latestResultsPath,
    archiveResultsPath,
  };
}

async function main() {
  const query =
    "smart home creators for households who review useful home products";

  const brandProfile: BrandProfile = {
    keyCategories: ["smart home", "home organization", "cleaning"],
    targetAudience: ["households", "moms", "homeowners"],
    preferredTags: ["practical", "trustworthy", "product reviewer"],
  };

  try {
    const results = await searchCreators(query, brandProfile);

    const { latestResultsPath, archiveResultsPath } = await writeOutputs(
      results,
      "output.brand_smart_home",
      query,
      brandProfile
    );

    console.log("Top 10 hybrid-ranked creators:");
    console.log(JSON.stringify(results.slice(0, 10), null, 2));
    console.log(`Latest output written to: ${latestResultsPath}`);
    console.log(`Historical archive written to: ${archiveResultsPath}`);
  } catch (error) {
    console.error("Search pipeline failed:", error);
    process.exitCode = 1;
  } finally {
    await closeSearchPool();
  }
}

main();