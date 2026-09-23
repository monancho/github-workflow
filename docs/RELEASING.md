# v0.1.0 maintainer release guide

This guide prepares the first public release; it does not authorize a tag or a
GitHub Release. [Issue #39](https://github.com/monancho/github-workflow/issues/39)
requires a separate, explicit human release decision before either is created
or published. Follow the repository's [contribution and merge policy](../CONTRIBUTING.md)
for changes leading up to that decision.

## What each GitHub record means

| Record | Purpose |
| --- | --- |
| `v0.1.0` milestone | Defines the release scope. It is not an execution or publication signal. |
| Issues and Dedicated User Project | Hold the work contract, dependencies, lifecycle Status, decisions, and verification evidence. A linked PR records a repository change. |
| Git tag `v0.1.0` | Identifies the approved, fixed version snapshot of the reviewed `main` commit. It is not task state. |
| GitHub Release `v0.1.0` | Publishes reviewed notes and the verified installable npm tarball from that snapshot. GitHub's automatic source archives are separate downloads. |

The package version is `0.1.0`; the Git tag and Release name are `v0.1.0`.
No alpha, beta, or release-candidate tag is required by default.

## Before requesting release authority

1. Complete [#36](https://github.com/monancho/github-workflow/issues/36):
   reconcile the pilot's direct Issue-to-Project membership with its forward
   Project item list, record the final outcome, and update this guide
   and the [README](../README.md) if the evidence changes the release wording.
   Its 2026-09-23 22:47 UTC checkpoint passed the live CLI, lifecycle, installed
   tarball, idempotency, recovery, and unrelated-state preservation exercises,
   but the pilot Project list still omitted an active item during a GitHub
   Projects indexing incident. That checkpoint is partial release evidence.
2. Complete [#37](https://github.com/monancho/github-workflow/issues/37)
   with accurate public documentation, then the independent
   [SC-001–SC-012 audit in #38](https://github.com/monancho/github-workflow/issues/38).
   Resolve any failed criterion or record an explicitly authorized exception;
   do not infer readiness from a merged PR or a `Done` Project Status alone.
3. For [#39](https://github.com/monancho/github-workflow/issues/39), inspect
   the release milestone, open Issues/PRs, blockers and decisions, current `main`
   commit SHA, required checks, and independent Review/QA evidence. Confirm the
   release candidate matches the [requirements](REQUIREMENTS.md),
   [workflow specification](WORKFLOW_SPEC.md),
   [distribution guide](DISTRIBUTION.md), and [security policy](../SECURITY.md).
   Record the exact candidate commit SHA, evidence links, remaining limitations,
   and proposed notes in #39 for the human release decision.
4. From a clean checkout of that exact commit, run `npm ci`, `npm test`, and
   `npm pack --dry-run --json`. Check the file list against `package.json`:
   compiled CLI/runtime files, TypeScript declarations, README,
   `docs/DISTRIBUTION.md`, `SECURITY.md`, `LICENSE`, and package metadata;
   no credentials, tests, or `node_modules`. Confirm Node.js 22/24 platform
   checks and the supported public GitHub.com personal-account pilot evidence.
   Do not broaden the support claim from an untested environment.

## After the human release decision

1. Confirm that the approval names the reviewed candidate commit, `v0.1.0`
   tag, and GitHub Release publication. If the candidate SHA changes, repeat
   the applicable review, checks, audit, and decision against the new SHA.
2. Create and push the `v0.1.0` tag at the approved `main` commit. Verify that
   the remote tag resolves to that commit. Do not move or reuse a published
   version tag as a work-state marker.
3. Build `github-workflow-0.1.0.tgz` from a clean checkout of the tagged
   commit using `npm ci` and `npm pack`. Verify the package name/version and
   archive contents, calculate a SHA-256 checksum, and install and smoke-test
   that exact tarball on the supported runtime. Record the tag commit, archive
   checksum, checks, and installation result in #39 so the attached asset can
   be traced to the reviewed source.
4. Draft the GitHub Release for `v0.1.0`. Review generated notes against the
   milestone, merged PRs, verified support boundary, user-facing behavior,
   installation path, and known limitations; generated notes are only a
   starting point. Attach the verified npm tarball and include its checksum.
   Check the draft and asset before publishing. Publishing makes the GitHub
   Release the public distribution surface; it does not publish to npm.
5. Publish under the recorded release authority. Re-read the public Release,
   tag target, notes, attached asset and checksum, and install the downloaded
   asset to confirm it matches the reviewed artifact. Record the public URL
   and verification in #39, then reconcile its Issue, Project Status, milestone,
   and parent only after the release acceptance conditions are met.

GitHub's [release overview](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
and [release management guide](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
describe tags, generated notes, draft releases, and attached assets.
