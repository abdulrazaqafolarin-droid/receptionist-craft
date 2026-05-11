import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

const TOKEN = "vcp_36qiXQ7cT4ws70EJJQF4dblrBe0g2T7Vm9ZFEXifo5VLONPHDl1WKLKW";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = join(__dirname, "dist");

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

const files = walk(DIST).map((file) => ({
  file: relative(DIST, file).replace(/\\/g, "/"),
  data: readFileSync(file).toString("base64"),
  encoding: "base64",
}));

// Include vercel.json for SPA rewrites and headers
const vercelJsonPath = join(__dirname, "vercel.json");
if (existsSync(vercelJsonPath)) {
  files.push({
    file: "vercel.json",
    data: readFileSync(vercelJsonPath).toString("base64"),
    encoding: "base64",
  });
  console.log("Including vercel.json in deployment");
}

const body = JSON.stringify({
  name: "receptionist-craft",
  version: 2,
  files,
  projectSettings: { buildCommand: null, outputDirectory: ".", devCommand: null, installCommand: null },
  target: "production",
  public: true,
});

const res = await fetch("https://api.vercel.com/v13/deployments", {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body,
});

const result = await res.json();
if (res.ok) {
  console.log(`Deployed! URL: https://${result.url}`);
  console.log(`ID: ${result.id}`);
  console.log(`State: ${result.readyState}`);
  console.log(`Aliases: ${result.alias?.join(", ") || "none"}`);
} else {
  console.error("Error:", JSON.stringify(result, null, 2));
}
