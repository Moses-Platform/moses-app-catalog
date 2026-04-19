# Contributing to moses-app-catalog

Thanks for helping grow the Moses app ecosystem. This repo is the **public
manifest registry** for apps that Moses platform instances can install. It
holds only metadata — no code, no binaries. Review happens here; delivery
happens over each app's own OCI registry.

There are three supported submission paths. All share the same schema, the same
CI, and the same maintainer review. **There is no fast-track** — nobody bypasses
review, not even the Moses team's own listings.

- [Path A — Direct GitHub PR](#path-a--direct-github-pr) (GitHub-native, open source)
- [Path B — Moses UI publish wizard](#path-b--moses-ui-publish-wizard) (platform-native, open source)
- [Path C — Closed-source listing](#path-c--closed-source-listing-helm--image-only) (Helm chart + image only, no source repo)

> **Why these paths, and why this design?** See the
> [Design rationale](#design-rationale-two-paths-no-intake-service) section
> at the bottom for the reasoning and the alternatives we rejected.

## Before you start

1. Read [GOVERNANCE.md](GOVERNANCE.md) so you know how decisions are made and
   how delisting works.
2. Read the [Code of Conduct](CODE_OF_CONDUCT.md).
3. Make sure your app has a **publicly reachable source repository** on GitHub
   or GitLab, a Dockerfile, and a `moses-app.config.json` at a stable URL.
4. Make sure your container image is published to a **public OCI registry** and
   you have the `sha256:` digest of the exact release you want listed. **Tags
   are not accepted**; digests only. Tags mutate, digests do not.

## Path A — Direct GitHub PR

This path is for developers who already work with GitHub.

### 1. Fork and clone

```bash
gh repo fork moses-platform/moses-app-catalog --clone
cd moses-app-catalog
```

### 2. Copy the template

```bash
cp -R apps/_template apps/your-app-slug
```

The directory name **must** equal the `toolKey` you will set in `manifest.yaml`
(lowercase, starts with a letter, alphanumerics plus `-` and `_`, up to 100
chars). CI rejects mismatches.

### 3. Fill in the manifest

Edit `apps/your-app-slug/manifest.yaml`. The template is exhaustively commented;
every field is documented inline. Required fields are enforced by
[`schema/manifest.schema.json`](schema/manifest.schema.json).

Add a per-version file at `apps/your-app-slug/versions/1.0.0.yaml` (or whatever
your first published version is). The `versions[]` array in the manifest and
the file list under `versions/` must stay in lockstep — CI checks both.

Put a square icon at `apps/your-app-slug/icon.svg` (SVG preferred) or reference
an external HTTPS URL via `iconUrl`. **No PNG/JPG screenshots committed to this
repo** — they bloat git history. Host screenshots elsewhere (the app's own
repo, an S3-style bucket, imgur, etc.) and reference them via `screenshotUrls`.

### 4. Validate locally

```bash
make install   # once
make test      # runs schema + semantic validation, then rebuilds index.json locally
```

If `make test` passes, CI will almost certainly pass too. The only CI-exclusive
checks are network-dependent ones (digest resolution, appConfig SHA
verification).

### 5. Open the PR

```bash
git checkout -b add-your-app-slug
git add apps/your-app-slug
git commit -m "Add your-app-slug to catalog"
git push -u origin add-your-app-slug
gh pr create --fill
```

Fill out the PR template checklist honestly. CODEOWNERS will auto-assign
reviewers based on the directory path.

## Path B — Moses UI publish wizard

> **Status: platform-side implementation not yet landed.** This section
> documents the contract so it can be built; the wizard itself does not exist
> in Moses yet. Path A is the only currently-working route.

This path is for developers who have already deployed and tested an app inside
their Moses instance as a `workspace_tool` and want to publish it to the public
catalog without leaving the Moses UI.

### Prerequisites (user-facing)

- You have a GitHub account (see the auth rationale below).
- Your app has been deployed at least once in your Moses instance and has at
  least one successful Kaniko build whose image digest is available. The
  wizard will refuse to proceed if these preconditions fail.
- Your Moses role has `marketplace:submit` permission.

### Wizard flow (as the user sees it)

1. **AppsPage → App Store tab →** a new button **"Publish to Public Catalog"**
   appears next to the existing **"Publish to Local Marketplace"** action.
2. The wizard opens a multi-step dialog:
   - Step 1: **Pre-filled review.** Moses reads your deployed app's config and
     pre-fills `toolKey`, `displayName`, `description`, `repositoryUrl`,
     `appType`, `dockerfilePath`, `buildContext`, and `helmChartPath` from the
     `workspace_tool_registry` and `workspace_tool_deployments` tables.
   - Step 2: **Long description, category, tags, maintainer contact.** These
     have no good source of truth in the platform DB, so you fill them in.
   - Step 3: **Screenshots & icon.** You paste HTTPS URLs (hosted on your own
     repo or object storage). Moses does not upload binaries on your behalf —
     the catalog explicitly rejects binary blobs.
   - Step 4: **Version details.** `imageDigest` is pulled automatically from
     the last successful build; `appConfigURL` and its SHA are computed from
     the currently-deployed config.
   - Step 5: **License & policy.** SPDX license, privacy policy URL, support
     contact.
   - Step 6: **Monetization.** `free` or a paid model; for paid models Moses
     asks the license server for a `licenseServerListingId`.
   - Step 7: **GitHub sign-in.** Moses triggers the
     [GitHub OAuth device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow).
     You approve in a browser tab; Moses gets a scoped token (`public_repo`).
   - Step 8: **Preflight validation.** Moses runs the same `validate.mjs` script
     locally against the assembled manifest — failures are surfaced inline with
     the field that caused them.
   - Step 9: **Submit.** Moses forks this repo under your GitHub account (if no
     fork exists), commits the files, and opens a PR. The PR URL is shown in
     the UI and attached to your workspace_tool record.
3. **After submission — how Moses tracks the PR for you.** You do not need to
   leave the Moses UI to see what happens next. The submission is linked to
   your `workspace_tool_deployments` row via a new
   `catalog_submission_id` foreign key, and the **"Publish to Public Catalog"**
   button on the app card becomes a **"View Catalog Submission"** status
   button. Clicking it opens a drawer that shows the live PR state:

   | Status        | What it means                                           | What you see in Moses                                      |
   |---------------|---------------------------------------------------------|------------------------------------------------------------|
   | `opened`      | PR is open; CI has not finished yet                     | Blue badge, "Under review" label, link to GitHub PR        |
   | `ci_running`  | CI validation is executing                              | Blue badge with spinner, last-checked timestamp            |
   | `ci_failed`   | `validate-pr.yml` failed; a reviewer will NOT look      | Red badge; the CI error lines are streamed into the drawer |
   | `changes_requested` | A maintainer asked for edits via GitHub review    | Amber badge; the review comment is surfaced inline         |
   | `merged`      | PR merged; your listing will appear on the next sync    | Green badge, est. time until public visibility (~6h)       |
   | `closed`      | PR closed without merging                               | Grey badge; close reason (if any) shown                    |

   Under the hood, Moses polls `GET /api/v1/marketplace/catalog-submissions/:id`
   every 60 seconds while the drawer is open and every 10 minutes in the
   background when it isn't. The poll hits GitHub once per cycle
   (`gh pr view` / `gh pr checks`); results are cached server-side so multiple
   browser tabs don't amplify rate-limit consumption. When the PR state
   transitions, a notification appears in your Moses notification panel — you
   don't have to keep the drawer open to get notified.

   If you close the Moses browser tab and come back a week later, the drawer
   still works: the PR URL and last-known state live on the
   `workspace_tool_deployments` row, not in ephemeral browser state.

   CI runs the same validation as Path A. **No reviewer sees your PR until
   CI is green** — the validate-pr workflow is a required check.

### Canonical `toolKey` contract

The catalog's `toolKey` field is the single source of truth for the slug
shape. Other repos that touch the same value must conform to it:

| Repo                  | Field / column         | Constraint                  |
|-----------------------|------------------------|-----------------------------|
| moses-app-catalog     | `manifest.toolKey`     | `^[a-z][a-z0-9_-]{1,99}$`, max 100 chars |
| moses-platform-prep   | `community_marketplace_tools.tool_key` | should match the above; older rows with uppercase/leading-digit slugs need normalization before publishing to the catalog |
| moses-license-server  | `marketplace_apps.app_slug` | already enforces lowercase via a CHECK constraint; uses `(seller_id, app_slug)` for uniqueness |

If you publish from the Moses UI (Path B) and the wizard rejects your slug,
that is the canonical regex pushing back — pick a slug that satisfies it
on first try.

### Catalog → platform field mapping

The catalog's `manifest.yaml` uses `camelCase`; the platform's
`community_marketplace_tools` table uses `snake_case`. The mapping is
intentionally direct:

| Catalog field                | Platform column          | Notes |
|------------------------------|--------------------------|-------|
| `toolKey`                    | `tool_key`               | identity |
| `displayName`                | `display_name`           |       |
| `description`                | `description`            |       |
| `longDescription`            | `long_description`       |       |
| `repositoryUrl`              | `repository_url`         | Paths A/B only |
| `repositoryType`             | `repository_type`        | adds `oci` for Path C |
| `defaultBranch`              | `default_branch`         |       |
| `category`                   | `category`               |       |
| `tags`                       | `tags`                   | array |
| `dockerfilePath`             | `dockerfile_path`        |       |
| `buildContext`               | `build_context`          |       |
| `helmChartPath`              | `helm_chart_path`        | source-repo path |
| `helmChartRef`               | `helm_chart_ref`         | OCI ref (Path C) |
| `helmChartVersion`           | `helm_chart_version`     | (Path C) |
| `appType`                    | `app_type`               |       |
| `iconUrl`                    | `icon_url`               |       |
| `screenshotUrls`             | `screenshot_urls`        | array |
| `documentationUrl`           | `documentation_url`      |       |
| `versions[].imageDigest`     | `image_digest`           | latest non-yanked |
| `monetization.model`         | `pricing_model`          |       |

Platform-local fields that the catalog deliberately does **not** populate
(each Moses instance maintains them locally — never sync them from the
catalog): `submitted_by`, `submitted_at`, `reviewed_by`, `reviewed_at`,
`review_notes`, `status`, `is_featured`, `is_default`, `featured_order`,
`install_count`, `rating_avg`, `rating_count`.

### Platform-side API contract

These are the Moses HTTP endpoints that the wizard needs. **They do not exist
yet** — this is the specification for the platform repo to implement. The
endpoints live on each Moses instance, not on a Moses-operated service.

```http
POST /api/v1/marketplace/catalog-submissions
Content-Type: application/json
Authorization: Bearer <user session>

{
  "manifest":       { ...manifest.yaml fields as JSON... },
  "versionEntry":   { "version": "1.0.0", "imageDigest": "sha256:...", ... },
  "readme":         "<markdown body for apps/<slug>/README.md>",
  "iconUrl":        "https://raw.githubusercontent.com/me/app/main/icon.svg",
  "screenshotUrls": ["https://..."],
  "githubAccount":  { "installationToken": "ghu_..." }
}

→ 202 Accepted
{
  "id":     "<submission uuid>",
  "prUrl":  "https://github.com/moses-platform/moses-app-catalog/pull/123",
  "status": "opened"
}
```

```http
GET /api/v1/marketplace/catalog-submissions/:id
→ 200 OK
{
  "id":       "<submission uuid>",
  "prUrl":    "...",
  "status":   "opened" | "ci_running" | "ci_failed"
            | "changes_requested" | "merged" | "closed",
  "ciStatus": "pending" | "success" | "failure",
  "ciFailureSummary": "validate.mjs: versions[0].imageDigest must match sha256:...",
  "latestReviewComment": "Please add a privacyPolicy URL before we can merge.",
  "lastCheckedAt": "2026-04-19T12:00:00Z"
}
```

The backend resolves `status` from GitHub's `pr state` + `pr checks` + `pr reviews`:
- `closed && !merged`                        → `closed`
- `merged`                                   → `merged`
- latest review is `CHANGES_REQUESTED`       → `changes_requested`
- `checks.status == "failure"`               → `ci_failed`
- `checks.status == "in_progress"|"queued"`  → `ci_running`
- otherwise                                  → `opened`

The Moses instance stores the short-lived GitHub token in memory only (not in
the DB). The PR is opened **as the authenticated user**, not as a bot — this
is deliberate; see below.

### What this unlocks on the platform side

Implementing Path B means the platform team needs to ship, roughly:

- Frontend: `frontend/src/components/default-apps/app-store/PublishToCatalogWizard.tsx`.
- Backend: handlers in `backend/internal/api/catalog_submission_handlers.go`
  plus a `CatalogSubmissionService` that runs the GitHub OAuth device flow,
  forks the catalog repo via `gh` REST, and opens the PR.
- A schema entry (`backend/postgresql/schema/3xx_catalog_submissions.sql`)
  tracking submission IDs and their PR URLs so the UI can show status.
- An RBAC permission `marketplace:submit`.

Nothing in the moses-app-catalog repo needs to change for the wizard to work;
the contract between the two is just the existing PR flow.

## Path C — Closed-source listing (Helm + image only)

Some publishers ship commercial or otherwise proprietary software and do not
want to expose the source tree. Moses supports this, but the bar is
deliberately higher than for open-source listings, because reviewers cannot
audit what they cannot see.

### When to use Path C

Use Path C **only** if all of these apply:

- You cannot, or will not, publish your app's source code to a public GitHub
  or GitLab repository.
- You control a **public** OCI image registry that anonymously serves both
  the app image **and** a Helm chart for it.
- You are willing to have a reputation vetted by existing maintainers.

If any of those fail, use Path A or Path B instead.

### Trust requirements

Path C submissions must include a `trust` block in `manifest.yaml`. The schema
enforces the shape; maintainers enforce the substance. At minimum:

- **`statement`** — a markdown explanation of who you are, what you have
  already shipped (in the Moses ecosystem or in adjacent open-source work),
  and why source is not being published. Vague statements will be rejected.
- **`vouchedBy`** — at least two GitHub handles that are **already** listed
  in this repo's `CODEOWNERS` or are recognized moses-platform contributors.
  Vouchers are expected to have actually looked at the image and the chart
  and to have tested the app against a real Moses instance. Vouching is
  personal and revocable; names that appear on multiple vetted listings will
  not be quietly rubber-stamped.
- **`distributionType`** — `proprietary-binary`, `helm-only`, or
  `commercial`. This is surfaced in the App Store UI so Moses users
  understand what they are installing.
- **`priorWork`** — optional but strongly recommended. Links to previous
  moses-app-catalog PRs, moses-platform PRs, or adjacent open-source work
  that supports your statement.

### Technical requirements

Closed-source listings omit `repositoryUrl` and set `repositoryType: "oci"`.
Because there is no repo path for Moses instances to pull a chart from, you
must provide:

- **`helmChartRef`** — an `oci://` reference to a **public** Helm chart.
  Example: `oci://ghcr.io/acme-corp/myapp-chart`. Authenticated pulls are
  not supported during catalog sync.
- **`helmChartVersion`** — a pinned semver chart version. Tags are rejected
  for the same reason image tags are rejected: tags mutate, digests and
  pinned versions do not.
- **`versions[].imageDigest`** — `sha256:` digest of the app image, same as
  Paths A/B. No tags.

All other schema rules (maintainers, policy, license, screenshots hosted
externally, etc.) still apply.

### Submission flow

1. Fork and clone, as in Path A.
2. Create `apps/<your-slug>/manifest.yaml` **without** `repositoryUrl`, with
   `repositoryType: "oci"`, `helmChartRef`, `helmChartVersion`, and the
   `trust` block populated.
3. Write a meaningful `README.md` at `apps/<your-slug>/README.md`. This is
   the detail-page content users see in the App Store and is often the main
   thing reviewers use to decide whether to merge. Ambiguous or
   marketing-only READMEs will be rejected.
4. Before opening the PR, contact your chosen vouchers out of band and get
   them to confirm in writing that they have tested your image and chart
   against a real Moses instance. Post their confirmations as PR comments
   (they do not need to be PR review approvals — a plain comment is fine).
5. Open the PR with a body that explains the proprietary nature, links to
   your company or project, and points at the `priorWork` entries.
6. CI runs the same `validate.mjs` as for Paths A/B, plus an extra check
   that each `trust.vouchedBy` handle is recognized.

### What Path C is NOT

- It is **not** a bypass around review. If anything, maintainer review is
  stricter because there is less signal to work with.
- It is **not** a way to hide security issues. We will pull images, inspect
  layers, and run basic SBOM analysis on every closed-source submission.
- It is **not** a path to a private listing. Every app listed in this repo
  appears in every Moses instance's public App Store. There is no private
  registry feature in the catalog; if you need that, run a private catalog
  against your own instance (see [GOVERNANCE.md § Forking](GOVERNANCE.md#forking)).

## Shared checklist (all paths)

Every submission, regardless of path, must satisfy:

- [ ] `toolKey` matches the directory name.
- [ ] `repositoryUrl` is HTTPS and resolves to a public repo **(Paths A and B only)**.
- [ ] `helmChartRef` resolves publicly and `helmChartVersion` is pinned **(Path C only)**.
- [ ] `trust.vouchedBy` lists at least two recognized contributors **(Path C only)**.
- [ ] `imageDigest` is a real `sha256:` digest from a public OCI registry.
- [ ] `appConfigURL` is a stable HTTPS URL and its content hashes to
      `appConfigSHA256`.
- [ ] At least one maintainer has `role: owner` and a reachable contact.
- [ ] `policy.license` is a valid [SPDX identifier](https://spdx.org/licenses/).
- [ ] `mosesMinVersion` is set to the minimum Moses version you have tested
      against.
- [ ] No screenshots, PDFs, or other binary blobs committed. External URLs only.
- [ ] No secrets anywhere in the manifest or README.
- [ ] No local/loopback/RFC1918 hostnames in any URL.

## What happens after merge

1. `rebuild-and-sign.yml` runs on `main`: regenerates `index.json`, and if it
   changed, produces a keyless cosign signature (OIDC from GitHub Actions,
   signed cert from Fulcio, record in Rekor). Both the regenerated index and
   the signature bundle (`signatures/index.json.cosign-bundle`) are committed
   in a single push so they never drift apart.
2. Moses instances on their ~6h sync schedule pull both files, verify the
   signature, and upsert your entry into their `community_marketplace_tools`
   table.
3. Users of those Moses instances see your app in their App Store. The
   per-instance `install_count`, `rating_avg`, and `is_featured` fields are
   maintained locally by each instance and **never** by the catalog.

### Branch protection

`rebuild-and-sign.yml` pushes to `main` using the default `GITHUB_TOKEN`. By
default that token cannot bypass branch protection. Maintainers must pick one
of the following supported configurations before turning the repo public:

- **Allow-list the GitHub Actions bot.** Under
  *Settings → Branches → Branch protection rules → main*, add
  `github-actions[bot]` (and any deploy-bot used by maintainers) to the
  *"Allow specified actors to bypass required pull requests"* list. This is
  the recommended setup: human PRs still require review, but the catalog
  workflow can land its index/signature commits.
- **Use a GitHub App / PAT for the workflow push.** Replace the workflow's
  `secrets.GITHUB_TOKEN` with an App token whose installation is excepted
  from branch protection. Heavier to set up; useful when org policy forbids
  bot bypass at the repo level.
- **Leave `main` unprotected** and rely on CODEOWNERS-driven review for
  human PRs. Simplest, but loses defense against a maintainer accidentally
  pushing to `main` directly.

Without one of these, the first `apps/**` change after going public will
merge fine, the workflow will fail at the `git push` step, and the public
`index.json` + signature will silently fall behind.

## Updating an existing listing

Open a PR touching only `apps/<your-slug>/`. Typical updates:

- **New version.** Append a new entry to `manifest.yaml` `versions[]` and add
  the corresponding per-version file. Never rewrite or mutate previous
  versions — if you need to withdraw one, set `yanked: true` with a
  `yankedReason`.
- **Metadata tweak** (tags, description, screenshots): edit `manifest.yaml`.
  Bump nothing.
- **Delisting.** See [GOVERNANCE.md § Delisting](GOVERNANCE.md#delisting).

## Disqualifying conditions

Submissions will be rejected or existing listings delisted if any of:

- The app contains malware, cryptominers, or obvious data exfiltration.
- The app violates DMCA or any applicable law.
- The declared SPDX license is incompatible with the deployment context users
  are likely to put the app in (e.g. AGPL code presented as safe for
  proprietary SaaS).
- The app fails on any `mosesMinVersion` it claims to support.
- The app has known unpatched security vulnerabilities whose fixes the
  maintainer has been ignoring for more than 90 days.

Moderation decisions are made per [GOVERNANCE.md](GOVERNANCE.md).

## Design rationale (two paths, no intake service)

The spec that produced this contribution guide explicitly called out three
candidates for Path B's submission mechanism. We chose **B1 (GitHub OAuth
device flow)** as the v1. Here is the full trade-off:

- **B1 — GitHub OAuth device flow** *(chosen)*. PRs are authored by the human
  submitter's GitHub account. Attribution is correct out of the box. Review is
  normal. The downside — "you must have a GitHub account" — is acceptable
  because anyone publishing a public app to a public OCI registry effectively
  already has to have one.
- **B2 — Moses-hosted bot account (`@moses-app-catalog-bot`)** *(reserved as
  fallback)*. Useful if we later want zero-friction publishing for developers
  without GitHub accounts, but opens governance questions: who audits the bot,
  what does impersonation detection look like, how do we stop a tenant from
  spamming PRs? Documented so future us can build it without re-litigating; not
  implemented now.
- **B3 — Centralized intake API hosted by Siemer Industries** *(rejected)*.
  Defeats the decentralization premise of the repo. Any instance that can't
  reach the intake service can't publish; anyone who owns the intake service
  becomes a gatekeeper; it creates a single target for abuse and DDoS; it
  requires ops work on Siemer's side forever. Explicitly closed out.

We also considered a single "direct PR only" path. That works for GitHub-native
developers but abandons the users we are most trying to serve: the Moses-native
developer who built and tested their app entirely inside the platform and has
never touched git from a terminal. Path B exists for them.

All three paths share a single validator, a single schema, and a single
review queue. Path C's extra trust and vouching requirements live inside the
same schema and the same CI — there is no separate "closed-source pipeline"
that could drift. There is no "fast lane".

### Why Path C exists

We debated leaving it out entirely and saying "open source or nothing." In
practice, several of the most-requested Moses integrations are for
commercial products (BI tools, premium connectors, billing plugins) whose
vendors will not open-source them. Forcing those vendors to maintain a
private parallel catalog would fragment the ecosystem and leave Moses users
without a single place to discover installable apps. The trust-and-vouching
gate is the compromise: the catalog stays centralized, but closed-source
submissions carry a real reputational cost to the humans vouching for them,
which is the only cheap mechanism we have for "reviewers can't audit the
source code." If vouching turns out to be abused, we will tighten it
further (e.g. require staff-level maintainers only) or sunset Path C.
