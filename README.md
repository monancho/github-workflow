# github-workflow

> Status: Planning / Experimental

`github-workflow` is a GitHub-native, agent-neutral software delivery workflow for humans and AI agents working under the same durable work contract.

The project is implementing its first release. The provisioning CLI covers the managed GitHub Core Profile; runtime distribution and release validation remain in progress.

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

The project is being designed around three layers:

1. **Core Workflow Contract** — shared work, lifecycle, authority, verification, and completion semantics.
2. **GitHub Core Profile** — a minimal mapping of that contract onto native GitHub capabilities.
3. **Provisioning Capability** — inspect, plan, apply, and verify the managed GitHub state.

The initial target environment is a public repository owned by a personal GitHub account.

## Current status

- Product definition: completed
- Development process tailoring: completed
- Formal document model: completed
- GitHub capability scope: completed
- Release policy: completed
- Bootstrap plan: completed
- Implementation: Core Profile reconciliation and the local CLI contract implemented; runtime distribution and release validation pending
- First public release target: `v0.1.0`

Detailed requirements and specifications are added through the repository's formal Issue → branch → Pull Request workflow.

## Core Profile provisioning

This local TypeScript CLI reconciles repository Issues availability, a same-owner Dedicated User Project and its Status values, the `needs-decision` and `blocked` labels, and Project membership/lifecycle effects for explicitly selected tracked Issues. Every JSON result has `schemaVersion: 1` and `resourceScope: "core-profile"`. A `verified` result covers the selected Issues in that run; it does not silently discover every tracked Issue in a repository. Existing labels are reused by name. Colors and descriptions are defaults for newly created labels and are not enforced on existing labels.

Use a supported Node.js LTS runtime. Install and build with `npm ci` and `npm run build`. The commands below use the compiled CLI. `plan` performs a read-only inspection and prints the proposed operations; `apply` accepts that saved plan, then `verify` accepts both saved artifacts and performs a fresh read. Supply `GH_TOKEN` or `GITHUB_TOKEN` with the applicable repository and User Project permissions. GraphQL Project inspection also requires authentication for read-only commands.

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

## License

MIT. See [LICENSE](LICENSE).
