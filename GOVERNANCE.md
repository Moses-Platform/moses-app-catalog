# Governance

This document describes who maintains the moses-app-catalog, how decisions get
made, and how listings enter and leave the catalog. It is the companion to
[CONTRIBUTING.md](CONTRIBUTING.md), which covers the mechanics of submitting.

## Maintainers

### Bootstrap phase (current)

The catalog is initially maintained by **Siemer Industries**, the organization
that created Moses. Bootstrap maintainers are listed in `.github/CODEOWNERS`.

Bootstrap maintainer responsibilities:

- Review incoming submissions within 7 calendar days (best-effort; no SLA).
- Enforce the rules in [CONTRIBUTING.md § Disqualifying conditions](CONTRIBUTING.md#disqualifying-conditions).
- Keep the schema, scripts, and CI workflows working.
- Respond to security reports per [SECURITY.md](SECURITY.md).

### Community maintainers

Once the catalog contains at least **three approved apps**, any contributor
whose listings have been merged and remained in good standing for 60 days may
be nominated as a community maintainer by an existing maintainer. Nomination
happens in a public GitHub issue; a simple majority of current maintainers
approves (with the owner retaining veto, below).

Community maintainers get the same review and merge rights as bootstrap
maintainers but **do not** get the ability to amend CODEOWNERS for their own
listings (conflict-of-interest guard — see below).

### Owner

**Siemer Industries** retains the owner role indefinitely. The owner has a
final veto on:

- Schema-breaking changes.
- Changes to CI that affect signing (the cosign identity chain matters).
- Delisting decisions.
- Governance changes (this document).

The veto is designed for unambiguous misuse or legal-risk situations. It is
not a blanket override; in a healthy maintainer pool it should essentially
never fire.

## How decisions get made

| Decision type | Process |
|---------------|---------|
| **Listing approval** | Any maintainer can merge a listing PR once CI is green and one maintainer approves. Author cannot self-approve. |
| **Listing update** | Same as approval, but the listing's CODEOWNERS-declared maintainer must approve. |
| **Delisting (non-emergency)** | Majority of maintainers, 14-day comment window on a public issue. |
| **Delisting (emergency)** | Any maintainer can delist immediately for active security, malware, or legal reasons. A public post-hoc justification issue is opened within 48 hours. |
| **Schema changes** | Majority of maintainers; owner has veto on breaking changes. |
| **CI/workflow changes** | Majority of maintainers; owner has veto on signing-pipeline changes. |
| **New maintainer nomination** | Majority of current maintainers. |
| **Remove maintainer** | Owner or self-resignation; or majority of maintainers ex-the-target in egregious cases. |

Disagreements that can't be resolved by a vote escalate to the owner. The
owner's decision is final and public.

## Conflict of interest

- A maintainer **must not** approve a PR that modifies their own listing.
- A maintainer **must not** approve their own CODEOWNERS changes.
- The owner may waive either of the above in writing on the PR thread, with a
  reason, if no other maintainer is reachable within a reasonable timeframe.

## Delisting

Listings can leave the catalog in three ways:

### 1. Maintainer-initiated delisting (policy violation)

Process:

1. A maintainer files an issue using the `remove-listing.yml` template,
   citing the specific rule violated (see
   [CONTRIBUTING.md § Disqualifying conditions](CONTRIBUTING.md#disqualifying-conditions)).
2. The listing's current maintainer is notified via their `maintainers[]`
   contact. They have **14 days** to respond, remediate, or appeal.
3. If remediation is accepted, the issue closes with no catalog change.
4. If remediation fails or no response, a majority vote of maintainers
   confirms the delisting.
5. The listing directory is deleted; a **tombstone entry** is appended to
   `index.json` (`tombstone: true`, with `delistedAt` and `reason`).
   Moses instances treat tombstones as a signal to uninstall or warn.

### 2. Emergency delisting (security / legal)

Any maintainer can unilaterally delete the listing directory and append a
tombstone entry when facing active malware, credential theft, CVE weaponization,
or a lawful takedown demand (DMCA, court order). No notice period. The
maintainer files a post-hoc justification issue within 48 hours; the delisting
is ratified or reverted by majority vote within 14 days.

### 3. Self-initiated delisting

The listing's declared owner-role maintainer can delist their own app any time
by opening a PR that:

1. Deletes `apps/<slug>/`.
2. Leaves a short note in the PR body (optional — reason not required).

CI will regenerate `index.json` with a tombstone entry so existing Moses
instances get a clean signal.

## Tombstones in `index.json`

Tombstones carry the minimum a Moses instance needs to stop offering the app
while not forgetting that it used to exist:

```json
{
  "toolKey": "abandoned-app",
  "slug": "abandoned-app",
  "tombstone": true,
  "delistedAt": "2026-04-19T00:00:00Z",
  "reason": "self-delisted"
}
```

Moses instances **never** auto-uninstall a tombstoned app from users — they
only stop offering it for new installs and can surface a warning in the UI.
Uninstall is always user-initiated.

## Forking

The catalog metadata is CC0-1.0 (see [LICENSE.md](LICENSE.md)), so forking is
explicitly permitted and encouraged for any of these reasons:

- You want a private/curated catalog for your own Moses fleet.
- You disagree with a delisting decision and want to keep the app available to
  your users.
- You want to run a regional mirror.

A fork is not a governance mechanism against this repo — disagreements here
get settled here, by discussion and vote, per the table above. But the option
exists, on purpose, as a pressure-relief valve.

## Amending this document

Governance changes go through the same flow as schema changes: PR, majority
of maintainers, owner veto available. Amendments must preserve the two
invariants:

1. **Owner always has a final veto.**
2. **Forking is always permitted.**
