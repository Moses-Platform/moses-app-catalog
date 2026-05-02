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
- Path A — Direct GitHub PR
- Path B — Moses UI publish wizard

## Checklist

- [ ] I've read [CONTRIBUTING.md](https://github.com/moses-platform/moses-app-catalog/blob/main/CONTRIBUTING.md) and the
      [Shared checklist](https://github.com/moses-platform/moses-app-catalog/blob/main/CONTRIBUTING.md#shared-checklist-all-paths).
- [ ] `make test` passes locally.
- [ ] Listing slug matches the directory name under `apps/`.
- [ ] Each version file's `commit` is a 40-char lowercase hex SHA that the
      declared `tag` resolves to in the upstream `repositoryUrl`.
- [ ] All URLs are HTTPS and resolve publicly. No localhost / RFC1918 hosts.
- [ ] No screenshots or other binary blobs are committed; screenshots are
      hosted externally and referenced via `screenshotUrls`.
- [ ] No secrets (API keys, tokens, passwords) anywhere in the manifest,
      version files, README, or commit messages.

## Reviewer notes

<!-- Anything you want maintainers to know that isn't obvious from the diff. -->
