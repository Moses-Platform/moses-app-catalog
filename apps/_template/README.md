# TODO Display Name

> Template README. Copy this directory, then replace every TODO with real
> content. Reviewers read this file carefully — it is the App Store detail
> page.

A one-paragraph pitch: what does this app do, who is it for, and what does
it integrate with in the Moses ecosystem? Lead with the user-visible value,
not the implementation.

## Screenshots

Host screenshots externally and reference them via `screenshotUrls` in
`manifest.yaml`. Do **not** commit binary screenshots to this repo — they
bloat git history for every Moses instance that pulls the catalog.

## Features

- TODO feature one
- TODO feature two
- TODO feature three

## Installation

Users install this app from the Moses **App Store** tab. Once installed,
their Moses instance pulls the image at the digest pinned in `manifest.yaml`,
deploys it via the listed Helm chart (or a Moses-generated default chart),
and exposes it under their tenant.

## Configuration

Document any required configuration: environment variables, mounted
secrets, external services that must be reachable, etc. If the app reads a
`moses-app.config.json` (it almost always does), describe what it expects
to find there.

## License

`TODO-SPDX-identifier` — see the source repository for the full text.

## Maintainers

- TODO Owner Name (`@TODO-owner-handle`) — owner

## Support

For bugs and questions, please use the contact in `policy.supportContact`
in `manifest.yaml`.
