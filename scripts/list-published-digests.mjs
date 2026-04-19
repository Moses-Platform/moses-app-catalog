#!/usr/bin/env node
/**
 * Print one TSV row per non-yanked published version:
 *   slug<TAB>version<TAB>imageDigest<TAB>imageRef
 *
 * Used by .github/workflows/scheduled-digest-audit.yml to drive `crane manifest`
 * probes against every digest still considered live in the catalog.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appsDir = join(repoRoot, "apps");

const slugs = readdirSync(appsDir)
  .filter((n) => n !== "_template" && !n.startsWith("."))
  .filter((n) => statSync(join(appsDir, n)).isDirectory())
  .sort();

for (const slug of slugs) {
  const manifestPath = join(appsDir, slug, "manifest.yaml");
  const manifest = YAML.parse(readFileSync(manifestPath, "utf8"));
  for (const v of manifest.versions ?? []) {
    if (v.yanked) continue;
    const ref = v.imageRef ?? "";
    process.stdout.write(`${slug}\t${v.version}\t${v.imageDigest}\t${ref}\n`);
  }
}
