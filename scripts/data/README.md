# scripts/data

Static lookup tables consumed by `scripts/validate.mjs`. Vendored on purpose so
`make test` runs offline.

## SPDX license identifiers

`spdx-license-ids.json` and `spdx-deprecated.json` are verbatim copies of
[spdx-license-ids](https://github.com/jslicense/spdx-license-ids) v3.0.23
(CC0-1.0, source list maintained by the SPDX project).

To refresh, run from the repo root:

```sh
curl -fsSL https://unpkg.com/spdx-license-ids@<version>/index.json \
  -o scripts/data/spdx-license-ids.json
curl -fsSL https://unpkg.com/spdx-license-ids@<version>/deprecated.json \
  -o scripts/data/spdx-deprecated.json
```

`validate.mjs` accepts:
- any current SPDX identifier from `spdx-license-ids.json`,
- any deprecated identifier from `spdx-deprecated.json` (with a deprecation
  warning planned, not blocking),
- the catalog-specific allowances `Proprietary` and any `LicenseRef-…`
  identifier, used by closed-source (Path C) listings.
