#!/usr/bin/env node
/**
 * Schema + semantic validator for the moses-app-catalog (git-native model).
 *
 * Layout:  apps/<category>/<subcategory>/<slug>/manifest.yaml
 *                                              /versions/<tag>.yaml
 *
 * Offline (default):
 *   - JSON Schema validation (manifest.schema.json + version.schema.json)
 *   - SPDX license check (scripts/data/spdx-license-ids.json)
 *   - TODO-string scan in user-authored fields
 *   - Per-version file existence; filename literal-equals `tag` field
 *   - No private/loopback hosts in repositoryUrl
 *   - No duplicate versions
 *   - releasedAt parses as RFC3339; warn if future-dated
 *   - category + subcategory exist in categories.yaml
 *
 * Network (--network):
 *   - For each version: `git ls-remote` confirms the tag exists upstream
 *   - Shallow clone at the tag, assert HEAD SHA equals declared `commit`
 *   - LICENSE / COPYING file exists at upstream repo root
 *   - Best-effort SPDX-License-Identifier extraction; if found, must match
 *     policy.license (warn-only when missing — many real LICENSE files
 *     omit the SPDX header).
 *
 * Usage:
 *   node scripts/validate.mjs [--network] [apps/<cat>/<sub>/<slug> ...]
 */
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appsDir = join(repoRoot, "apps");
const schemaDir = join(repoRoot, "schema");
const dataDir = join(repoRoot, "scripts", "data");
const categoriesPath = join(repoRoot, "categories.yaml");

const manifestSchema = JSON.parse(
  readFileSync(join(schemaDir, "manifest.schema.json"), "utf8"),
);
const versionSchema = JSON.parse(
  readFileSync(join(schemaDir, "version.schema.json"), "utf8"),
);

const SPDX_IDS = new Set([
  ...JSON.parse(readFileSync(join(dataDir, "spdx-license-ids.json"), "utf8")),
  ...JSON.parse(readFileSync(join(dataDir, "spdx-deprecated.json"), "utf8")),
  "Proprietary",
  "LicenseRef-Proprietary",
]);

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats.default ? addFormats.default(ajv) : addFormats(ajv);
const validateManifest = ajv.compile(manifestSchema);
const validateVersion = ajv.compile(versionSchema);

const SUSPICIOUS_HOSTS = new Set(["localhost", "0.0.0.0", "::1"]);
const PRIVATE_IP_RE = [
  /^127(\.|$)/,
  /^10(\.|$)/,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
];

const RFC3339_RE =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

const SHA40_RE = /^[0-9a-f]{40}$/;
const LICENSE_FILENAMES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "COPYING.md"];

const categoriesAllowList = loadCategories(categoriesPath);

let sharedTmpRoot = null;
function getSharedTmpRoot() {
  // One tmpdir per validator run keeps shallow clones cheap to clean up
  // (single rm -rf at exit) and avoids leaking dirs on Ctrl-C in CI.
  if (!sharedTmpRoot) {
    sharedTmpRoot = mkdtempSync(join(tmpdir(), "mp-validate-"));
  }
  return sharedTmpRoot;
}

function cleanupTmp() {
  if (sharedTmpRoot) {
    try {
      rmSync(sharedTmpRoot, { recursive: true, force: true });
    } catch {
      // best-effort
    }
    sharedTmpRoot = null;
  }
}

process.on("exit", cleanupTmp);
process.on("SIGINT", () => {
  cleanupTmp();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanupTmp();
  process.exit(143);
});

function loadCategories(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    process.stderr.write(`fatal: cannot read categories.yaml: ${e.message}\n`);
    process.exit(2);
  }
  let data;
  try {
    data = YAML.parse(raw);
  } catch (e) {
    process.stderr.write(`fatal: categories.yaml is not valid YAML: ${e.message}\n`);
    process.exit(2);
  }
  if (!data?.categories || typeof data.categories !== "object") {
    process.stderr.write(`fatal: categories.yaml missing top-level 'categories' map\n`);
    process.exit(2);
  }
  const allow = new Map();
  for (const [cat, body] of Object.entries(data.categories)) {
    const subs = new Set(Object.keys(body?.subcategories ?? {}));
    allow.set(cat, subs);
  }
  return allow;
}

function isSuspiciousUrl(url) {
  if (typeof url !== "string") return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (SUSPICIOUS_HOSTS.has(host)) return host;
  for (const re of PRIVATE_IP_RE) {
    if (re.test(host)) return `private-ip(${host})`;
  }
  return null;
}

function findTodoStrings(value, path, errs, file) {
  if (typeof value === "string") {
    if (/TODO/i.test(value)) {
      errs.push(`${file}: ${path || "/"}: contains literal 'TODO' — fill in or remove before submitting`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => findTodoStrings(v, `${path}[${i}]`, errs, file));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      findTodoStrings(v, path ? `${path}.${k}` : k, errs, file);
    }
  }
}

function readYaml(path) {
  return YAML.parse(readFileSync(path, "utf8"));
}

function gitExec(args, opts = {}) {
  // Args go through execFileSync's argv array, never a shell string —
  // upstream-controlled tag/URL values cannot become shell metacharacters.
  return execFileSync("git", args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    timeout: 60_000,
    ...opts,
  });
}

function gitTagExistsUpstream(repoUrl, tag) {
  try {
    const out = gitExec(["ls-remote", "--tags", repoUrl, `refs/tags/${tag}`]);
    return out.trim().length > 0;
  } catch (e) {
    return { error: e.stderr?.toString() || e.message };
  }
}

function shallowCloneAtTag(repoUrl, tag, dest) {
  try {
    gitExec([
      "clone",
      "--depth=1",
      `--branch=${tag}`,
      "--filter=blob:none",
      "--quiet",
      repoUrl,
      dest,
    ]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.stderr?.toString() || e.message };
  }
}

function gitHeadSha(workdir) {
  try {
    return gitExec(["-C", workdir, "rev-parse", "HEAD"]).trim();
  } catch (e) {
    return null;
  }
}

function findLicenseFile(dir) {
  for (const name of LICENSE_FILENAMES) {
    const p = join(dir, name);
    if (existsSync(p)) return { name, path: p };
  }
  return null;
}

function extractSpdxId(licenseBody) {
  const m = licenseBody.match(/SPDX-License-Identifier:\s*([A-Za-z0-9.+\-]+)/);
  return m ? m[1] : null;
}

function relPath(p) {
  return p.startsWith(repoRoot) ? p.slice(repoRoot.length + 1) : p;
}

async function validateAppDir(dir, opts) {
  const errs = [];
  const warns = [];
  const slug = basename(dir);
  const manifestPath = join(dir, "manifest.yaml");
  const manifestRel = relPath(manifestPath);

  if (!existsSync(manifestPath)) {
    errs.push(`${relPath(dir)}: missing manifest.yaml`);
    return { errs, warns };
  }

  let manifest;
  try {
    manifest = readYaml(manifestPath);
  } catch (e) {
    errs.push(`${manifestRel}: not valid YAML: ${e.message}`);
    return { errs, warns };
  }

  if (!validateManifest(manifest)) {
    for (const err of validateManifest.errors ?? []) {
      errs.push(`${manifestRel}: schema ${err.instancePath || "/"} ${err.message}`);
    }
  }

  if (manifest?.toolKey && manifest.toolKey !== slug) {
    errs.push(`${manifestRel}: toolKey '${manifest.toolKey}' must equal directory name '${slug}'`);
  }

  // Directory path: apps/<category>/<subcategory>/<slug>
  const segs = dir.slice(appsDir.length + 1).split(sep);
  if (segs.length === 3) {
    const [pathCat, pathSub] = segs;
    if (manifest?.category && manifest.category !== pathCat) {
      errs.push(`${manifestRel}: category '${manifest.category}' does not match directory '${pathCat}'`);
    }
    if (manifest?.subcategory && manifest.subcategory !== pathSub) {
      errs.push(`${manifestRel}: subcategory '${manifest.subcategory}' does not match directory '${pathSub}'`);
    }
  }

  if (manifest?.category) {
    if (!categoriesAllowList.has(manifest.category)) {
      errs.push(
        `${manifestRel}: category '${manifest.category}' is not listed in categories.yaml`,
      );
    } else if (manifest?.subcategory) {
      const subs = categoriesAllowList.get(manifest.category);
      if (!subs.has(manifest.subcategory)) {
        errs.push(
          `${manifestRel}: subcategory '${manifest.subcategory}' is not listed under category '${manifest.category}' in categories.yaml`,
        );
      }
    }
  }

  if (manifest?.repositoryType && manifest?.repositoryUrl) {
    const u = manifest.repositoryUrl.toLowerCase();
    if (manifest.repositoryType === "github" && !u.includes("github.com")) {
      errs.push(`${manifestRel}: repositoryType=github but repositoryUrl is not on github.com`);
    }
    if (manifest.repositoryType === "gitlab" && !u.includes("gitlab")) {
      errs.push(`${manifestRel}: repositoryType=gitlab but repositoryUrl hostname does not contain 'gitlab'`);
    }
  }

  if (manifest?.policy?.license) {
    const lic = manifest.policy.license;
    if (!SPDX_IDS.has(lic) && !lic.startsWith("LicenseRef-")) {
      errs.push(
        `${manifestRel}: policy.license '${lic}' is not a recognized SPDX identifier (https://spdx.org/licenses/) — use 'Proprietary' or 'LicenseRef-…' for closed-source`,
      );
    }
  }

  const repoHostHit = isSuspiciousUrl(manifest?.repositoryUrl);
  if (repoHostHit) {
    errs.push(`${manifestRel}: repositoryUrl='${manifest.repositoryUrl}' resolves to forbidden host '${repoHostHit}'`);
  }

  findTodoStrings(manifest, "", errs, manifestRel);

  const readmePath = join(dir, "README.md");
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, "utf8");
    if (/TODO/i.test(readme)) {
      errs.push(`${relPath(readmePath)}: contains literal 'TODO' — fill in or remove before submitting`);
    }
  }

  const versionsDir = join(dir, "versions");
  let versionFiles = [];
  if (existsSync(versionsDir)) {
    versionFiles = readdirSync(versionsDir).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
    );
  }

  if (versionFiles.length === 0) {
    errs.push(`${relPath(versionsDir)}: at least one per-version file is required`);
  }

  const seenTags = new Set();
  for (const fname of versionFiles) {
    const vPath = join(versionsDir, fname);
    const vRel = relPath(vPath);
    let v;
    try {
      v = readYaml(vPath);
    } catch (e) {
      errs.push(`${vRel}: not valid YAML: ${e.message}`);
      continue;
    }

    if (!validateVersion(v)) {
      for (const err of validateVersion.errors ?? []) {
        errs.push(`${vRel}: schema ${err.instancePath || "/"} ${err.message}`);
      }
    }

    const expectedFname = v?.tag ? `${v.tag}.yaml` : null;
    if (expectedFname && fname !== expectedFname) {
      errs.push(
        `${vRel}: tag mismatch (file is named '${fname}' but tag field is '${v.tag}'); rename file to '${expectedFname}' or fix the tag`,
      );
    }

    if (v?.tag) {
      if (seenTags.has(v.tag)) {
        errs.push(`${vRel}: duplicate tag '${v.tag}' across version files`);
      }
      seenTags.add(v.tag);
    }

    if (v?.releasedAt) {
      if (!RFC3339_RE.test(v.releasedAt)) {
        errs.push(`${vRel}: releasedAt '${v.releasedAt}' is not a valid RFC3339 timestamp`);
      } else {
        const t = Date.parse(v.releasedAt);
        if (Number.isNaN(t)) {
          errs.push(`${vRel}: releasedAt '${v.releasedAt}' is not a valid date-time`);
        } else if (t > Date.now() + 60_000) {
          warns.push(`${vRel}: releasedAt '${v.releasedAt}' is in the future`);
        }
      }
    }

    findTodoStrings(v, "", errs, vRel);

    if (opts.network && v?.tag && manifest?.repositoryUrl) {
      const netErrs = await runNetworkChecks({
        manifest,
        version: v,
        vRel,
      });
      errs.push(...netErrs.errs);
      warns.push(...netErrs.warns);
    }
  }

  return { errs, warns };
}

async function runNetworkChecks({ manifest, version, vRel }) {
  const errs = [];
  const warns = [];
  const repoUrl = manifest.repositoryUrl;
  const tag = version.tag;
  const declaredCommit = version.commit;

  const tagCheck = gitTagExistsUpstream(repoUrl, tag);
  if (tagCheck === false) {
    errs.push(`${vRel}: tag '${tag}' not found in upstream repo ${repoUrl}`);
    return { errs, warns };
  }
  if (tagCheck && tagCheck.error) {
    errs.push(`${vRel}: git ls-remote ${repoUrl} failed: ${tagCheck.error.split("\n")[0]}`);
    return { errs, warns };
  }

  const cloneRoot = getSharedTmpRoot();
  const cloneDest = mkdtempSync(join(cloneRoot, `clone-${manifest.toolKey}-`));
  rmSync(cloneDest, { recursive: true, force: true });

  const clone = shallowCloneAtTag(repoUrl, tag, cloneDest);
  if (!clone.ok) {
    errs.push(`${vRel}: shallow clone of ${repoUrl}@${tag} failed: ${clone.error.split("\n")[0]}`);
    return { errs, warns };
  }

  const head = gitHeadSha(cloneDest);
  if (!head) {
    errs.push(`${vRel}: could not resolve HEAD in shallow clone of ${repoUrl}@${tag}`);
  } else if (!SHA40_RE.test(head)) {
    errs.push(`${vRel}: HEAD '${head}' is not a 40-char hex SHA`);
  } else if (declaredCommit && head !== declaredCommit) {
    errs.push(
      `${vRel}: commit mismatch — declared '${declaredCommit}' but ${repoUrl}@${tag} resolves to '${head}'`,
    );
  }

  const lic = findLicenseFile(cloneDest);
  if (!lic) {
    errs.push(
      `${vRel}: no LICENSE / LICENSE.md / LICENSE.txt / COPYING / COPYING.md found at the root of ${repoUrl}@${tag}`,
    );
  } else if (manifest?.policy?.license) {
    let body;
    try {
      body = readFileSync(lic.path, "utf8");
    } catch {
      body = "";
    }
    const spdx = extractSpdxId(body);
    if (spdx === null) {
      warns.push(
        `${vRel}: ${lic.name} in ${repoUrl}@${tag} has no SPDX-License-Identifier header (cannot cross-check policy.license='${manifest.policy.license}')`,
      );
    } else if (spdx !== manifest.policy.license) {
      errs.push(
        `${vRel}: SPDX mismatch — manifest policy.license='${manifest.policy.license}' but ${lic.name} declares '${spdx}'`,
      );
    }
  }

  return { errs, warns };
}

function isAppDir(p) {
  if (!statSync(p).isDirectory()) return false;
  return existsSync(join(p, "manifest.yaml"));
}

function collectTargets(positional) {
  if (positional.length > 0) {
    return positional.map((p) => resolve(p));
  }
  const out = [];
  if (!existsSync(appsDir)) return out;
  for (const cat of readdirSync(appsDir)) {
    if (cat === "_template" || cat.startsWith(".")) continue;
    const catPath = join(appsDir, cat);
    if (!statSync(catPath).isDirectory()) continue;
    for (const sub of readdirSync(catPath)) {
      if (sub.startsWith(".")) continue;
      const subPath = join(catPath, sub);
      if (!statSync(subPath).isDirectory()) continue;
      for (const slug of readdirSync(subPath)) {
        if (slug.startsWith(".")) continue;
        const slugPath = join(subPath, slug);
        if (isAppDir(slugPath)) out.push(slugPath);
      }
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: validate.mjs [--network] [apps/<category>/<subcategory>/<slug> ...]",
      "",
      "  --network   Verify each version's tag exists upstream, that the declared",
      "              commit SHA matches `git rev-parse <tag>`, and that a LICENSE",
      "              file exists at the source repo root. Requires `git` on PATH.",
      "  --help, -h  Show this help.",
      "",
      "Without targets, all listings under apps/* (except _template) are validated.",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const opts = { network: false };
  const positional = [];
  for (const a of argv) {
    if (a === "--network") opts.network = true;
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else if (a.startsWith("--")) {
      process.stderr.write(`unknown flag: ${a}\n`);
      printHelp();
      process.exit(2);
    } else {
      positional.push(a);
    }
  }
  return { opts, positional };
}

async function main() {
  const { opts, positional } = parseArgs(process.argv.slice(2));
  const targets = collectTargets(positional);

  if (targets.length === 0) {
    process.stdout.write("no listings to validate (apps/* is empty)\n");
    return;
  }

  let failed = 0;
  let totalWarns = 0;
  for (const dir of targets) {
    const rel = relPath(dir);
    const { errs, warns } = await validateAppDir(dir, opts);
    for (const w of warns) process.stdout.write(`WARN ${w}\n`);
    totalWarns += warns.length;
    if (errs.length === 0) {
      process.stdout.write(`ok   ${rel}\n`);
    } else {
      failed++;
      for (const e of errs) process.stdout.write(`FAIL ${e}\n`);
    }
  }

  if (failed > 0) {
    process.stderr.write(`\n${failed} listing(s) failed validation`);
    if (totalWarns > 0) process.stderr.write(` (${totalWarns} warning(s))`);
    process.stderr.write("\n");
    process.exit(1);
  }
  process.stdout.write(
    `\nall ${targets.length} listing(s) passed${totalWarns > 0 ? ` (${totalWarns} warning(s))` : ""}\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.stack || e.message}\n`);
  process.exit(2);
});
