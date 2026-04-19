#!/usr/bin/env node
/**
 * Build index.json from apps/<slug>/manifest.yaml.
 *
 * The index is the single flat file Moses instances fetch on their sync schedule.
 * It intentionally carries only the minimum needed to decide whether to refetch
 * the full manifest + per-version file. All URLs are constructed relative to the
 * repo's main branch raw URL so no hostname lives in the manifests themselves.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appsDir = join(repoRoot, "apps");
const outPath = join(repoRoot, "index.json");

const RAW_BASE =
  process.env.CATALOG_RAW_BASE ??
  "https://raw.githubusercontent.com/moses-platform/moses-app-catalog/main";

function readYaml(p) {
  return YAML.parse(readFileSync(p, "utf8"));
}

function pickLatestNonYanked(versions) {
  const candidates = [...versions].filter((v) => !v.yanked);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Date.parse(a.releasedAt) - Date.parse(b.releasedAt));
  return candidates[candidates.length - 1];
}

function collect() {
  const slugs = readdirSync(appsDir)
    .filter((n) => n !== "_template" && !n.startsWith("."))
    .filter((n) => statSync(join(appsDir, n)).isDirectory())
    .sort();

  const entries = [];
  for (const slug of slugs) {
    const manifestPath = join(appsDir, slug, "manifest.yaml");
    const manifest = readYaml(manifestPath);
    const latest = pickLatestNonYanked(manifest.versions ?? []);

    const entry = {
      toolKey: manifest.toolKey,
      slug,
      displayName: manifest.displayName,
      description: manifest.description,
      category: manifest.category,
      tags: manifest.tags ?? [],
      appType: manifest.appType,
      repositoryUrl: manifest.repositoryUrl,
      repositoryType: manifest.repositoryType,
      monetizationModel: manifest.monetization?.model ?? "free",
      manifestUrl: `${RAW_BASE}/apps/${slug}/manifest.yaml`,
      latestVersion: latest?.version ?? null,
      latestImageDigest: latest?.imageDigest ?? null,
      latestAppConfigURL: latest?.appConfigURL ?? null,
      latestAppConfigSHA256: latest?.appConfigSHA256 ?? null,
      mosesMinVersion: latest?.mosesMinVersion ?? null,
      versions: (manifest.versions ?? []).map((v) => ({
        version: v.version,
        imageDigest: v.imageDigest,
        yanked: v.yanked === true,
        releasedAt: v.releasedAt,
      })),
      tombstone: false,
    };

    entries.push(entry);
  }

  return entries;
}

function main() {
  const entries = collect();
  const index = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "https://github.com/moses-platform/moses-app-catalog",
    count: entries.length,
    apps: entries,
  };
  writeFileSync(outPath, JSON.stringify(index, null, 2) + "\n");
  process.stdout.write(`wrote ${outPath} (${entries.length} apps)\n`);
}

main();
