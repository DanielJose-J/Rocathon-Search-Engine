import fs from "fs/promises";
import path from "path";

async function main() {
  const filePath = path.join(process.cwd(), "data", "creators.json");
  const raw = await fs.readFile(filePath, "utf-8");
  const data = JSON.parse(raw);

  console.log("Is array:", Array.isArray(data));
  console.log("Number of creators:", data.length);

  if (data.length > 0) {
    console.log("Top-level keys of first creator:", Object.keys(data[0]));
    console.log("Metrics keys of first creator:", Object.keys(data[0].metrics || {}));
    console.log("First creator sample:", data[0]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});