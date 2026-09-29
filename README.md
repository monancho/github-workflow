# github-workflow

> v0.1.0 documentation. Check [GitHub Releases](https://github.com/monancho/github-workflow/releases) for publication status and installable assets.

`github-workflow` is a GitHub-native, agent-neutral software delivery workflow for humans and AI agents working under the same durable work contract.

The provisioning CLI implements the managed GitHub Core Profile. [#36](https://github.com/monancho/github-workflow/issues/36#issuecomment-5806730906) completed repository self-dogfooding and clean and preseeded public pilot validation, including agreement between the original Project items' direct reads and forward lists. [#38](https://github.com/monancho/github-workflow/issues/38#issuecomment-5882214627) completed the pre-release readiness audit; [#39](https://github.com/monancho/github-workflow/issues/39) governs the separate human release decision and publication verification. This project supplies a workflow contract and a provisioning tool, not a hosted task database or a service required to keep a repository running.

## Principles

- GitHub-native first
- Agent-neutral
- Existing-first
- Standards-backed
- Repository-independent
- Small batches
- Continuous verification
- Documentation evolves with implementation

## Intended scope

The project has three layers:

1. **Core Workflow Contract** — shared work, lifecycle, authority, verification, and completion semantics.
2. **GitHub Core Profile** — a minimal mapping of that contract onto native GitHub capabilities.
3. **Provisioning Capability** — inspect, plan, apply, and verify the managed GitHub state.

The v0.1.0 target is a public GitHub.com repository owned by a personal account, using GitHub Free capabilities. Organization-owned or private repositories, GitHub Enterprise Server, cross-owner Projects, and shared multi-repository Projects are outside the verified target. See the [requirements baseline](https://github.com/monancho/github-workflow/blob/main/docs/REQUIREMENTS.md) for the full support boundary.

Jira and Notion are outside the v0.1.0 provisioning runtime. They may provide optional context in future workflows; this package does not integrate with or synchronize them.

## Current status

- Product definition: completed
- Development process tailoring: completed
- Formal document model: completed
- GitHub capability scope: completed
- Release policy: completed
- Bootstrap plan: completed
- Implementation: Core Profile reconciliation, local CLI contract, and Node.js 22/24 tarball portability checks completed
- Release validation: #36 self-dogfooding and clean and preseeded public pilot checks completed; original Project items agree in direct and forward-list reads
- Pre-release audit: #38 found SC-001–SC-011 passing and SC-012's release path ready for the separate #39 authority and post-publication verification steps
- Version: `0.1.0`; check [GitHub Releases](https://github.com/monancho/github-workflow/releases) for the `v0.1.0` tag and installable asset

The [workflow specification](https://github.com/monancho/github-workflow/blob/main/docs/WORKFLOW_SPEC.md) defines tracked Issues, Project Status, Sub-Issues, dependencies, linked PRs, independent Review/QA, and separate merge authority. An Issue holds canonical work state; a PR records its change and integration. The Project Status lifecycle is `Backlog → Ready → In Progress → Review → Done`, with backward movement for rework and Review when applicable. `Done` alone does not prove acceptance; a successful Issue closes as `Completed`. The [`blocked` and `needs-decision` labels](https://github.com/monancho/github-workflow/blob/main/docs/WORKFLOW_SPEC.md#3-lifecycle-and-conditions) record conditions, not lifecycle phases.

## Core Profile provisioning

This local TypeScript CLI reconciles repository Issues availability, a same-owner Dedicated User Project and its Status values, the `needs-decision` and `blocked` labels, and Project membership/lifecycle effects for explicitly selected tracked Issues. It preserves unrelated labels, Projects, and repository configuration; it does not repurpose an arbitrary existing Project. Every JSON result has `schemaVersion: 1` and `resourceScope: "core-profile"`. A `verified` result covers the selected Issues in that run; it does not silently discover every tracked Issue in a repository. Existing labels are reused by name. Colors and descriptions are defaults for newly created labels and are not enforced on existing labels.

Use Node.js 22 or 24 LTS. When the `v0.1.0` GitHub Release asset is available, download `github-workflow-0.1.0.tgz` from [Releases](https://github.com/monancho/github-workflow/releases) and install it with `npm install --global ./github-workflow-0.1.0.tgz`. The installed command is `github-workflow`. The [distribution and runtime guide](docs/DISTRIBUTION.md) describes platform checks. For a source checkout, install and build with `npm ci` and `npm run build`. The commands below use the compiled source CLI; replace `node dist/src/cli.js` with `github-workflow` when using the installed tarball. `inspect` reads current managed state; `plan` performs a read-only inspection and prints proposed operations; `apply` accepts that saved plan, then `verify` accepts both saved artifacts and performs a fresh read. Supply `GH_TOKEN` or `GITHUB_TOKEN` with the applicable repository and User Project permissions. GraphQL Project inspection also requires authentication for read-only commands.

```text
node dist/src/cli.js inspect --owner OWNER --repo REPO --profile v0.1.0-core-profile --issues issues.json
node dist/src/cli.js plan --owner OWNER --repo REPO --profile v0.1.0-core-profile --issues issues.json > plan.json
node dist/src/cli.js apply --owner OWNER --repo REPO --profile v0.1.0-core-profile --issues issues.json --plan plan.json > apply.json
node dist/src/cli.js verify --owner OWNER --repo REPO --profile v0.1.0-core-profile --issues issues.json --plan plan.json --apply-report apply.json
node dist/src/cli.js plan --owner OWNER --repo REPO --profile v0.1.0-core-profile --issues issues.json --format text
node dist/src/cli.js --help
node dist/src/cli.js --version
```

The `issues.json` file is an array such as `[{"number":123}]`. An authorized initial Status override uses `{"number":123,"authorizedInitialStatus":{"status":"Ready","authorizationRef":"issue-123-comment"}}`. Use the same selection file for all four phases; omit `--issues` only when intentionally reconciling the repository and Project without asserting Issue membership. Enter the canonical owner and repository spelling. The target must be a public GitHub.com repository owned by a personal account. Saved plans carry result schema version 1, Plan schema version 1, profile version, normalized selected-Issue identity, and the observed-state fingerprint; incompatible plans are blocked before mutation. `apply` stops when the relevant managed state has changed since planning. Read-only GitHub requests use bounded retries for short transient or rate-limit failures; mutations are never retried automatically. A failed, interrupted, or partially applied run may contain a mutation with an uncertain result and should be followed by a new Inspect and Plan. `SIGINT` and `SIGTERM` stop further Apply operations and prevent Verify from claiming success.

The CLI does not prompt. JSON is the default output and must be used for saved Plan and Apply artifacts. `--format text` renders the same structured result for reading. Normal results, including blocked and invalid input results, go to stdout. Only an unexpected failure before a phase result adds a generic message on stderr; raw GitHub error bodies, file contents, and credentials are never printed.

| Exit code | Meaning |
| --- | --- |
| `0` | `inspected`, `ready`, `no-change`, `applied`, or `verified` |
| `2` | `invalid-input` |
| `3` | `blocked` |
| `4` | `unsupported` |
| `5` | `unverifiable` or `non-conforming` |
| `6` | `partial-failure` or `interrupted` |
| `7` | `failed` or an unexpected failure |

Run `npm test` for deterministic reconciliation and CLI contract tests.

## Security

Please see [SECURITY.md](SECURITY.md). Do not disclose suspected vulnerabilities in a public issue.

## Contributing

See [CONTRIBUTING.md](https://github.com/monancho/github-workflow/blob/main/CONTRIBUTING.md) for the repository's Issue, PR, review, and authority process. Maintainers can use the [release guide](https://github.com/monancho/github-workflow/blob/main/docs/RELEASING.md) when preparing `v0.1.0`.

## License

MIT. See [LICENSE](LICENSE).
