#!/usr/bin/env node
/**
 * Build index.json from apps/<slug>/manifest.yaml.
 *
 * The index is the single flat file Moses instances fetch on their sync schedule.
 * It carries the minimum needed for an instance to render the App Store grid AND
 * to install a listing without a second fetch — including the Path C closed-source
 * routing fields (helmChartRef, helmChartVersion, distributionType).
 *
 * Stability: `generatedAt` is updated only when the catalog content actually
 * changes. A pure no-op rebuild (e.g. CI re-run with no app touches) keeps the
 * existing timestamp so that index.json doesn't churn and re-trigger signing.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
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
  candidates.sort((a, b) => {
    const t = Date.parse(a.releasedAt) - Date.parse(b.releasedAt);
    if (t !== 0) return t;
    // Secondary sort by semver-ish string compare to break exact-timestamp ties.
    return a.version.localeCompare(b.version, undefined, { numeric: true });
  });
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
      // Identity
      toolKey: manifest.toolKey,
      slug,
      displayName: manifest.displayName,
      description: manifest.description,
      category: manifest.category,
      tags: manifest.tags ?? [],
      appType: manifest.appType,

      // Source / build
      repositoryUrl: manifest.repositoryUrl ?? null,
      repositoryType: manifest.repositoryType,
      dockerfilePath: manifest.dockerfilePath ?? null,
      buildContext: manifest.buildContext ?? null,
      helmChartPath: manifest.helmChartPath ?? null,

      // Closed-source / OCI routing (Path C)
      helmChartRef: manifest.helmChartRef ?? null,
      helmChartVersion: manifest.helmChartVersion ?? null,
      distributionType: manifest.trust?.distributionType ?? null,

      // App Store UI assets
      iconUrl: manifest.iconUrl ?? null,
      screenshotUrls: manifest.screenshotUrls ?? [],
      documentationUrl: manifest.documentationUrl ?? null,

      // Monetization
      monetizationModel: manifest.monetization?.model ?? "free",

      // Where the full manifest lives if an instance wants more detail
      manifestUrl: `${RAW_BASE}/apps/${slug}/manifest.yaml`,

      // Latest version routing
      latestVersion: latest?.version ?? null,
      latestImageDigest: latest?.imageDigest ?? null,
      latestImageRef: latest?.imageRef ?? null,
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

function contentHash(entries) {
  const h = createHash("sha256");
  h.update(JSON.stringify(entries));
  return h.digest("hex");
}

function loadExistingIndex() {
  if (!existsSync(outPath)) return null;
  try {
    return JSON.parse(readFileSync(outPath, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const entries = collect();
  const newHash = contentHash(entries);
  const existing = loadExistingIndex();

  // Preserve generatedAt when nothing material changed, so a no-op rebuild
  // doesn't churn index.json and re-trigger the sign workflow.
  const generatedAt =
    existing && existing.contentHash === newHash
      ? existing.generatedAt
      : new Date().toISOString();

  const index = {
    schemaVersion: 1,
    generatedAt,
    contentHash: newHash,
    source: "https://github.com/moses-platform/moses-app-catalog",
    count: entries.length,
    apps: entries,
  };
  writeFileSync(outPath, JSON.stringify(index, null, 2) + "\n");
  process.stdout.write(`wrote ${outPath} (${entries.length} apps)\n`);
}

main();
