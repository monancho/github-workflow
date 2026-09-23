# Contributing to github-workflow

## Purpose and authority

This document describes how maintainers and executors contribute to this
repository. Product behavior is defined by
[`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md); this contribution policy does
not redefine that contract.

A tracked GitHub Issue is the execution contract for work that warrants
independent tracking. Before acting, an executor reads the Issue, its latest
relevant comments, and the current canonical repository documentation. The Issue
must make the objective, scope,
acceptance or completion conditions, constraints, and authority boundary clear
enough to execute.

## Planning, records, and working context

Executors form an implementation plan appropriate to the work. For supervised
repository changes, the Main Supervisor records a concise Implementation Plan
with the Issue before delegation; later material changes are recorded there too.
Do not require or create standalone GOAL, PLAN, PROGRESS, EXECUTION, or EVIDENCE
files for every Issue. The Issue and Sub-Issues hold tracked work and
decomposition; the Dedicated User Project holds live work state; and linked Pull
Requests, review, and Actions hold change and verification history.

For long-running, multi-session, handoff-sensitive, or context-loss-prone work,
an executor MAY maintain one Issue-scoped, non-canonical working-context artifact
when it materially reduces continuation risk. It may contain the current plan,
checkpoint, material working decisions, blockers or open questions, next action,
and verification performed or pending. It does not replace the Issue, Project
state, canonical documentation, specifications, or Pull Request evidence.

`docs/` is durable human-readable authority. Specifications are durable
implementation-facing contracts, not task-plan storage. Reusable curated research
may be retained as Resource or reference material; it is evidence and input, not
product authority. Raw search and session logs are not automatically durable
resources. On completion, promote durable information to the appropriate
canonical document, specification, ADR, or Pull Request evidence; transient
working context may be removed.

## Repository work intake and queue

For a repository-level request, inspect durable GitHub state before selecting an
Issue: open and relevant recently closed Issues with Dedicated User Project
Status/membership; native Sub-Issues and dependencies; material comments,
linked open PRs, unresolved review and available checks, blockers and decisions,
milestone scope, untriaged work, and
parent coordination. Distinguish Ready, active, Review/rework, blocked,
needs-decision, Discovery/future, and terminal work. Repair missing required
Project membership under the existing Core Profile rules; do not guess a Status.

Select only work that is authorized, has no unsatisfied real prerequisite,
unresolved external `blocked` condition, or blocking decision, and fits current
sequencing and release scope. A Ready or In Progress Issue with an unresolved
external blocker is not actionable even without a native Issue Dependency.
Prefer continuing applicable active or review work before starting unrelated
Ready work. Re-scan after each merge, decision, or terminal outcome. For this
repository's current dogfooding sequence, the recorded direction is #22 → #21 →
#14/PR #18 → #15 → #12 in the latest relevant
[#21 comment](https://github.com/monancho/github-workflow/issues/21#issuecomment-5787816024).
Verify the actual queue after each outcome; this sequence is not a general Core
Profile setting.

Treat an in-scope finding within the current Issue's authorization envelope.
Create a normal tracked Issue for independent work already authorized to execute;
use a Sub-Issue when it decomposes parent work. When value, scope, or placement
is materially uncertain, create Discovery work in Backlog to decide whether to
Adopt, Split, Defer, or Reject it. Do not create GitHub work for a detail with no
independent tracking value. Issue creation records work and does not grant
execution authority. A finished Discovery may close as `Completed` even when
its decision is Reject; cancelling the decision work itself uses `Not planned`.
Optional `kind/discovery` is classification metadata only, not managed Core
Profile state or a substitute for Project Status, milestone, dependency, or
condition labels.

Read relevant comments on every start or resumption. Record material plan
changes, decisions, blocker resolutions, and review findings in GitHub;
notification read/unread state is not acknowledgement. Per-comment receipts and
separate actor identities are not v0.1.0 requirements.

## Repository-change workflow

For a repository change, the default supervised lifecycle is:

1. Scan repository work, select an authorized actionable Issue, and inspect its
   latest relevant comments, applicable canonical documentation, Project state,
   blockers and dependencies, and any linked PR, review, and checks.
2. Confirm required Dedicated User Project membership, repairing it if missing,
   then move the Issue to `In Progress`. Record the approved Implementation Plan
   and bounded delegation context with the Issue.
3. Create or reconstruct one short-lived isolated Child worktree and branch for
   the active Issue. The Child Executor reads its authorizing Issue, material
   comments, plan, canonical docs, and existing PR/review feedback, then performs
   only in-scope repository-file work.
4. The Child verifies proportionally to risk, commits and pushes, and opens or
   updates the linked review-ready PR with concise evidence. The Child does not
   merge.
5. Move the Issue to `Review`. Main independently reviews the current PR revision
   and performs or coordinates acceptance-oriented QA. Record blocking findings
   in GitHub and return normal in-scope corrections to the same Child and PR.
6. After the Quality Gate passes, Main checks Merge Authority separately. Merge
   only when the autonomous envelope below permits it or a specific human
   integration decision authorizes it. Otherwise record the decision needed and
   leave the PR for human handoff.
7. After merge or terminal non-completion, reconcile the Issue, Project, and
   parent; confirm durable continuation; clean up the finished Child worktree and
   stale local branch as appropriate. Re-scan GitHub before selecting the next
   authorized actionable Issue.

Main remains Supervisor and Reviewer: it chooses work from a repository-wide
scan, records direction, delegates bounded execution, checks the result, decides
the integration route, and reconciles outcomes. It does not modify Child-branch
repository files while reviewing except for an explicitly documented exception.
The default loop is serial; finish or intentionally suspend the current active
or review work before making a Child worktree for unrelated work. Parallel Child
worktrees need an explicit reason with no shared-state or review conflict.
GitHub, not accumulated worktrees, remains the durable work queue. Worktree
topology is this repository's execution technique, not a public Core Profile
requirement or a Sub-Issue relationship.

“Ready for a PR” is not executor completion when a repository change is
required. The linked, review-ready Pull Request must exist.

**Executor Complete** means the work has been implemented, verified, committed,
pushed, and handed off through a review-ready Pull Request. **Work Done** means
the appropriate integration or review authority has accepted the result and the
tracked Issue has reached its terminal outcome.

The Child handoff must be reconstructable from the Issue body and material
comments, PR body and diff, review findings and responses, canonical docs, and
committed/pushed branch. Uncommitted or unpushed work is not durable handoff
state. Before removing a Child worktree or changing sessions, record any missing
material context in GitHub. No former session, agent transcript, model choice,
or permanent Child worktree is needed to continue.

## Independent Review and QA

Main reviews beyond Child self-verification: Issue scope and acceptance,
requirement traceability, architecture/spec semantics, cross-document and
cross-phase information flow, edge and adversarial cases, unrelated changes,
and verification evidence as applicable. Specification work needs semantic
contract review, not only formatting or requirement-ID checks.

QA tests the authorizing acceptance conditions at a depth proportionate to risk.
Consider success, no-op, failure, recovery, idempotency, and live integration
behavior where applicable. For a documented low-risk change, the same independent
Reviewer may perform QA. Child self-verification alone never satisfies the
independent Quality Gate. Record relevant findings and evidence in the PR.

## Pull Request feedback

Use the same Pull Request and its branch for normal in-scope revisions:

```text
Pull Request
→ review or comment
→ executor reads unresolved feedback
→ in-scope correction
→ verification
→ commit and push to the same branch
→ same Pull Request updates
→ re-review
```

Do not open a replacement Pull Request merely because review feedback requires a
change. If feedback requires a material scope change, acceptance-condition
change, public-contract change, or security or governance decision outside the
approved authorization envelope, surface it with `needs-decision` rather than
silently implementing it.

## Merge Authority and follow-through

Ask three separate questions: **Execution Authority** permits implementation
within the approved envelope; **Quality Gate** means independent Review and
risk-proportionate QA passed on the current PR revision; **Merge Authority**
permits integration. Approval to implement and a passing Quality Gate do not
themselves authorize merge.

Main may merge autonomously only when all of these hold:

- the work and result remain within the approved scope and acceptance conditions;
- independent Review and applicable QA passed on the current PR revision;
- required checks passed and verification evidence is sufficient;
- blocking review findings, disagreements, and decisions are resolved;
- the integrating actor has merge authority and no separate human integration
  authority is required; and
- none of the human-decision categories below applies.

Human integration judgment is required for material scope or acceptance changes,
public-contract or requirements changes, significant architecture changes needing
separate authority, support-boundary changes, security or governance boundary
changes, destructive changes to unrelated state, and releases. Unresolved
Reviewer/QA disagreement, ambiguous or insufficient verification, and explicit
`needs-decision` also stop autonomous merge. Record the decision needed in the
Issue or PR. A specific human approval may authorize Main to merge that PR after
its Quality Gate passes; it does not authorize autonomous merge for later PRs.
If no checks are configured, use applicable manual evidence; do not claim absent
evidence is a passed check.

After a child work item reaches a terminal outcome, inspect remaining child
Issues, blockers, and parent acceptance conditions. A Child PR handoff or merge
does not automatically complete the parent. Reconcile the parent's Issue and
Project state without duplicating each child's canonical record or treating a
Sub-Issue as new execution authority. Then re-scan the repository queue before
creating the next Child worktree.

## GitHub-native decomposition and blockers

Create a native Sub-Issue only when newly discovered work has independent
tracking value. A Sub-Issue is work decomposition and containment; it is not an
agent delegation unit, and one executor may process multiple work items.

Creating a Sub-Issue records independently trackable discovered work; it does
not by itself authorize that work's execution. Starting independent new work
requires authority already granted by the current authorization envelope or
separate authorization.

Create a native Issue Dependency only for a real blocking relationship. Do not
use dependencies for relatedness, artificial serialization, or ordinary
implementation steps. Use the `blocked` label for an external blocker that
cannot be represented as a dependency on tracked work.

## GitHub-setting-only work

When an Issue authorizes only native GitHub configuration changes, use:

```text
Inspect → Apply → Verify
```

Do not create an artificial repository Pull Request. Record concise,
reproducible evidence in the Issue and close it only after the required actual
state has been verified.

## Authority and safety

Executors make implementation decisions autonomously within the approved Issue
scope, acceptance conditions, and constraints. Do not autonomously cross these
boundaries:

- material scope or acceptance-condition changes;
- public-contract changes;
- security or governance boundary changes;
- starting independent new work without authority from the current authorization
  envelope or separate authorization;
- release authority; or
- destructive changes to unrelated configuration.

When work crosses one of these boundaries, stop the affected work and record the
decision needed in GitHub. Continue with another independent executable work item
when one exists.

## Small-batch practice

Prefer small, independently reviewable changes, short-lived branches, continuous
verification, proportional review, and a releaseable `main` branch. Keep
documentation synchronized with implementation. Do not add Scrum ceremonies,
story points, difficulty scoring, agent or model metadata, token telemetry, or
other workflow metadata that is outside the product contract.

## Supported environment

The verified v0.1.0 support boundary is GitHub.com public repositories owned by
personal accounts, using capabilities available on GitHub Free. Do not present
organization-owned, private, enterprise, cross-owner, or shared
multi-repository environments as supported without an approved requirements and
verification update.
