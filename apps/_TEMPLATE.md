# Adding a listing to the Moses App Catalog

This catalog mirrors the layout it expects on disk: every app lives under

```
apps/<category>/<subcategory>/<slug>/
  manifest.yaml
  icon.svg            (optional)
  README.md           (optional)
  versions/
    v1.0.0.yaml       (filename = the literal git tag)
    v1.0.1.yaml
    ...
```

Allowed `<category>` and `<subcategory>` values are listed in
[`categories.yaml`](../categories.yaml) at the repo root. The validator
rejects manifests that pick a value outside that list — open a PR against
`categories.yaml` first if your domain isn't covered.

## Quick start

1. Copy the template directory into the right slot:
   ```sh
   cp -R apps/_template/your-app-slug \
         apps/<category>/<subcategory>/<your-slug>/
   ```
2. Edit every `TODO` in `manifest.yaml`. CI rejects unedited templates.
3. Replace the placeholder `versions/v0.1.0.yaml` with one that matches
   a real tag in your source repo. The filename **must** equal the `tag`
   field literally (`v1.0.0.yaml` ⟺ `tag: v1.0.0`).
4. Make sure your source repo has a `LICENSE` / `LICENSE.md` / `COPYING`
   file at the root with a valid SPDX identifier — the validator pulls
   it down and checks during `make test --network`.
5. Run `make test` (offline) for a fast sanity check, then
   `make test --network` for the full validation.
6. Open a PR. Maintainers review, merge, and Moses instances pick up
   the new listing on their next 6h sync.

## Plain-English UX in the wizard

The Moses Marketplace wizard handles steps 1-3 automatically when a user
clicks "Suggest an app" from inside Moses — they never need to know that
"send for review" means "open a pull request" or that "Sign in" means
"OAuth into your git provider". The catalog repo is the source of truth
either way.

## See also

- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the full contributor flow
- [`schema/manifest.schema.json`](../schema/manifest.schema.json) — field-level rules
- [`schema/version.schema.json`](../schema/version.schema.json) — per-version rules
