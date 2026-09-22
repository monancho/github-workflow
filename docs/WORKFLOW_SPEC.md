# github-workflow v0.1.0 Workflow Specification

Status: v0.1.0 behavioral specification

This document specifies the public workflow behavior of `github-workflow`.
[`REQUIREMENTS.md`](REQUIREMENTS.md) is the controlling requirements baseline;
this specification explains that baseline without selecting an implementation
language, runtime, CLI, storage model, or backend architecture.

## 1. Terms and responsibilities

| Term | Operational meaning |
| --- | --- |
| Tracked Issue | A GitHub Issue for independently trackable work and its canonical work state. |
| Sub-Issue | Native work decomposition and containment. It is not agent delegation. |
| Issue Dependency | A native relationship that records a real blocking relationship between tracked work items. |
| Dedicated User Project | The native User Project dedicated to exactly one target repository. |
| Project membership | Representation of a tracked Issue as an item in its Dedicated User Project. |
| Project Status | The lifecycle phase held in the Dedicated User Project. |
| Pull Request | A linked repository-change and integration artifact, not the canonical work-state record. |
| Authorization envelope | Approved scope, acceptance conditions, and constraints for execution. |
| Managed state | Native GitHub state the Core Profile reconciles. |
| Unrelated configuration | Existing target state outside the managed-state boundary. |
| Close reason | `Completed` for successful completion or `Not planned` for intentional non-completion. |

Maintainer, Executor, Reviewer, and Release Authority are logical roles. Their
authority does not depend on whether the actor is human or an AI agent.

## 2. Work identification and decomposition

Independently trackable work uses a tracked Issue. A tiny repository edit may use
a PR-only fast path when it has no independent scope, acceptance conditions,
dependency, decision, or durable tracking value. A PR-only fast path does not
make Pull Requests the canonical work-state holder for tracked work.

Use a Sub-Issue when discovered work is independently trackable. One executor
may process many work items. Parallel execution is an optimization, not workflow
semantics, and a Sub-Issue is never a one-to-one assignment to an agent.

Use an Issue Dependency only when one tracked work item genuinely blocks another.
Do not use it for relatedness, ordinary sequencing, or artificial serialization.

## 3. Lifecycle and conditions

The Project Status lifecycle is:

```text
Backlog → Ready → In Progress → Review → Done
```

`Backlog` is work not yet prepared to start. `Ready` is work that may begin.
`In Progress` is active execution. `Review` is work awaiting applicable review or
integration evaluation. `Done` is terminal. Non-terminal phases may move backward
for rework. Review is optional when the authorization envelope does not require
it.

`Done` alone does not prove successful acceptance. A successfully completed Issue
uses close reason `Completed`. Cancelled or intentionally non-completed work uses
`Not planned` and may also be `Done` as a terminal workflow outcome.

`needs-decision` marks work that needs an authority decision before it can safely
continue. `blocked` marks an external blocker that cannot be represented as a
native Issue Dependency. Known blockers that are tracked work use a native Issue
Dependency instead; `blocked` is not a lifecycle status.

## 4. Issue and Pull Request relationship

For tracked work, the Issue remains the canonical holder of objective, scope,
acceptance conditions, lifecycle state, authority, and completion evidence. A PR
implementing that work links to the authorizing Issue and records the repository
change and integration evidence.

If a PR merge closes its linked Issue, the Issue's acceptance conditions and
required verification must already be satisfied. A PR is not duplicated as a
canonical Project work item when its tracked Issue exists.

## 5. Authority and discovery

Within the authorization envelope, an Executor may make implementation decisions.
Separate authority is required for material scope changes, acceptance-condition
changes, public-contract changes, governance or security boundary changes,
starting independent new work, and releases.

| Discovery | Required handling |
| --- | --- |
| Small in-scope detail | Decide and implement within the authorization envelope. |
| Independently trackable work | Create a native Sub-Issue when decomposition is appropriate. |
| Real blocking tracked work | Create a native Issue Dependency. |
| External blocker | Apply `blocked` and record the blocker in GitHub. |
| Decision requirement | Apply `needs-decision` and record the decision needed. |
| Security-sensitive finding | Stop affected work and use the repository's private reporting path; do not expose sensitive details publicly. |

## 6. Completion paths

Repository-change work is complete for the Executor after inspection, in-scope
implementation, verification, commit, push, and a linked review-ready PR. Review
feedback returns the same PR to the Executor for in-scope correction and
re-verification; it does not require a replacement PR.

GitHub-setting-only work follows `Inspect → Apply → Verify`, records concise
evidence in its Issue, and creates no artificial repository PR. Research or
decision work with no repository change records its result in the tracked Issue
and reaches its appropriate terminal outcome. Intentional non-completion uses the
`Not planned` close reason.

## 7. GitHub Core Profile

For the verified v0.1.0 environment, managed state includes:

- GitHub Issues enabled for the target repository;
- one Dedicated User Project per target repository, owned by the same personal
  account;
- Project Status values exactly `Backlog`, `Ready`, `In Progress`, `Review`, and
  `Done`;
- labels `needs-decision` and `blocked`;
- Project membership for every tracked Issue participating in lifecycle
  management;
- initial `Backlog` for newly added tracked Issues, unless an authorized workflow
  action assigns another applicable status; and
- transition to `Done` when a tracked Issue is closed.

Native GitHub Auto-add is the preferred membership convenience when it is
available and compatible with the supported environment. It is not the sole
required membership mechanism: provisioning reconciliation, executor
reconciliation, or explicit addition may establish or repair Project membership.
An absent required Project item is non-conforming managed state and must be
detectable and repairable. An arbitrary existing Project is not automatically
converted or repurposed as the Dedicated User Project. Pull Requests are not
added or retained as duplicate canonical Project work items for tracked Issues.

## 8. Provisioning behavior

Provisioning follows:

```text
Inspect → Plan → Apply → Verify
```

Inspect discovers enough current state to identify missing managed state,
including required Project membership, compatible existing state, conflicting or
ambiguous state, and unrelated configuration. Plan is observable and makes no
mutation. Apply makes only the minimal changes needed for the approved plan,
including repairing missing Project membership through an allowed mechanism.
Verify compares the result to the Core Profile and reports success or failure.

Compatible native state is reused or reconciled rather than duplicated.
Conflicting or ambiguous state is surfaced rather than silently overwritten.
Unrelated configuration is preserved. A second run against an unchanged conforming
target is a no-op: it makes no unnecessary changes. Planned changes, applied
changes, verification results, and failures are observable; a partially verified
result is not reported as success. Provisioning output does not expose
credentials, authentication tokens, or other secret values, and it should require
no broader GitHub permissions than the requested operation needs.

## 9. Agent and repository independence

The workflow does not depend on Orca, Codex, or any other specific agent product.
Model selection, sub-agent topology, reasoning level, token use, and telemetry
are outside the Core Workflow Contract.

After provisioning, normal repository operation depends on durable native GitHub
state, not a `github-workflow` runtime, service, task database, or required
repository configuration file. Dependence on the native Dedicated User Project is
permitted.

## 10. Support boundary and traceability

v0.1.0 support is limited to public GitHub.com repositories owned by personal
accounts, using GitHub Free capabilities, for solo maintainers and small teams.
Organization-owned repositories, private repositories, enterprise environments,
cross-owner Projects, and shared multi-repository Projects are not supported
claims.

This specification materially covers FR-001–FR-040, NFR-001–NFR-009,
CON-001–CON-005, PC-001–PC-003, RI-001–RI-006, and
SUP-001–SUP-003. Requirement changes follow the traceability rules in
`REQUIREMENTS.md`; examples and implementation possibilities are not additional
normative commitments.
