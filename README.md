# github-workflow

> Status: Planning / Experimental

`github-workflow` is a GitHub-native, agent-neutral software delivery workflow for humans and AI agents working under the same durable work contract.

The project is implementing its first release. The provisioning CLI now covers the managed GitHub Core Profile; hardening, operator-contract work, and release validation remain in progress.

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
- Implementation: Core Profile reconciliation implemented; hardening, operator contract, and release validation pending
- First public release target: `v0.1.0`

Detailed requirements and specifications are added through the repository's formal Issue → branch → Pull Request workflow.

## Core Profile provisioning

This local TypeScript CLI reconciles repository Issues availability, a same-owner Dedicated User Project and its Status values, the `needs-decision` and `blocked` labels, and Project membership/lifecycle effects for explicitly selected tracked Issues. Every JSON result has `resourceScope: "core-profile"`. A `verified` result covers the selected Issues in that run; it does not silently discover every tracked Issue in a repository. Existing labels are reused by name. Colors and descriptions are defaults for newly created labels and are not enforced on existing labels.

Use a supported Node.js LTS runtime. Install and build with `npm ci` and `npm run build`. The commands below use the compiled CLI. `plan` performs a read-only inspection and prints the proposed operations; `apply` accepts that saved plan, then `verify` accepts both saved artifacts and performs a fresh read. Supply `GH_TOKEN` or `GITHUB_TOKEN` with the applicable repository and User Project permissions. GraphQL Project inspection also requires authentication for read-only commands.

```text
node dist/src/cli.js inspect --owner OWNER --repo REPO --issues issues.json
node dist/src/cli.js plan --owner OWNER --repo REPO --issues issues.json > plan.json
node dist/src/cli.js apply --owner OWNER --repo REPO --issues issues.json --plan plan.json > apply.json
node dist/src/cli.js verify --owner OWNER --repo REPO --issues issues.json --plan plan.json --apply-report apply.json
```

The `issues.json` file is an array such as `[{"number":123}]`. An authorized initial Status override uses `{"number":123,"authorizedInitialStatus":{"status":"Ready","authorizationRef":"issue-123-comment"}}`. Use the same selection file for all four phases; omit `--issues` only when intentionally reconciling the repository and Project without asserting Issue membership. Enter the canonical owner and repository spelling. The target must be a public GitHub.com repository owned by a personal account. `apply` stops when the relevant managed state has changed since planning. A failed or partial run should be followed by a new Inspect and Plan. Output is JSON on stdout; a nonzero exit code means blocked, failed, unverifiable, or nonconforming work. Run `npm test` for deterministic reconciliation tests.

## Security

Please see [SECURITY.md](SECURITY.md). Do not disclose suspected vulnerabilities in a public issue.

## License

MIT. See [LICENSE](LICENSE).
