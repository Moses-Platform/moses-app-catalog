# Your App Display Name

> Template README. Copy this directory under `apps/<category>/<subcategory>/`,
> then replace every placeholder with real content. Reviewers read this file
> carefully — it is the Marketplace detail page for your listing.

A one-paragraph pitch: what does this app do, who is it for, and what does
it integrate with in the Moses ecosystem? Lead with the user-visible value,
not the implementation.

## Features

- Feature one
- Feature two
- Feature three

## Installation

Users install this app from the Moses **Marketplace** tab. Their Moses
instance clones your source repository at the pinned `tag`/`commit`, builds
the image inside their cluster, and deploys it under their tenant.

## Configuration

Document any required configuration: environment variables, mounted
secrets, external services that must be reachable, etc. If the app reads a
`moses-app.config.json` (it almost always does), describe what it expects
to find there.

## License

Set `policy.license` in `manifest.yaml` to your SPDX identifier and ship a
matching `LICENSE` (or `COPYING`) file at the root of your source repo.

## Maintainers

- Owner Name (`@owner-handle`) — owner

## Support

For bugs and questions, please use the contact information for the
maintainers in `manifest.yaml`.
