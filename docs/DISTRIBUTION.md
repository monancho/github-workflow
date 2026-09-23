# v0.1.0 distribution and runtime

The v0.1.0 distribution artifact is an npm tarball built from a release commit with `npm ci` followed by `npm pack`. The tarball contains compiled CLI/runtime files, the README, and the license. It does not contain credentials, tests, or `node_modules`. The package remains `private` to prevent accidental npm registry publication. Release work in #39 may attach the verified tarball to the GitHub Release; #31 does not publish a release.

Install the tarball with a supported Node.js LTS runtime:

```text
npm install --global ./github-workflow-0.1.0.tgz
github-workflow --help
github-workflow --version
```

The same command name is installed by npm on Windows, Linux, and macOS. For development from a source checkout, run `npm ci`, `npm run build`, then `node dist/src/cli.js --help`. No service or repository-local runtime state is required. Credentials are supplied at run time through `GH_TOKEN` or `GITHUB_TOKEN` for GitHub API operations; the archive does not contain credentials.

## Runtime boundary

The verified v0.1.0 runtime majors are Node.js **22 and 24**. At the time of this verification, both are LTS on the [official Node.js release schedule](https://nodejs.org/en/about/previous-releases). Node.js 20 is EOL and is rejected by the package engine contract. Node.js 26 is Current and is outside the v0.1.0 claim until separately verified. `github-workflow --help` and `--version` remain available to identify the CLI; other commands return a structured `unsupported` result with exit code `4` on an unsupported major.

## Reproducible portability check

The [portable CLI smoke workflow](https://github.com/monancho/github-workflow/blob/main/.github/workflows/platform-smoke.yml) runs `npm ci`, the deterministic test suite, `npm pack`, tarball installation, help/version through npm's global command, and Inspect/Plan from the installed tarball with local fixtures on Windows, Linux, and macOS for Node.js 22 and 24. A separate Node.js 20 job demonstrates `npm ci --engine-strict` rejecting the package. The fixtures avoid live GitHub credentials and mutation. Review the workflow run attached to the implementation PR for platform-specific evidence before making a release support claim.

The source and tarball use portable Node.js paths and UTF-8 JSON. The CLI accepts UTF-8 JSON with or without a byte-order mark, and UTF-16LE/BE with a byte-order mark, for saved inputs. Output is JSON with a trailing newline by default. Shell redirection into Plan/Apply files is supported when `--format json` is used. The CLI does not require a Unix shell, and regular phase results are on stdout with stable exit codes as documented in the README.
