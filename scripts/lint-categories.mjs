#!/usr/bin/env node
/**
 * Linter for the canonical category allow-list at `categories.yaml`.
 *
 * Asserts:
 *   1. categories.yaml parses as YAML and has a top-level `categories` map.
 *   2. Every top-level category key is unique (YAML duplicate-key guard).
 *   3. Every subcategory key within a category is unique.
 *   4. Category keys match ^[a-z][a-z0-9-]{1,29}$
 *      (lowercase kebab-case, starts with a letter, 2-30 chars).
 *   5. Subcategory keys match the same pattern.
 *
 * The validator (MP-A3, scripts/validate.mjs) loads the same file to reject
 * manifests with unknown `category` or `subcategory` values; this lint script
 * keeps the allow-list itself well-formed.
 *
 * Usage:
 *   node scripts/lint-categories.mjs
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const categoriesPath = join(repoRoot, "categories.yaml");

const KEY_RE = /^[a-z][a-z0-9-]{1,29}$/;

function fail(errs) {
  for (const e of errs) process.stderr.write(`FAIL ${e}\n`);
  process.stderr.write(`\ncategories.yaml: ${errs.length} error(s)\n`);
  process.exit(1);
}

function main() {
  let raw;
  try {
    raw = readFileSync(categoriesPath, "utf8");
  } catch (e) {
    fail([`cannot read categories.yaml: ${e.message}`]);
  }

  // Parse with YAML.parseDocument so we can detect duplicate keys at the YAML
  // level — YAML.parse would silently let later duplicates win. Treat any
  // parse warning/error as fatal.
  const doc = YAML.parseDocument(raw, { prettyErrors: true });
  const errs = [];
  for (const e of doc.errors) errs.push(`yaml parse error: ${e.message}`);
  for (const w of doc.warnings) errs.push(`yaml warning: ${w.message}`);
  if (errs.length > 0) fail(errs);

  const data = doc.toJS();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    fail(["top-level value must be a mapping"]);
  }
  if (!data.categories || typeof data.categories !== "object" || Array.isArray(data.categories)) {
    fail(["missing or non-object top-level `categories` key"]);
  }

  // Re-scan the parsed Document for duplicate keys at each level. yaml's
  // default uniqueKeys check raises a warning, but we want a hard failure
  // and a precise error message.
  const categoriesNode = doc.get("categories", true);
  if (categoriesNode && categoriesNode.items) {
    const seenTop = new Set();
    for (const item of categoriesNode.items) {
      const key = String(item.key?.value ?? item.key);
      if (seenTop.has(key)) {
        errs.push(`duplicate top-level category key: '${key}'`);
      }
      seenTop.add(key);

      if (!KEY_RE.test(key)) {
        errs.push(
          `category key '${key}' does not match ^[a-z][a-z0-9-]{1,29}$ (lowercase kebab-case, 2-30 chars, starts with a letter)`,
        );
      }

      const value = item.value;
      if (!value || typeof value.get !== "function") {
        errs.push(`category '${key}': value must be a mapping`);
        continue;
      }

      const label = value.get("label");
      if (typeof label !== "string" || label.length === 0) {
        errs.push(`category '${key}': missing or empty 'label' string`);
      }

      const subsNode = value.get("subcategories", true);
      if (!subsNode || !subsNode.items) {
        errs.push(`category '${key}': missing 'subcategories' mapping`);
        continue;
      }

      const seenSub = new Set();
      for (const sub of subsNode.items) {
        const subKey = String(sub.key?.value ?? sub.key);
        if (seenSub.has(subKey)) {
          errs.push(`category '${key}': duplicate subcategory key '${subKey}'`);
        }
        seenSub.add(subKey);

        if (!KEY_RE.test(subKey)) {
          errs.push(
            `category '${key}': subcategory key '${subKey}' does not match ^[a-z][a-z0-9-]{1,29}$ (lowercase kebab-case, 2-30 chars, starts with a letter)`,
          );
        }

        const subLabel = sub.value?.value ?? sub.value;
        if (typeof subLabel !== "string" || subLabel.length === 0) {
          errs.push(
            `category '${key}': subcategory '${subKey}' must have a non-empty string label`,
          );
        }
      }
    }
  }

  if (errs.length > 0) fail(errs);

  const categoryCount = Object.keys(data.categories).length;
  const subcategoryCount = Object.values(data.categories).reduce(
    (n, c) => n + Object.keys(c?.subcategories ?? {}).length,
    0,
  );
  process.stdout.write(
    `ok categories.yaml: ${categoryCount} categor${categoryCount === 1 ? "y" : "ies"}, ${subcategoryCount} subcategor${subcategoryCount === 1 ? "y" : "ies"}\n`,
  );
}

main();
