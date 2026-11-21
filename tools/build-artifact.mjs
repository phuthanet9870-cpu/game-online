// Build the world game as a single self-contained HTML page for a claude.ai artifact.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const game = join(root, "games/world");
execSync("npx vite build --config vite.artifact.config.ts", { cwd: game, stdio: "inherit" });
const dist = join(game, "dist-artifact");
const css = readdirSync(dist).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(dist, f), "utf8")).join("\n");
const js = readFileSync(join(dist, "app.js"), "utf8").replaceAll("</script", "<\\/script");
const page = readFileSync(join(game, "src/artifact/page.html"), "utf8")
  .replace("/*CSS*/", () => css)
  .replace("/*JS*/", () => js);
const out = join(dist, "lumen-realm.html");
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KiB)`);
