import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const packageDir = join(dist, "chrome");
const packageZip = join(dist, "youtube-grid-customizer-chrome.zip");

mkdirSync(packageDir, { recursive: true });

for (const file of ["content.js", "page-bridge.js", "options.html", "options.js"]) {
  cpSync(join(root, file), join(packageDir, file));
}

cpSync(join(root, "icons"), join(packageDir, "icons"), { recursive: true });

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

delete manifest.browser_specific_settings;

writeFileSync(
  join(packageDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

if (!existsSync(join(packageDir, "icons", "icon-128.png"))) {
  throw new Error("Chrome Web Store package requires icons/icon-128.png");
}

execFileSync(
  "zip",
  [
    "-r",
    "-FS",
    packageZip,
    "content.js",
    "page-bridge.js",
    "icons",
    "manifest.json",
    "options.html",
    "options.js",
  ],
  {
    cwd: packageDir,
    stdio: "inherit",
  },
);

console.log(`Created ${packageZip}`);
