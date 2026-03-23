import { promises as fs } from "fs";
import path from "path";

function buildTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function writeSearchOutputs(
  results: unknown,
  baseName: string,
  mode: "local" | "openai",
  query: string,
  brandProfile: unknown
) {
  const outputDir = path.join(process.cwd(), "outputs");
  await fs.mkdir(outputDir, { recursive: true });

  const latestResultsPath = path.join(outputDir, `${baseName}.${mode}.json`);
  const archiveResultsPath = path.join(
    outputDir,
    `${baseName}.${mode}.${buildTimestamp()}.json`
  );

  const latestPayload = JSON.stringify(results, null, 2);

  const archivePayload = JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      mode,
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