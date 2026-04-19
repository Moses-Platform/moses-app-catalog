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

// TSV is fragile: a stray tab/CR/LF in any field corrupts the whole stream.
// Schema regexes already forbid these in slug/version/digest, but defense-in-depth
// catches schema escapes and unexpected per-version-file content.
const CONTROL_RE = /[\t\r\n\x00-\x1f\x7f]/;

function assertSafe(slug, label, value) {
  if (typeof value !== "string") return;
  if (CONTROL_RE.test(value)) {
    process.stderr.write(
      `list-published-digests: refusing to emit ${slug} ${label}: contains control character\n`,
    );
    process.exit(2);
  }
}

const slugs = readdirSync(appsDir)
  .filter((n) => n !== "_template" && !n.startsWith("."))
  .filter((n) => statSync(join(appsDir, n)).isDirectory())
  .sort();

let missingRefCount = 0;
for (const slug of slugs) {
  assertSafe(slug, "slug", slug);
  const manifestPath = join(appsDir, slug, "manifest.yaml");
  const manifest = YAML.parse(readFileSync(manifestPath, "utf8"));
  for (const v of manifest.versions ?? []) {
    if (v.yanked) continue;
    const ref = v.imageRef ?? "";
    if (!ref) {
      // The audit job needs imageRef to build a probe URL. A non-yanked version
      // without imageRef is silently invisible to the audit — surface it loudly
      // so reviewers fix the listing instead of trusting the audit's "OK".
      process.stderr.write(
        `list-published-digests: ${slug}@${v.version} has no imageRef; weekly digest audit cannot probe it\n`,
      );
      missingRefCount++;
    }
    assertSafe(slug, `versions[${v.version}].version`, v.version);
    assertSafe(slug, `versions[${v.version}].imageDigest`, v.imageDigest);
    assertSafe(slug, `versions[${v.version}].imageRef`, ref);
    process.stdout.write(`${slug}\t${v.version}\t${v.imageDigest}\t${ref}\n`);
  }
}

if (missingRefCount > 0) {
  process.stderr.write(
    `\nlist-published-digests: ${missingRefCount} non-yanked version(s) lack imageRef.\n`,
  );
  process.exit(3);
}
