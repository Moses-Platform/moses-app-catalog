# moses-app-catalog

> **Status: Preview — not yet consumed by Moses instances.**
> The schema and workflows are in place, but no production Moses instance is
> pulling from this repo yet. Expect breaking schema changes until v1.0.0.

A public, decentralized catalog of apps that run on the
[Moses platform](https://github.com/moses-platform). Each entry here is a
slim, git-native pointer: the app's source repository, a tag, the commit SHA
that tag resolves to, and the people who maintain the listing. Moses
instances clone this catalog and use those pointers to build each app from
source inside their own cluster.

## What this repo is

- **A public manifest registry.** Every app is one directory under
  `apps/<category>/<subcategory>/<slug>/` containing a `manifest.yaml` and
  one per-version file under `versions/`.
- **Schema-governed.** All manifests are validated against
  [`schema/manifest.schema.json`](schema/manifest.schema.json) on every PR.
- **Git-native, build-from-source.** Listings reference an upstream Git repo
  and a tag pinned to a commit SHA. There are no image digests, no signed
  index, and nothing that has to be hosted alongside this repo.
- **Forkable.** The catalog data is licensed CC0-1.0 (see
  [LICENSE.md](LICENSE.md)); you can mirror, filter, or replace it for your
  own Moses fleet.

## What this repo is **not**

- **Not a binary mirror.** No container images, no tarballs, no Helm charts.
  Moses builds each app from its source repository at the pinned commit.
- **Not an auth broker or license server.** Entitlement for paid apps lives
  in the separate Moses license server; the catalog only stores public
  metadata.
- **Not a telemetry endpoint.** The catalog has no idea who fetches it —
  that's intentional.
- **Not a personal-data store.** Maintainer contact is an owner/team email,
  not a user identity.

## How Moses fetches it

Moses clones this repo into the user's `moses-git` workspace, refreshes it
every ~6 hours, and reads each
`apps/<category>/<subcategory>/<slug>/manifest.yaml` directly. There is no
intermediate index file and no signature step — the cloned working tree is
the catalog.

For each listing, Moses then reads the per-version file, clones the upstream
source repository at the declared `tag`, verifies that the tag resolves to
the declared `commit`, and builds the image in-cluster.

## Quickstart

### As a developer publishing an app

Pick one path — both end in the same review:

- **Path A — Direct GitHub PR.** Copy `apps/_template/` to
  `apps/<category>/<subcategory>/<your-slug>/`, fill in the manifest, add
  a `LICENSE` file at the root of your source repo, and open a PR. CI runs
  schema + semantic validation.
- **Path B — Moses UI suggestion.** Once the platform-side wizard ships,
  you can use the Moses Marketplace tab to send a listing in for review
  without leaving the Moses UI.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full checklist and review
flow.

### As a Moses instance operator

You don't need to do anything. A Moses instance refreshes its cloned copy
of this repo on a ~6-hour schedule, reads the manifests directly out of the
working tree, and builds each app from its own source repository. There is
nothing to verify against an external service.

## Repository layout

```
schema/                 JSON Schema Draft 2020-12 for manifests + versions
categories.yaml         Canonical category / subcategory allow-list
apps/_template/         Copy-to-start template; not surfaced in the UI
apps/<category>/<subcategory>/<slug>/
                        One directory per app
scripts/                Node 20 scripts invoked by CI and locally via `make`
.github/                PR template, issue templates, CI workflows, CODEOWNERS
```

## Current catalog status

Run `make test` (or `npm run test`) locally to re-run validation.

## Related docs

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to submit or update a listing
- [GOVERNANCE.md](GOVERNANCE.md) — maintainer model and delisting policy
- [SECURITY.md](SECURITY.md) — how to report a malicious listing (private channel)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — Contributor Covenant 2.1

## Licensing

- Source code in this repo (scripts, workflows, schemas) is MIT, per the
  existing [LICENSE.md](LICENSE.md).
- Catalog metadata (anything under `apps/` and per-version YAML) is released
  under [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) so
  third parties can mirror and remix it freely. This duality is intentional;
  see [LICENSE.md](LICENSE.md) for the full note.
