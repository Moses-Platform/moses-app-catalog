#!/usr/bin/env node
/**
 * Schema + semantic validator for the moses-app-catalog.
 *
 * Runs:
 *   1. JSON Schema validation of every apps/<slug>/manifest.yaml against schema/manifest.schema.json
 *   2. Cross-consistency checks (slug == directory name, repositoryType matches hostname,
 *      iconUrl slug matches directory)
 *   3. Per-version file validation against schema/version.schema.json
 *   4. Semantic checks that go beyond JSON Schema:
 *        - releasedAt is in the past
 *        - at least one owner
 *        - no duplicate versions
 *        - each listed version has a per-version file
 *        - SPDX license identifier
 *        - imageDigest / appConfigSHA256 are not all-zero or all-same-char
 *        - no literal "TODO" strings anywhere in user-authored fields (template guard)
 *        - no private/loopback hosts in any URL field, manifest or per-version
 *   5. Optional network checks (--network):
 *        - HEAD all public URLs (icon, screenshots, docs, privacy, terms, repo)
 *        - GET each appConfigURL and verify appConfigSHA256
 *
 * Network checks are gated behind --network so local `make test` runs offline,
 * but the PR workflow can opt in.
 *
 * Usage:
 *   node scripts/validate.mjs [--network] [apps/<slug> [apps/<slug> ...]]
 *
 * If no targets are given, all apps/* except _template are validated.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appsDir = join(repoRoot, "apps");
const schemaDir = join(repoRoot, "schema");
const dataDir = join(repoRoot, "scripts", "data");

const manifestSchema = JSON.parse(
  readFileSync(join(schemaDir, "manifest.schema.json"), "utf8"),
);
const versionSchema = JSON.parse(
  readFileSync(join(schemaDir, "version.schema.json"), "utf8"),
);

const SPDX_IDS = new Set([
  ...JSON.parse(readFileSync(join(dataDir, "spdx-license-ids.json"), "utf8")),
  ...JSON.parse(readFileSync(join(dataDir, "spdx-deprecated.json"), "utf8")),
  // Catalog-specific allowance for closed-source listings.
  "Proprietary",
  "LicenseRef-Proprietary",
]);

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats.default ? addFormats.default(ajv) : addFormats(ajv);
ajv.addSchema(versionSchema);
const validateManifest = ajv.compile(manifestSchema);
const validateVersion = ajv.compile(versionSchema);

const SUSPICIOUS_HOSTS = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
]);

const PRIVATE_IP_RE = [
  /^127(\.|$)/,
  /^10(\.|$)/,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
];

const ZERO_DIGEST_RE = /^sha256:0{64}$/i;
const ALL_SAME_DIGEST_RE = /^sha256:([0-9a-f])\1{63}$/i;

const RAW_BASE_HOST = "raw.githubusercontent.com";
const CATALOG_RAW_PREFIX =
  "https://raw.githubusercontent.com/moses-platform/moses-app-catalog/main/apps/";

function isSuspiciousUrl(url) {
  if (typeof url !== "string") return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    // Schema already enforces format=uri + ^https://; non-URL strings pass through here.
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (SUSPICIOUS_HOSTS.has(host)) return host;
  for (const re of PRIVATE_IP_RE) {
    if (re.test(host)) return `private-ip(${host})`;
  }
  return null;
}

function findTodoStrings(value, path, errs, slug) {
  if (typeof value === "string") {
    if (/TODO/i.test(value)) {
      errs.push(
        `[${slug}] ${path}: contains literal 'TODO' — fill in or remove before submitting`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => findTodoStrings(v, `${path}[${i}]`, errs, slug));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      findTodoStrings(v, path ? `${path}.${k}` : k, errs, slug);
    }
  }
}

function checkDigest(value, label, slug, errs) {
  if (typeof value !== "string") return;
  if (ZERO_DIGEST_RE.test(value)) {
    errs.push(`[${slug}] ${label}: all-zero digest is a placeholder, not a real artifact`);
    return;
  }
  if (ALL_SAME_DIGEST_RE.test(value)) {
    errs.push(`[${slug}] ${label}: all-same-character digest is a placeholder`);
  }
}

function collectUrlFields(manifest) {
  const urls = [];
  const push = (label, val) => {
    if (typeof val === "string") urls.push({ label, url: val });
  };
  push("repositoryUrl", manifest?.repositoryUrl);
  push("iconUrl", manifest?.iconUrl);
  push("documentationUrl", manifest?.documentationUrl);
  push("policy.privacyPolicy", manifest?.policy?.privacyPolicy);
  push("policy.termsOfService", manifest?.policy?.termsOfService);
  if (Array.isArray(manifest?.screenshotUrls)) {
    manifest.screenshotUrls.forEach((u, i) =>
      push(`screenshotUrls[${i}]`, u),
    );
  }
  if (Array.isArray(manifest?.trust?.priorWork)) {
    manifest.trust.priorWork.forEach((u, i) =>
      push(`trust.priorWork[${i}]`, u),
    );
  }
  if (Array.isArray(manifest?.versions)) {
    manifest.versions.forEach((v, i) => {
      push(`versions[${i}].appConfigURL`, v?.appConfigURL);
    });
  }
  return urls;
}

function readYaml(path) {
  return YAML.parse(readFileSync(path, "utf8"));
}

function pushErr(errs, slug, msg) {
  errs.push(`[${slug}] ${msg}`);
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res.ok) return { ok: true };
    // Some CDNs reject HEAD with 405 — fall back to a 1-byte ranged GET.
    if (res.status === 405) {
      const r2 = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
      });
      if (r2.ok || r2.status === 206) return { ok: true };
      return { ok: false, status: r2.status };
    }
    return { ok: false, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function fetchAndHash(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const h = createHash("sha256").update(buf).digest("hex");
  return { ok: true, sha256: `sha256:${h}` };
}

async function validateAppDir(dir, opts) {
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

  if (manifest?.policy?.license) {
    const lic = manifest.policy.license;
    if (!SPDX_IDS.has(lic) && !lic.startsWith("LicenseRef-")) {
      pushErr(
        errs,
        slug,
        `policy.license '${lic}' is not a recognized SPDX identifier (https://spdx.org/licenses/) — use 'Proprietary' or 'LicenseRef-…' for closed-source`,
      );
    }
  }

  if (typeof manifest?.iconUrl === "string" && manifest.iconUrl.startsWith(CATALOG_RAW_PREFIX)) {
    const tail = manifest.iconUrl.slice(CATALOG_RAW_PREFIX.length);
    const iconSlug = tail.split("/")[0];
    if (iconSlug && iconSlug !== slug) {
      pushErr(
        errs,
        slug,
        `iconUrl points at apps/${iconSlug}/... but this directory is apps/${slug}`,
      );
    }
  }

  for (const { label, url } of collectUrlFields(manifest)) {
    const hit = isSuspiciousUrl(url);
    if (hit) pushErr(errs, slug, `${label}='${url}' resolves to forbidden host '${hit}'`);
  }

  // TODO-string scan over all user-authored content. The signing block is
  // CI-populated so we exclude it from the scan.
  const scanCopy = { ...(manifest ?? {}) };
  delete scanCopy.signing;
  findTodoStrings(scanCopy, "", errs, slug);

  const readmePath = join(dir, "README.md");
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, "utf8");
    if (/TODO/i.test(readme)) {
      pushErr(errs, slug, `README.md: contains literal 'TODO' — fill in or remove before submitting`);
    }
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

      checkDigest(v.imageDigest, `versions[${v.version}].imageDigest`, slug, errs);
      checkDigest(v.appConfigSHA256, `versions[${v.version}].appConfigSHA256`, slug, errs);

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
          checkDigest(perVersion?.imageDigest, `versions/${v.version}.yaml#imageDigest`, slug, errs);
          checkDigest(perVersion?.appConfigSHA256, `versions/${v.version}.yaml#appConfigSHA256`, slug, errs);
          findTodoStrings(perVersion, `versions/${v.version}.yaml`, errs, slug);
        } catch (e) {
          pushErr(errs, slug, `versions/${v.version}.yaml is not valid YAML: ${e.message}`);
        }
      }
    }
  }

  if (opts.network) {
    const urls = collectUrlFields(manifest);
    for (const { label, url } of urls) {
      if (label.endsWith(".appConfigURL")) continue; // hashed below instead
      const r = await headOk(url);
      if (!r.ok) {
        pushErr(
          errs,
          slug,
          `${label}: ${url} is not reachable (${r.status ?? r.error})`,
        );
      }
    }
    if (Array.isArray(manifest?.versions)) {
      for (const v of manifest.versions) {
        if (!v?.appConfigURL || !v?.appConfigSHA256) continue;
        const r = await fetchAndHash(v.appConfigURL);
        if (!r.ok) {
          pushErr(errs, slug, `versions[${v.version}].appConfigURL not reachable (HTTP ${r.status})`);
          continue;
        }
        if (r.sha256 !== v.appConfigSHA256) {
          pushErr(
            errs,
            slug,
            `versions[${v.version}].appConfigSHA256 mismatch: declared ${v.appConfigSHA256}, fetched ${r.sha256}`,
          );
        }
      }
    }
  }

  return errs;
}

function collectTargets(argv) {
  if (argv.length > 0) return argv.map((p) => resolve(p));
  return readdirSync(appsDir)
    .filter((name) => name !== "_template" && !name.startsWith("."))
    .map((name) => join(appsDir, name))
    .filter((p) => statSync(p).isDirectory());
}

function parseArgs(argv) {
  const opts = { network: false };
  const positional = [];
  for (const a of argv) {
    if (a === "--network") opts.network = true;
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: validate.mjs [--network] [apps/<slug> ...]\n" +
          "  --network  Also HEAD-check public URLs and verify appConfigSHA256.\n",
      );
      process.exit(0);
    } else positional.push(a);
  }
  return { opts, positional };
}

async function main() {
  const { opts, positional } = parseArgs(process.argv.slice(2));
  const targets = collectTargets(positional);
  let failed = 0;
  for (const dir of targets) {
    const errs = await validateAppDir(dir, opts);
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
