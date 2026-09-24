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

1. Confirm [#36's completed evidence](https://github.com/monancho/github-workflow/issues/36#issuecomment-5806730906):
   self-dogfooding, clean-target provisioning, reuse/preservation, live CLI,
   lifecycle, installed tarball, idempotency, and recovery exercises passed.
   The original items in the preseeded pilot Project #4, clean Project #5, and
   unrelated Project #3 appeared in forward lists and matched direct reads
   without deleting or recreating them. Fresh post-recovery runs on both pilot
   repositories planned and applied zero operations and verified seven resources
   each. This resolves the discrepancy for those Projects; it does not establish
   that the wider GitHub indexing incident has ended. Recheck Project list/direct
   consistency during final release QA if that incident remains open.
2. Complete [#37](https://github.com/monancho/github-workflow/issues/37)
   with accurate pre-release documentation, then the independent
   [SC-001–SC-012 audit in #38](https://github.com/monancho/github-workflow/issues/38).
   Resolve any failed criterion or record an explicitly authorized exception;
   do not infer readiness from a merged PR or a `Done` Project Status alone.
3. As part of [#39](https://github.com/monancho/github-workflow/issues/39),
   prepare and independently review the final release-facing documentation
   before choosing a candidate commit or creating a tag. In particular, replace
   the README's pre-release status, the distribution guide's "no Release yet"
   and availability/install wording, and `SECURITY.md`'s "no public release"
   supported-version wording. Confirm all three files, which are packaged in
   the npm tarball, will be accurate when `v0.1.0` is public.
   Use wording that remains truthful between integration and publication; do
   not merge a claim that a Release already exists while it does not. Review and
   integrate this documentation under the normal PR Quality Gate and Merge
   Authority rules. This guide's current pre-release statements remain correct
   until that release-scoped update.
4. After the final documentation is on `main`, inspect
   the release milestone, open Issues/PRs, blockers and decisions, current `main`
   commit SHA, required checks, and independent Review/QA evidence. Confirm the
   release candidate matches the [requirements](REQUIREMENTS.md),
   [workflow specification](WORKFLOW_SPEC.md),
   [distribution guide](DISTRIBUTION.md), and [security policy](../SECURITY.md).
   Re-evaluate the applicable #38 success-criterion audit and checks against
   this final SHA, recording any addendum and the exact candidate commit SHA,
   evidence links, remaining limitations, and proposed notes in #39 for the
   human release decision.
5. From a clean checkout of that exact commit, run `npm ci`, `npm test`, and
   `npm pack --dry-run --json`. Check the file list against `package.json`:
   compiled CLI/runtime files, TypeScript declarations, README,
   `docs/DISTRIBUTION.md`, `SECURITY.md`, `LICENSE`, and package metadata;
   no credentials, tests, or `node_modules`. Confirm Node.js 22/24 platform
   checks and the supported public GitHub.com personal-account pilot evidence.
   Do not broaden the support claim from an untested environment.

## After the human release decision

1. Confirm that the approval names the reviewed candidate commit, `v0.1.0`
   tag, and GitHub Release publication. If the candidate SHA changes, repeat
   applicable independent Review/QA, checks, the #38 readiness audit, and
   the human release decision against the new SHA before tagging or publishing.
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
