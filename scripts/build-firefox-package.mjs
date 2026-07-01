import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const packageDir = join(dist, "firefox");
const packageZip = join(dist, "youtube-grid-customizer-firefox.zip");
const packageXpi = join(dist, "youtube-grid-customizer-firefox.xpi");

rmSync(packageDir, { recursive: true, force: true });
rmSync(packageZip, { force: true });
rmSync(packageXpi, { force: true });
mkdirSync(packageDir, { recursive: true });

for (const file of ["content.js", "options.html", "options.js"]) {
  cpSync(join(root, file), join(packageDir, file));
}

cpSync(join(root, "icons"), join(packageDir, "icons"), { recursive: true });

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

delete manifest.version_name;

writeFileSync(
  join(packageDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

if (!manifest.browser_specific_settings?.gecko?.id) {
  throw new Error("Firefox package requires browser_specific_settings.gecko.id");
}

if (!existsSync(join(packageDir, "icons", "icon-128.png"))) {
  throw new Error("Firefox package requires icons/icon-128.png");
}

execFileSync("zip", ["-r", packageZip, "."], {
  cwd: packageDir,
  stdio: "inherit",
});

cpSync(packageZip, packageXpi);

console.log(`Created ${packageZip}`);
console.log(`Created ${packageXpi}`);
