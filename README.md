# github-workflow

> Status: Planning / Experimental

`github-workflow` is a GitHub-native, agent-neutral software delivery workflow for humans and AI agents working under the same durable work contract.

The project is currently moving from planning into repository bootstrap. The product definition and initial workflow decisions are complete; implementation has not started yet.

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
- Implementation: not started
- First public release target: `v0.1.0`

Detailed requirements and specifications will be added through the repository's formal Issue → branch → Pull Request workflow.

## Security

Please see [SECURITY.md](SECURITY.md). Do not disclose suspected vulnerabilities in a public issue.

## License

MIT. See [LICENSE](LICENSE).
