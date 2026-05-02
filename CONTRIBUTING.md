# Contributing to moses-app-catalog

Thanks for helping grow the Moses app ecosystem. This repo is the **public
manifest registry** for apps that Moses platform instances can install. It
holds only metadata — no code, no binaries. Review happens here; the actual
software lives in each app's own source repository, which Moses clones and
builds inside each user's cluster.

There are two supported submission paths. Both share the same schema, the
same CI, and the same maintainer review. **There is no fast-track** —
nobody bypasses review, not even the Moses team's own listings.

- [Path A — Direct GitHub PR](#path-a--direct-github-pr) (GitHub-native)
- [Path B — Moses UI suggestion](#path-b--moses-ui-suggestion) (platform-native)

## Before you start

1. Read [GOVERNANCE.md](GOVERNANCE.md) so you know how decisions are made
   and how delisting works.
2. Read the [Code of Conduct](CODE_OF_CONDUCT.md).
3. Make sure your app has a **publicly reachable source repository** on
   GitHub or GitLab and that you have tagged the commit you want listed.
4. Make sure that source repository contains a `LICENSE` (or `COPYING`)
   file at its root. The validator checks for it; reviewers do too.

## Path A — Direct GitHub PR

This path is for developers who already work with GitHub.

### 1. Pick a category and subcategory

Open [`categories.yaml`](categories.yaml) at the root of this repo and pick
the `category` + `subcategory` keys that best describe your app. CI rejects
any combination that is not present in that file. If nothing fits well,
open an issue first to discuss adding a category — that is its own change.

### 2. Copy the template

```bash
cp -R apps/_template apps/<category>/<subcategory>/<your-app-slug>
```

The directory name **must** equal the `toolKey` you will set in
`manifest.yaml` (lowercase, starts with a letter, alphanumerics plus `-`
and `_`, up to 100 chars). CI rejects mismatches.

### 3. Fill in the manifest

Edit `apps/<category>/<subcategory>/<your-app-slug>/manifest.yaml`. The
template is exhaustively commented; every field is documented inline.
Required fields are enforced by
[`schema/manifest.schema.json`](schema/manifest.schema.json).

Add a per-version file at
`apps/<category>/<subcategory>/<your-app-slug>/versions/<tag>.yaml`. The
filename must literally equal the `tag` field inside — `v1.2.3.yaml` for
tag `v1.2.3`, or `1.2.3.yaml` if your repo uses bare semver. CI rejects
mismatches.

If you ship an icon, host it on the source repo at a commit-pinned raw URL
(e.g. `https://raw.githubusercontent.com/<org>/<repo>/<commit>/icon.svg`)
and reference it via `iconUrl`. Do **not** commit binary assets to this
repo — they bloat git history.

### 4. Validate locally

```bash
make install   # once
make test      # runs schema + semantic validation
```

If `make test` passes, CI will almost certainly pass too. The only
CI-exclusive checks are network-dependent ones (clone the source repo at
the declared tag, verify `git rev-parse <tag>` matches `commit`, look for
a `LICENSE` file at the root of the source repo).

### 5. Open the PR

```bash
git checkout -b add-<your-app-slug>
git add apps/<category>/<subcategory>/<your-app-slug>
git commit -m "Add <your-app-slug> to catalog"
git push -u origin add-<your-app-slug>
gh pr create --fill
```

Fill out the PR template checklist honestly. CODEOWNERS will auto-assign
reviewers based on the directory path.

## Path B — Moses UI suggestion

> **Status: platform-side implementation not yet landed.** This section
> documents the contract so it can be built; the wizard itself does not
> exist in Moses yet. Path A is the only currently-working route.

This path is for developers who built and tested an app inside their
Moses instance and want to share it with the public catalog without
leaving the Moses UI.

### What you need

- An app deployed at least once in your Moses instance. The wizard reads
  the deployment record to pre-fill the listing.
- Your Moses role grants the `marketplace:submit` permission.
- Your source repository is publicly reachable on GitHub or GitLab and
  contains a `LICENSE` file at its root.

### What the wizard asks you

1. **Pick a category.** Choose the category and subcategory that best
   match your app from the canonical list.
2. **Confirm the listing details.** Moses pre-fills the display name,
   description, source repository URL, and app type from your deployed
   app. Edit anything that needs polishing.
3. **Pick a tag.** Moses lists the tags it can see in your source
   repository and resolves each one to a commit. Pick the tag you want
   listed.
4. **License check.** Moses verifies that the source repository contains a
   `LICENSE` file at the pinned commit. If it does not, the wizard stops
   and asks you to add one before continuing.
5. **Sign in to GitHub.** Moses asks you to sign in once so it can submit
   the listing on your behalf.
6. **Save your suggestion and send for review.** Moses opens the listing
   for review against this repository. The wizard hands you a status link
   so you can follow along.

### How status appears in Moses

After you send your suggestion for review, the listing card in your Moses
instance shows a status badge that updates as reviewers act on it. The
states surfaced to you are:

| Status         | What it means                                                  |
|----------------|----------------------------------------------------------------|
| Submitted      | Your suggestion is open and waiting for review.                |
| Checking       | The catalog's automated checks are running.                    |
| Needs changes  | A reviewer asked for edits; the comment shows in Moses.        |
| Accepted       | Your listing was accepted; it appears on the next ~6h sync.    |
| Closed         | The suggestion was closed without being accepted.              |

Moses caches the latest status server-side so multiple browser tabs do
not amplify rate-limit consumption against GitHub.

### Canonical `toolKey` contract

The catalog's `toolKey` field is the single source of truth for the slug
shape. Other repos that touch the same value must conform to it:

| Repo                  | Field / column         | Constraint                                       |
|-----------------------|------------------------|--------------------------------------------------|
| moses-app-catalog     | `manifest.toolKey`     | `^[a-z][a-z0-9_-]{1,99}$`, max 100 chars         |
| moses-platform-prep   | `community_marketplace_tools.tool_key` | should match the above; older rows with uppercase/leading-digit slugs need normalization before publishing |
| moses-license-server  | `marketplace_apps.app_slug` | already enforces lowercase via a CHECK constraint; uses `(seller_id, app_slug)` for uniqueness |

If the Moses UI rejects your slug, that is the canonical regex pushing
back — pick a slug that satisfies it on first try.

### Catalog → platform field mapping

The catalog's `manifest.yaml` uses `camelCase`; the platform's
`community_marketplace_tools` table uses `snake_case`. The mapping is
intentionally direct:

| Catalog field                 | Platform column          | Notes                          |
|-------------------------------|--------------------------|--------------------------------|
| `toolKey`                     | `tool_key`               | identity                       |
| `displayName`                 | `display_name`           |                                |
| `description`                 | `description`            |                                |
| `appType`                     | `app_type`               |                                |
| `category`                    | `category`               |                                |
| `subcategory`                 | `subcategory`            |                                |
| `repositoryType`              | `repository_type`        |                                |
| `repositoryUrl`               | `repository_url`         |                                |
| `iconUrl`                     | `icon_url`               |                                |
| `policy.license`              | `license`                | SPDX identifier                |
| `versions[].tag`              | `version_tag`            | latest non-yanked              |
| `versions[].commit`           | `version_commit`         | latest non-yanked              |
| `versions[].mosesMinVersion`  | `moses_min_version`      | latest non-yanked              |

Platform-local fields that the catalog deliberately does **not** populate
(each Moses instance maintains them locally — never sync them from the
catalog): `submitted_by`, `submitted_at`, `reviewed_by`, `reviewed_at`,
`review_notes`, `status`, `is_featured`, `is_default`, `featured_order`,
`install_count`, `rating_avg`, `rating_count`.

## Shared checklist (all paths)

Every submission, regardless of path, must satisfy:

- [ ] Directory path is `apps/<category>/<subcategory>/<slug>/` and the
      `category` + `subcategory` keys are present in
      [`categories.yaml`](categories.yaml).
- [ ] `toolKey` matches the directory name.
- [ ] `repositoryUrl` is HTTPS and resolves to a public Git repository.
- [ ] Each `versions/<tag>.yaml` filename equals the `tag` field inside.
- [ ] The `commit` field matches `git rev-parse <tag>` against the source
      repository.
- [ ] The source repository contains a `LICENSE` (or `COPYING`) file at
      its root.
- [ ] At least one maintainer has `role: owner` and a reachable contact.
- [ ] `policy.license` is a valid [SPDX identifier](https://spdx.org/licenses/).
- [ ] `mosesMinVersion` is set to the minimum Moses version you have
      tested against.
- [ ] No screenshots, PDFs, or other binary blobs committed. External
      URLs only.
- [ ] No secrets anywhere in the manifest or README.
- [ ] No local/loopback/RFC1918 hostnames in any URL.

## What happens after merge

Moses instances pull on their next scheduled sync (~6h) and your listing
appears in their Marketplace tab. Each instance then uses the `tag` and
`commit` from your listing to clone your source repository and build the
image inside its own cluster.

## Updating an existing listing

Open a PR touching only `apps/<category>/<subcategory>/<your-slug>/`.
Typical updates:

- **New version.** Add a new file at `versions/<new-tag>.yaml` whose
  filename equals the new `tag`. Never rewrite or mutate previous
  versions — if you need to withdraw one, set `yanked: true` with a
  `yankedReason`.
- **Metadata tweak** (description, icon): edit `manifest.yaml`.
- **Delisting.** See [GOVERNANCE.md § Delisting](GOVERNANCE.md#delisting).

## Disqualifying conditions

Submissions will be rejected or existing listings delisted if any of:

- The app contains malware, cryptominers, or obvious data exfiltration.
- The app violates DMCA or any applicable law.
- The declared SPDX license is incompatible with the deployment context
  users are likely to put the app in (e.g. AGPL code presented as safe
  for proprietary SaaS).
- The app fails on any `mosesMinVersion` it claims to support.
- The app has known unpatched security vulnerabilities whose fixes the
  maintainer has been ignoring for more than 90 days.

Moderation decisions are made per [GOVERNANCE.md](GOVERNANCE.md).
