# v0.1.0 distribution and runtime

The v0.1.0 installable distribution uses an npm tarball built from the approved release commit with `npm ci` followed by `npm pack`. The `v0.1.0` GitHub Release is its publication surface; check [Releases](https://github.com/monancho/github-workflow/releases) for the asset's availability. A package dry run includes compiled CLI/runtime JavaScript and TypeScript declarations, `package.json`, the README, this distribution guide, `SECURITY.md`, and the license. It excludes credentials, tests, and `node_modules`. The package remains `private` to prevent accidental npm registry publication. [#39](https://github.com/monancho/github-workflow/issues/39) governs authorization, artifact provenance, attachment, and post-publication verification; see the [maintainer release guide](https://github.com/monancho/github-workflow/blob/main/docs/RELEASING.md). GitHub's automatic source archives are distinct from the installable npm tarball.

Install the tarball with a supported Node.js LTS runtime:

```text
npm install --global ./github-workflow-0.1.0.tgz
github-workflow --help
github-workflow --version
```

The same command name is installed by npm on Windows, Linux, and macOS. For development from a source checkout, run `npm ci`, `npm run build`, then `node dist/src/cli.js --help`. No service or repository-local runtime state is required. Credentials are supplied at run time through `GH_TOKEN` or `GITHUB_TOKEN` for GitHub API operations; the archive does not contain credentials.

## Runtime boundary

The verified v0.1.0 runtime majors are Node.js **22 and 24** on Windows, Linux, and macOS. Other majors are outside this release's support claim. The package engine contract rejects Node.js 20 with `npm ci --engine-strict`. `github-workflow --help` and `--version` remain available to identify the CLI; other commands return a structured `unsupported` result with exit code `4` on an unsupported major.

## Reproducible portability check

The [portable CLI smoke workflow](https://github.com/monancho/github-workflow/blob/main/.github/workflows/platform-smoke.yml) runs `npm ci`, the deterministic test suite, `npm pack`, tarball installation, help/version through npm's global command, and Inspect/Plan from the installed tarball with local fixtures on Windows, Linux, and macOS for Node.js 22 and 24. A separate Node.js 20 job demonstrates `npm ci --engine-strict` rejecting the package. The fixtures avoid live GitHub credentials and mutation. [#36's final evidence](https://github.com/monancho/github-workflow/issues/36#issuecomment-5806730906) records live installed-artifact verification in a preseeded pilot and a clean public personal-account test repository. Their original Issue items appeared in Project forward lists and agreed with direct reads: the pilot Issue was `Completed`/`Done`, and the clean Issue was open/`Backlog`. The unrelated Project's original draft item remained present, with unrelated configuration preserved. Fresh post-recovery Inspect → Plan → Apply → Verify runs on both repositories had zero planned and applied operations and verified all seven resources. [#38's final audit](https://github.com/monancho/github-workflow/issues/38#issuecomment-5882214627) also recorded seven passing platform jobs on its audited commit. #39 records the exact release candidate and publication checks as they occur.

The source and tarball use portable Node.js paths and UTF-8 JSON. The CLI accepts UTF-8 JSON with or without a byte-order mark, and UTF-16LE/BE with a byte-order mark, for saved inputs. Output is JSON with a trailing newline by default. Shell redirection into Plan/Apply files is supported when `--format json` is used. The CLI does not require a Unix shell, and regular phase results are on stdout with stable exit codes as documented in the README.
