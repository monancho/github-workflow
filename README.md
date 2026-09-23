# github-workflow

> Status: Planning / Experimental

`github-workflow` is a GitHub-native, agent-neutral software delivery workflow for humans and AI agents working under the same durable work contract.

The project is moving from planning into implementation. The first executable provisioning slice reconciles the two managed repository labels. The full Core Profile is not implemented yet.

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
- Implementation: first managed-label slice available; remaining Core Profile resources pending
- First public release target: `v0.1.0`

Detailed requirements and specifications are added through the repository's formal Issue → branch → Pull Request workflow.

## Managed-label provisioning slice

This local TypeScript CLI currently handles only the `needs-decision` and `blocked` repository labels. Every JSON result has `resourceScope: "managed-labels"`; `verified` means those two labels conform, not that the full Core Profile conforms. Existing labels are reused by name. Colors and descriptions are defaults for newly created labels and are not enforced on existing labels.

Use a supported Node.js LTS runtime. Install and build with `npm ci` and `npm run build`. The commands below use the compiled CLI. `plan` performs a read-only inspection and prints the proposed operations; `apply` accepts that saved plan, then `verify` accepts both saved artifacts and performs a fresh read. Supply `GH_TOKEN` or `GITHUB_TOKEN` with repository label write permission when a plan requires changes. Read-only commands can use public GitHub access without a token, subject to GitHub's access limits.

```text
node dist/src/cli.js inspect --owner OWNER --repo REPO
node dist/src/cli.js plan --owner OWNER --repo REPO > plan.json
node dist/src/cli.js apply --owner OWNER --repo REPO --plan plan.json > apply.json
node dist/src/cli.js verify --owner OWNER --repo REPO --plan plan.json --apply-report apply.json
```

The target must be a public GitHub.com repository owned by a personal account with Issues enabled. `apply` stops when the relevant managed state has changed since planning. A failed or partial run should be followed by a new Inspect and Plan. Output is JSON on stdout; a nonzero exit code means blocked, failed, unverifiable, or nonconforming work. Run `npm test` for deterministic reconciliation and adapter tests.

## Security

Please see [SECURITY.md](SECURITY.md). Do not disclose suspected vulnerabilities in a public issue.

## License

MIT. See [LICENSE](LICENSE).
