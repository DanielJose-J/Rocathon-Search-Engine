import { searchCreators, closeSearchPool } from "./searchCreators";
import { writeSearchOutputs } from "./outputWriter";
import { BrandProfile } from "./types";

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

    const { latestResultsPath, archiveResultsPath } =
      await writeSearchOutputs(
        results,
        "output.brand_smart_home",
        "local",
        query,
        brandProfile
      );

    console.log("Top 10 local hybrid-ranked creators:");
    console.log(JSON.stringify(results.slice(0, 10), null, 2));
    console.log(`Latest output written to: ${latestResultsPath}`);
    console.log(`Historical archive written to: ${archiveResultsPath}`);
  } catch (error) {
    console.error("Local search pipeline failed:", error);
    process.exitCode = 1;
  } finally {
    await closeSearchPool();
  }
}

main();