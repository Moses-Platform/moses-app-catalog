<!--
Thanks for contributing to moses-app-catalog. Please fill out this checklist
honestly. CI will catch most mistakes; the items below are the ones that need
human attention.
-->

## What is this PR?

- [ ] New listing
- [ ] New version of an existing listing
- [ ] Metadata update (description, tags, screenshots, maintainers)
- [ ] Yank a published version (set `yanked: true`)
- [ ] Delisting request (see GOVERNANCE.md § Delisting)
- [ ] Repo infrastructure (workflows, schema, scripts, docs)

**App slug** (directory under `apps/`):

**Submission path** (delete the ones that don't apply):
- Path A — Direct GitHub PR (open source)
- Path B — Moses UI publish wizard (open source)
- Path C — Closed-source listing (Helm + image only)

## Checklist

- [ ] I've read [CONTRIBUTING.md](../CONTRIBUTING.md) and the
      [Shared checklist](../CONTRIBUTING.md#shared-checklist-all-paths).
- [ ] `make test` passes locally.
- [ ] `toolKey` matches the directory name under `apps/`.
- [ ] All `imageDigest` values are real `sha256:` digests from a public OCI
      registry. No tags, no placeholders.
- [ ] All URLs are HTTPS and resolve publicly. No localhost / RFC1918 hosts.
- [ ] No screenshots or other binary blobs are committed; screenshots are
      hosted externally and referenced via `screenshotUrls`.
- [ ] No secrets (API keys, tokens, passwords) anywhere in the manifest,
      version files, README, or commit messages.

## Path C only (closed-source)

- [ ] `repositoryType: "oci"` and `repositoryUrl` is omitted.
- [ ] `helmChartRef` resolves anonymously and `helmChartVersion` is pinned.
- [ ] `trust.statement` is substantive (not marketing copy).
- [ ] `trust.vouchedBy` lists at least two recognized contributors and they
      have already commented on this PR confirming they tested the image
      and chart against a real Moses instance.

## Reviewer notes

<!-- Anything you want maintainers to know that isn't obvious from the diff. -->
