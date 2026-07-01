import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const packageDir = join(dist, "chrome");
const packageZip = join(dist, "youtube-grid-customizer-chrome.zip");

rmSync(packageDir, { recursive: true, force: true });
rmSync(packageZip, { force: true });
mkdirSync(packageDir, { recursive: true });

for (const file of ["content.js", "options.html", "options.js"]) {
  cpSync(join(root, file), join(packageDir, file));
}

cpSync(join(root, "icons"), join(packageDir, "icons"), { recursive: true });

const manifest = JSON.parse(
  execFileSync(process.execPath, [
    "-e",
    "process.stdout.write(require('fs').readFileSync('manifest.json', 'utf8'))",
  ], { cwd: root, encoding: "utf8" }),
);

delete manifest.browser_specific_settings;

writeFileSync(
  join(packageDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

if (!existsSync(join(packageDir, "icons", "icon-128.png"))) {
  throw new Error("Chrome Web Store package requires icons/icon-128.png");
}

execFileSync("zip", ["-r", packageZip, "."], {
  cwd: packageDir,
  stdio: "inherit",
});

console.log(`Created ${packageZip}`);
