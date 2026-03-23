import {
    searchCreatorsOpenAI,
    closeSearchOpenAIPool,
  } from "./searchCreatorsOpenAI";
  import { writeSearchOutputs } from "./outputWriter";
  import { BrandProfile } from "./types";
  
  async function main() {
    const query = "Affordable home decor for small apartments";
  
    const brandProfile: BrandProfile = {
      id: "brand_smart_home",
      industries: ["smart home", "home decor", "home organization"],
      target_audience: {
        gender: "FEMALE",
        age_ranges: ["18-24", "25-34", "35-44"],
      },
      gmv: 50000,
    };
  
    try {
      const results = await searchCreatorsOpenAI(query, brandProfile);
  
      const { latestResultsPath, archiveResultsPath } =
        await writeSearchOutputs(
          results,
          "top10_brand_smart_home_affordable_home_decor",
          "openai",
          query,
          brandProfile
        );
  
      console.log("Top 10 OpenAI ranked creators:");
      console.log(JSON.stringify(results, null, 2));
      console.log(`Latest output written to: ${latestResultsPath}`);
      console.log(`Historical archive written to: ${archiveResultsPath}`);
    } catch (error) {
      console.error("OpenAI search pipeline failed:", error);
      process.exitCode = 1;
    } finally {
      await closeSearchOpenAIPool();
    }
  }
  
  main();