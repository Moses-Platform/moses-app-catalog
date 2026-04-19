# Security Policy

## Reporting malicious listings or catalog vulnerabilities

**Do not open a public GitHub issue for anything that could be weaponized.**

If you discover any of the following, report it privately:

- A listing that contains or points to malware, cryptominers, credential
  stealers, or ransomware.
- A listing that exfiltrates data or connects to hostile infrastructure.
- A vulnerability in the catalog's CI, signing pipeline, or validation scripts
  that could let a bad actor publish an unreviewed listing.
- A supply-chain attack (typosquatting, dependency confusion, impersonated
  maintainer identity).
- Leaked secrets inside a `manifest.yaml`, README, or repo history.

### How to report

Email **security@siemer.industries** with:

- A clear description of the issue.
- Affected listing slug(s) or CI workflow(s).
- Reproduction steps or proof of concept.
- Your preferred credit line (or "please do not credit me" — both respected).

Expected response timeline:

- **Acknowledgment:** within 48 hours.
- **Triage + severity:** within 5 business days.
- **Remediation or public advisory:** within 30 days for high/critical.

If you do not receive acknowledgment within 48 hours, you may escalate by
opening a **private** GitHub security advisory on this repository
(Security → Advisories → New draft advisory). This keeps the report
confidential while routing it to maintainers who might be on vacation.

## Out of scope

This repository **does not itself run the apps it lists**. The following are
not in scope for reports to this project:

- Bugs or vulnerabilities in the apps themselves — report those to each app's
  own maintainer (see `maintainers[]` in the app's `manifest.yaml`).
- Vulnerabilities in the Moses platform — report via the Moses platform repo's
  own security policy.
- Vulnerabilities in third-party OCI registries that host the actual images.

## Safe-harbor / coordinated disclosure

We will not pursue legal action or report you to your ISP for good-faith
research that:

- Does not exfiltrate or destroy user data.
- Does not degrade service availability (no DoS testing against the live
  catalog or against the Moses license server).
- Gives us a reasonable window (typically 30 days for high/critical, or an
  agreed timeline) before public disclosure.

## Signing & verification

Every merged `index.json` is signed via keyless
[cosign](https://docs.sigstore.dev/cosign/signing/) using GitHub Actions OIDC +
Fulcio + Rekor. The certificate identity is `@github.com` from the issuer
`https://token.actions.githubusercontent.com`. Moses instances verify this on
every sync. If you see an `index.json` whose signature does not verify, treat
it as hostile and report it.
