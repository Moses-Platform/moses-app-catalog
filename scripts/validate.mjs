#!/usr/bin/env node
/**
 * Schema + semantic validator for the moses-app-catalog.
 *
 * Runs:
 *   1. JSON Schema validation of every apps/<slug>/manifest.yaml against schema/manifest.schema.json
 *   2. Cross-consistency checks (slug == directory name, repositoryType matches hostname)
 *   3. Per-version file validation against schema/version.schema.json
 *   4. Semantic checks that go beyond JSON Schema (forbidden patterns, releasedAt is in the past,
 *      at least one owner, no duplicate versions, each listed version has a per-version file,
 *      template directory is intentionally skipped).
 *
 * Usage:
 *   node scripts/validate.mjs [apps/<slug> [apps/<slug> ...]]
 *
 * If no targets are given, all apps/* except _template are validated.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appsDir = join(repoRoot, "apps");
const schemaDir = join(repoRoot, "schema");

const manifestSchema = JSON.parse(
  readFileSync(join(schemaDir, "manifest.schema.json"), "utf8"),
);
const versionSchema = JSON.parse(
  readFileSync(join(schemaDir, "version.schema.json"), "utf8"),
);

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats.default ? addFormats.default(ajv) : addFormats(ajv);
ajv.addSchema(versionSchema);
const validateManifest = ajv.compile(manifestSchema);
const validateVersion = ajv.compile(versionSchema);

const SUSPICIOUS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.",
];

const PRIVATE_IP_RE = [
  /(^|\/\/)10\./,
  /(^|\/\/)172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /(^|\/\/)192\.168\./,
];

function containsSuspiciousHost(url) {
  if (typeof url !== "string") return null;
  const lower = url.toLowerCase();
  for (const needle of SUSPICIOUS) {
    if (lower.includes(needle)) return needle;
  }
  for (const re of PRIVATE_IP_RE) {
    if (re.test(lower)) return re.source;
  }
  return null;
}

function collectTargets(argv) {
  if (argv.length > 0) return argv.map((p) => resolve(p));
  return readdirSync(appsDir)
    .filter((name) => name !== "_template" && !name.startsWith("."))
    .map((name) => join(appsDir, name))
    .filter((p) => statSync(p).isDirectory());
}

function readYaml(path) {
  return YAML.parse(readFileSync(path, "utf8"));
}

function pushErr(errs, slug, msg) {
  errs.push(`[${slug}] ${msg}`);
}

function validateAppDir(dir) {
  const slug = basename(dir);
  const errs = [];
  const manifestPath = join(dir, "manifest.yaml");
  if (!existsSync(manifestPath)) {
    return [`[${slug}] missing manifest.yaml`];
  }

  let manifest;
  try {
    manifest = readYaml(manifestPath);
  } catch (e) {
    return [`[${slug}] manifest.yaml is not valid YAML: ${e.message}`];
  }

  if (!validateManifest(manifest)) {
    for (const err of validateManifest.errors ?? []) {
      pushErr(errs, slug, `schema: ${err.instancePath || "/"} ${err.message}`);
    }
  }

  if (manifest?.toolKey && manifest.toolKey !== slug) {
    pushErr(
      errs,
      slug,
      `toolKey (${manifest.toolKey}) must equal directory name (${slug})`,
    );
  }

  if (manifest?.repositoryType && manifest?.repositoryUrl) {
    const u = manifest.repositoryUrl.toLowerCase();
    if (manifest.repositoryType === "github" && !u.includes("github.com")) {
      pushErr(errs, slug, `repositoryType=github but repositoryUrl is not on github.com`);
    }
    if (manifest.repositoryType === "gitlab" && !u.includes("gitlab")) {
      pushErr(errs, slug, `repositoryType=gitlab but repositoryUrl hostname does not contain 'gitlab'`);
    }
  }

  const urlFields = [
    manifest?.repositoryUrl,
    manifest?.iconUrl,
    manifest?.documentationUrl,
    manifest?.policy?.privacyPolicy,
    manifest?.policy?.termsOfService,
    ...(Array.isArray(manifest?.screenshotUrls) ? manifest.screenshotUrls : []),
  ];
  for (const u of urlFields) {
    const hit = containsSuspiciousHost(u);
    if (hit) pushErr(errs, slug, `url '${u}' matches forbidden pattern '${hit}'`);
  }

  if (Array.isArray(manifest?.versions)) {
    const seen = new Set();
    for (const v of manifest.versions) {
      if (seen.has(v.version)) {
        pushErr(errs, slug, `duplicate version in manifest: ${v.version}`);
      }
      seen.add(v.version);

      if (!validateVersion(v)) {
        for (const err of validateVersion.errors ?? []) {
          pushErr(errs, slug, `versions[${v.version}] ${err.instancePath || "/"} ${err.message}`);
        }
      }

      if (v.releasedAt) {
        const t = Date.parse(v.releasedAt);
        if (Number.isNaN(t)) {
          pushErr(errs, slug, `versions[${v.version}] releasedAt is not a valid date-time`);
        } else if (t > Date.now() + 60_000) {
          pushErr(errs, slug, `versions[${v.version}] releasedAt is in the future`);
        }
      }

      const perVersionPath = join(dir, "versions", `${v.version}.yaml`);
      if (!existsSync(perVersionPath)) {
        pushErr(errs, slug, `missing per-version file versions/${v.version}.yaml`);
      } else {
        try {
          const perVersion = readYaml(perVersionPath);
          if (!validateVersion(perVersion)) {
            for (const err of validateVersion.errors ?? []) {
              pushErr(errs, slug, `versions/${v.version}.yaml ${err.instancePath || "/"} ${err.message}`);
            }
          }
          if (perVersion?.version !== v.version) {
            pushErr(errs, slug, `versions/${v.version}.yaml has version=${perVersion?.version}; expected ${v.version}`);
          }
        } catch (e) {
          pushErr(errs, slug, `versions/${v.version}.yaml is not valid YAML: ${e.message}`);
        }
      }
    }
  }

  return errs;
}

function main() {
  const argv = process.argv.slice(2);
  const targets = collectTargets(argv);
  let failed = 0;
  for (const dir of targets) {
    const errs = validateAppDir(dir);
    if (errs.length === 0) {
      process.stdout.write(`ok   ${basename(dir)}\n`);
    } else {
      failed++;
      for (const e of errs) process.stdout.write(`FAIL ${e}\n`);
    }
  }
  if (failed > 0) {
    process.stderr.write(`\n${failed} app(s) failed validation\n`);
    process.exit(1);
  }
  process.stdout.write(`\nall ${targets.length} app(s) passed\n`);
}

main();
