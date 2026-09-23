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
| Discovery work | Tracked decision work about uncertain value, scope, or placement before independent implementation is approved; a work kind, not a Project Status. |
| Authorization envelope | Approved scope, acceptance conditions, and constraints for execution. |
| Implementation Plan | Concise durable execution direction recorded with the tracked Issue before delegation. |
| Quality Gate | Independent Review and acceptance-oriented QA required before integration. |
| Merge Authority | Authority to integrate a result after its Quality Gate, separately from execution authority. |
| Managed state | Native GitHub state the Core Profile reconciles. |
| Unrelated configuration | Existing target state outside the managed-state boundary. |
| Close reason | `Completed` for successful completion or `Not planned` for intentional non-completion. |

Maintainer, Supervisor, Executor, Reviewer, QA, Merge Authority, and Release
Authority are logical roles. The Supervisor coordinates the queue and handoffs;
the Executor performs bounded work; the Reviewer assesses the result independently
of Executor self-check; QA checks acceptance behavior; Merge Authority decides
integration. One person may hold multiple roles, but performing Executor
self-verification does not itself count as independent Review or QA. Authority
does not depend on whether an actor is human or an AI agent.

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

### Repository work inspection

Before selecting work, inspect the repository's durable GitHub state, not only a
named Issue. Reconstruct the queue from open Issues, relevant recently closed
Issues, and their Dedicated User Project membership and Status; native Sub-Issues
and real Issue Dependencies; latest comments that materially affect plans,
authorization, decisions, blockers, or review; open PRs and their authorizing
Issues; unresolved review feedback and
available checks; condition labels; milestone/release scope; newly discovered or
untriaged work; and parent coordination state where applicable. A PR represents
change and integration, not a second Project work item.

Classify the resulting work as actionable/Ready, active/In Progress,
Review/rework, blocked by a real prerequisite or external condition, awaiting a
human or other authority decision, Discovery or deferred future work, or
terminal/no-action. These categories describe what needs attention; Project
Status remains the canonical lifecycle phase. A missing required Project item is
a membership defect to repair under FR-040, not evidence that an Issue is Ready,
Done, or outside the queue. An untriaged Issue is assessed before execution.

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

## 5. Authority, intake, and queue selection

Within the authorization envelope, an Executor may make implementation decisions.
Separate authority is required for material scope changes, acceptance-condition
changes, public-contract changes, governance or security boundary changes,
starting independent new work, and releases.

When new information appears, apply the following intake decision in order:

| Finding | Required handling |
| --- | --- |
| Detail of current authorized work | Decide and implement within the current authorization envelope. |
| Independent work already authorized to execute | Create a normal tracked Issue, using a native Sub-Issue when decomposition is appropriate, and place it in Backlog or Ready according to its actual readiness. |
| Independent work with material uncertainty about value, scope, or placement | Create Discovery work in Backlog to resolve that uncertainty before authorizing implementation. |
| No independent tracking value | Do not create GitHub work. |

Creating an Issue or Sub-Issue records work but grants no execution authority by
itself. If independent implementation is not already authorized, obtain the
separate authority required by FR-011 before starting it. Classification does
not override the Issue's authorization envelope or the Dedicated User Project's
lifecycle state.

Discovery is a work kind, not a lifecycle phase. It may pass through Backlog,
Ready, In Progress, Review, and Done like other tracked work. Record its decision
in the Issue: **Adopt** creates an executable follow-up Issue after approval;
**Split** creates independently tracked follow-ups; **Defer** preserves an
accepted future item without starting it now; **Reject** records that no
implementation will proceed. A decision-complete Discovery closes as
`Completed`, including a Reject outcome, because its decision work succeeded.
Use `Not planned` when the Discovery work itself was cancelled or intentionally
left unfinished. Follow-up Issue creation alone does not authorize execution.

On the personal-account/GitHub Free baseline, `kind/discovery` MAY be used as a
small compatibility label to make Discovery work easier to find. It is optional
classification metadata, outside the managed Core Profile of FR-028. It does
not encode Project Status, milestone/release scope, hierarchy, dependency, or a
condition such as `needs-decision` or `blocked`. Organization-only Issue Types
are not required.

Other findings retain their native handling:

| Finding | Required handling |
| --- | --- |
| Real blocking tracked work | Create a native Issue Dependency. |
| External blocker | Apply `blocked` and record the blocker in GitHub. |
| Decision requirement | Apply `needs-decision` and record the decision needed. |
| Security-sensitive finding | Stop affected work and use the repository's private reporting path; do not expose sensitive details publicly. |

Select the next work item only after confirming its execution authority, real
prerequisites, absence of an unresolved external blocker or blocking decision,
and compatibility with current sequencing and milestone/release scope. An Issue
with an unresolved external condition recorded by `blocked` is not actionable
even if it is Ready or In Progress and has no native Issue Dependency. Record
resolution and clear the condition label before selecting it. Prefer finishing
applicable In Progress or Review/rework work before starting unrelated Ready
work, unless an explicit policy or blocker explains another choice. Backlog or
Discovery classification does not make independent implementation actionable.
Re-scan GitHub after a merge, decision, or other terminal outcome because the
queue may have changed.

Read relevant comments when starting or resuming work, and record material plan
changes, decisions, blocker resolutions, and review findings durably in GitHub.
Notification read/unread state is not proof of acknowledgement. Per-comment
read receipts, separate human-versus-agent provenance under a shared identity,
and dedicated bot identities are deferred from v0.1.0; they do not block work.

## 6. Completion paths

### 6.1 Supervised repository-change cycle

After the repository-wide inspection in Section 2 and queue selection in Section
5, the Supervisor reads the chosen Issue, latest material comments, applicable
canonical documents, Project state, dependencies and blockers, and any linked PR,
unresolved review, and checks. The Supervisor records a concise Implementation
Plan with the Issue before delegation. That plan identifies the approved direction,
constraints, acceptance and verification approach, and authority boundary; it
does not create new execution authority or a second task-state store.

The Executor receives the authorizing Issue, material comments, approved plan,
affected canonical contracts, existing PR/review feedback on resumption, and the
authority boundary. An isolated worktree and child executor are possible
execution techniques, not required Core Workflow Contract topology. A human or
a different agent product may implement the same logical handoff. The Executor
performs only in-scope work, verifies it, commits and pushes the branch, then
opens or updates the linked review-ready PR with concise evidence. This is
Executor completion, not Work Done; the Executor does not merge its handoff.

The Supervisor arranges Review independent of Executor self-verification. Review
checks the Issue's scope and completion conditions, requirement traceability,
architecture and specification semantics, consistency across documents and
phases, information flow at interfaces, edge and adversarial cases, unrelated
changes, and the evidence appropriate to the change. A specification change
needs semantic contract review, not only formatting and requirement-ID checks.

QA checks that the resulting artifact satisfies the authorizing acceptance
conditions. Its depth follows the risk, including applicable success, no-op,
failure, recovery, idempotency, and live or integration behavior. Reviewer and QA
responsibilities may be combined for a documented low-risk change; the
Executor's self-check alone never closes the independent Quality Gate. Record
blocking findings in GitHub. Normal in-scope corrections return to the same
Executor on the same PR and branch for re-verification and re-review. A decision
outside the authorization envelope is escalated instead of silently included.

The continuation record is the Issue body and material comments, PR body and
diff, review findings and responses, canonical documents, and committed/pushed
branch. Uncommitted or unpushed work is not a durable handoff. Before execution
moves to another session or an isolated worktree is removed, missing material
context must be recorded durably. The workflow must remain resumable without
the former session or worktree; it does not require agent transcripts, model
metadata, or a custom state store.

### 6.2 Merge authority and reconciliation

Decide three questions separately: **Execution Authority** asks whether the work
could be performed; **Quality Gate** asks whether required Review and QA passed
on the current PR revision; **Merge Authority** asks whether this result may be
integrated without a further human decision. An authorized implementation and a
passing Quality Gate do not themselves grant Merge Authority.

Autonomous merge is permitted only if all of the following hold: the work and
result remain within their approved authorization envelope; the current PR
revision passed required independent Review, risk-proportionate QA, and required
checks; blocking feedback and decisions are resolved; the integrating actor has
merge authority; and no human-decision category below applies. An unavailable
optional check does not count as a failure, but missing evidence needed for the
Quality Gate prevents autonomous merge.

A human decision is required before integration for material scope or acceptance
changes, public-contract or requirements changes, significant architecture
changes needing separate authority, support-boundary changes, security or
governance boundary changes, destructive unrelated-state changes, and releases.
Unresolved Reviewer/QA disagreement, insufficient or ambiguous verification,
and explicit `needs-decision` also stop autonomous merge. Record the decision
needed in GitHub; a specific human integration approval can authorize the
Supervisor to perform that merge after the Quality Gate passes, but does not
expand the autonomous envelope for later work. Do not equate execution approval
with that integration decision.

After integration or terminal non-completion, reconcile the linked Issue,
Dedicated User Project, and parent work against their actual outcomes. A child
handoff or merge does not automatically complete its parent. Re-inspect remaining
children, blockers, and acceptance conditions; update the parent to reflect
remaining actionable or terminal work without copying each child's canonical
state into the parent or assuming new execution authority. Preserve durable
continuation before cleaning up finished local execution context. Re-scan the
GitHub queue before choosing the next item; a stale worktree is not a queue.

### 6.3 Other completion paths

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

This specification materially covers FR-001–FR-051, NFR-001–NFR-009,
CON-001–CON-005, PC-001–PC-003, RI-001–RI-006, and
SUP-001–SUP-003. Requirement changes follow the traceability rules in
`REQUIREMENTS.md`; examples and implementation possibilities are not additional
normative commitments.
