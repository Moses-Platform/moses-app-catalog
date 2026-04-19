
The MIT License (MIT)

Copyright (c) 2026 Philip Siemer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Dual-licensing note for catalog metadata

The MIT license above applies to the **code** in this repository: everything
under `scripts/`, `schema/`, `.github/`, the `Makefile`, `package.json`, and
any other executable or machine-consumed tooling.

The **catalog metadata** — everything under `apps/`, the generated `index.json`
at the repo root, and the cosign signatures under `signatures/` — is dedicated
to the public domain under [CC0-1.0]. This makes it trivial for third parties
to mirror, filter, relabel, or republish the catalog as their own fleet needs
demand, without any license negotiation. Contributors who submit a listing
agree to release their contribution to `apps/` under CC0-1.0.

Individual apps described by this catalog are licensed under the SPDX
identifier declared in their `manifest.yaml`'s `policy.license` field. The
catalog license says nothing about the apps themselves.

[CC0-1.0]: https://creativecommons.org/publicdomain/zero/1.0/legalcode
