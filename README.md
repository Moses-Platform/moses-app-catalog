# moses-app-catalog

> **Status: Preview — not yet consumed by Moses instances.**
> The schema and workflows are in place, but no production Moses instance is
> pulling from this repo yet. Expect breaking schema changes until v1.0.0.

A public, decentralized catalog of apps that run on the
[Moses platform](https://github.com/moses-platform). Each entry here describes
one app: where its source lives, which image digest to pull, what config it
expects, and who maintains it. Moses instances around the world fetch this
catalog on a ~6-hour schedule and upsert approved entries into their local
marketplace tables.

## What this repo is

- **A public manifest registry.** Every app is one directory under `apps/`
  containing a `manifest.yaml` and per-version metadata.
- **Schema-governed.** All manifests are validated against
  [`schema/manifest.schema.json`](schema/manifest.schema.json) on every PR.
- **Signed.** On merge, CI rebuilds `index.json` and [cosign-signs] it keylessly
  via Sigstore/Fulcio. Moses instances verify the signature via the public
  Rekor transparency log before trusting any entry.
- **Forkable.** The catalog data is licensed CC0-1.0 (see [LICENSE.md](LICENSE.md));
  you can mirror, filter, or replace it for your own Moses fleet.

[cosign-signs]: https://docs.sigstore.dev/cosign/signing/signing_with_blobs/

## What this repo is **not**

- **Not a binary mirror.** No container images, no tarballs. Manifests reference
  OCI digests that Moses pulls from the app's own registry.
- **Not an auth broker or license server.** Entitlement for paid apps lives in
  the separate Moses license server; the catalog only records
  `licenseServerListingId`.
- **Not a telemetry endpoint.** The catalog has no idea who fetches it — that's
  intentional.
- **Not a personal-data store.** Maintainer contact is an owner/team email, not
  a user identity.

## Quickstart

### As a developer publishing an app

Pick one path — both end in the same PR review:

- **Path A — Direct GitHub PR.** Fork, copy `apps/_template/` to
  `apps/<your-slug>/`, fill in the manifest, open a PR. CI runs schema +
  semantic validation.
- **Path B — Moses UI wizard.** Once implemented on the platform side
  (see [CONTRIBUTING.md § Path B](CONTRIBUTING.md#path-b--moses-ui-publish-wizard)),
  click **Publish to Public Catalog** in the App Store tab of your Moses
  instance. The wizard pre-fills the manifest from your deployed
  `workspace_tool` and opens the PR on your behalf via GitHub OAuth.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full checklist and review flow.

### As a Moses instance operator

Moses instances fetch and verify the catalog roughly as follows (pseudocode —
actual implementation lives in the platform repo):

```text
GET https://raw.githubusercontent.com/moses-platform/moses-app-catalog/main/index.json
GET https://raw.githubusercontent.com/moses-platform/moses-app-catalog/main/signatures/index.json.sig
cosign verify-blob --certificate-identity-regexp '.+@github\.com' \
                   --certificate-oidc-issuer https://token.actions.githubusercontent.com \
                   --signature signatures/index.json.sig index.json
# upsert each entry into community_marketplace_tools
```

The sync service is not yet wired up in the platform (see
[platform epic tracking](https://github.com/moses-platform/moses-platform-prep)).

## Repository layout

```
schema/                 JSON Schema Draft 2020-12 for manifests + versions
apps/_template/         Copy-to-start template; not included in index.json
apps/<slug>/            One directory per app
index.json              Generated on merge by CI (do not hand-edit)
signatures/             Keyless cosign signatures of index.json
scripts/                Node 20 scripts invoked by CI and locally via `make`
.github/                PR template, issue templates, CI workflows, CODEOWNERS
```

## Current catalog status

Run `make test` (or `npm run test`) locally to re-run validation and rebuild
`index.json`. In CI, the index is regenerated automatically on every merge to
`main`.

Catalog stats (from `index.json`) can be viewed directly:
<https://raw.githubusercontent.com/moses-platform/moses-app-catalog/main/index.json>

## Related docs

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to submit or update a listing
- [GOVERNANCE.md](GOVERNANCE.md) — maintainer model and delisting policy
- [SECURITY.md](SECURITY.md) — how to report a malicious listing (private channel)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — Contributor Covenant 2.1

## Licensing

- Source code in this repo (scripts, workflows, schemas) is MIT, per the
  existing [LICENSE.md](LICENSE.md).
- Catalog metadata (anything under `apps/`, `index.json`, and per-version YAML)
  is released under [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)
  so third parties can mirror and remix it freely. This duality is intentional;
  see [LICENSE.md](LICENSE.md) for the full note.
