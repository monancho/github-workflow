# v0.1.0 Reconciliation Contract

Status: v0.1.0 implementation-facing contract

This specification defines the contracts that implement the Provisioning
Capability architecture in [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
It refines implementation boundaries without changing the public workflow
contract in [`../docs/REQUIREMENTS.md`](../docs/REQUIREMENTS.md) or
[`../docs/WORKFLOW_SPEC.md`](../docs/WORKFLOW_SPEC.md).

The examples use TypeScript-like notation because the selected implementation
runtime is TypeScript on Node.js. They define structural contracts, not a
requirement to expose these types as a public SDK.

## 1. Invariants

- GitHub is the durable target state. Plans, results, and diagnostics are
  process output, not a replacement state store.
- A phase result is agent-neutral and contains no executor, model, or token
  metadata.
- `Inspect` and `Plan` perform no remote mutation.
- `Apply` executes only planned managed-resource operations whose preconditions
  still hold.
- `Verify` reads fresh target state. Apply completion is never verification
  success by itself.
- Unrelated configuration is observable when relevant but never an operation
  target.
- Secrets, credentials, and authorization headers are excluded from observable
  plans, results, events, and verification reports.

## 2. Shared identities and profile input

```ts
type TargetRef = {
  owner: string;
  repository: string;
};

type ProfileRef = {
  name: "v0.1.0-core-profile";
  version: string;
};

type StandardProjectStatus =
  | "Backlog"
  | "Ready"
  | "In Progress"
  | "Review"
  | "Done";

type AuthorizedInitialStatus = {
  status: StandardProjectStatus;
  authorizationRef: string;
};

type TrackedIssueRef = {
  number: number;
  nodeId?: string;
  authorizedInitialStatus?: AuthorizedInitialStatus;
};

type ReconciliationRequest = {
  target: TargetRef;
  profile: ProfileRef;
  trackedIssues: readonly TrackedIssueRef[];
};
```

`trackedIssues` is explicit input. The contract does not infer a new definition
of which repository Issues are tracked. An empty selection is valid for Core
Profile inspection, but cannot establish membership for an Issue that the
operator declares as participating in lifecycle management.

`authorizedInitialStatus` is optional, non-secret evidence that an authorized
workflow action assigns an applicable status other than the default `Backlog`.
It is considered only when the current plan establishes Project membership. It
does not override the required `Done` status for a closed Issue.

Each managed resource has a stable identity and a resource-specific desired
state. The initial resource kinds are:

```ts
type ResourceKind =
  | "repository-issues"
  | "dedicated-project"
  | "project-statuses"
  | "managed-label"
  | "issue-project-membership"
  | "issue-initial-project-status"
  | "closed-issue-project-status";

type ResourceIdentity = {
  kind: ResourceKind;
  key: string;
};
```

The `key` is deterministic within a target and profile. An Issue membership key
contains both the selected Issue identity and the Dedicated User Project
identity. A Pull Request is never a membership resource when its tracked Issue
exists.

## 3. Desired and observed state

```ts
type DesiredResource = {
  identity: ResourceIdentity;
  desired: unknown;
  comparison: "exact" | "contains-required-values" | "membership-present";
};

type ObservationClass =
  | "missing"
  | "compatible"
  | "conflicting"
  | "ambiguous"
  | "unrelated"
  | "unsupported"
  | "unverifiable";

type ResourceObservation = {
  identity: ResourceIdentity;
  classification: ObservationClass;
  actual?: unknown;
  safeDiagnostics: readonly string[];
};

type CapabilityFinding = {
  capability: string;
  status: "available" | "unavailable" | "unknown";
  safeDiagnostics: readonly string[];
};
```

`actual` contains only normalized, non-secret values needed for comparison. A
resource is **unrelated** only when it is outside all declared managed resource
identities; an existing object that collides with a managed identity is instead
**compatible**, **conflicting**, or **ambiguous**.

The desired membership resource requires `membership-present`. Native Auto-add
is recorded as a capability finding and may be preferred when available, but is
not the resource's sole satisfying mechanism. A missing membership remains a
managed delta until an allowed repair is verified.

Lifecycle status effects are explicit event-scoped resources. When a plan adds
an open Issue to the Dedicated User Project, it also declares an
`issue-initial-project-status` resource with desired status `Backlog`, unless
that Issue has an `authorizedInitialStatus`. A selected Issue already closed at
Inspect instead requires `Done`, not an intermediate `Backlog`. When Inspect or
Verify finds a selected Issue closed, it declares or checks a
`closed-issue-project-status` resource with desired status `Done`. These
resources make the required lifecycle effects planable and verifiable without
treating them as an implicit side effect of membership.

## 4. Inspect contract

```ts
type InspectionReport = {
  phase: "inspect";
  target: TargetRef;
  profile: ProfileRef;
  observedAt: string;
  stateFingerprint: string;
  capabilities: readonly CapabilityFinding[];
  resources: readonly ResourceObservation[];
  unrelatedSummary: readonly ResourceIdentity[];
  outcome: "inspected" | "unsupported" | "unverifiable" | "failed";
  safeDiagnostics: readonly string[];
};

interface Inspector {
  inspect(request: ReconciliationRequest): Promise<InspectionReport>;
}
```

Inspect reads only the GitHub state needed to classify declared resources,
selected Issue membership, and relevant capabilities. Missing read access,
unsupported capability, pagination failure, or an incomplete response must be
represented explicitly; Inspect must not synthesize a compatible observation.

## 5. Plan contract

```ts
type RepairMethod =
  | "native-auto-add"
  | "provisioning-reconciliation"
  | "executor-reconciliation"
  | "explicit-addition";

type OperationPrecondition = {
  resource: ResourceIdentity;
  expectedFingerprint: string;
};

type PlannedOperation = {
  id: string;
  resource: ResourceIdentity;
  kind:
    | "ensure-repository-issues"
    | "ensure-dedicated-project"
    | "ensure-project-statuses"
    | "ensure-managed-label"
    | "ensure-issue-project-membership"
    | "ensure-issue-initial-project-status"
    | "ensure-closed-issue-project-status";
  preconditions: readonly OperationPrecondition[];
  dependsOn: readonly string[];
  expectedEffect: string;
  permittedRepairMethods?: readonly RepairMethod[];
};

type InitialStatusExpectation = {
  resource: ResourceIdentity & { kind: "issue-initial-project-status" };
  membershipOperationId: string;
  statusOperationId: string;
  expectedStatus: StandardProjectStatus;
  authorizationRef?: string;
};

type ReconciliationPlan = {
  phase: "plan";
  target: TargetRef;
  profile: ProfileRef;
  requestFingerprint: string;
  inspectionFingerprint: string;
  planFingerprint: string;
  operations: readonly PlannedOperation[];
  initialStatusExpectations: readonly InitialStatusExpectation[];
  warnings: readonly string[];
  blockedResources: readonly ResourceObservation[];
  outcome: "no-change" | "ready" | "blocked";
};

interface Planner {
  plan(
    request: ReconciliationRequest,
    inspection: InspectionReport,
  ): ReconciliationPlan;
}
```

Planning is pure: it compares normalized desired and observed state without
calling a mutation API. `no-change` has an empty operation list and no blocking
resource. `ready` contains only minimal ordered operations for missing or
reconcilable managed state. `blocked` contains no operation that would overwrite
a conflicting, ambiguous, unsupported, or unverifiable resource.

An `ensure-issue-project-membership` operation declares the allowed repair
methods applicable to its inspection. The production implementation selects an
available method without treating native Auto-add as mandatory. If no allowed
repair is executable under the current authority or capability, planning reports
the membership resource as blocked rather than silently omitting it.

For new membership of an open Issue, `ensure-issue-initial-project-status`
depends on the corresponding membership operation and sets the Project item's
status to `Backlog` unless an `authorizedInitialStatus` is present. For a
selected closed Issue, `ensure-closed-issue-project-status` sets that Issue's
Project item to `Done`, including when membership is newly established. Both
operation kinds have independent resource identities and preconditions, so a
lifecycle status mismatch is visible even when membership is already present.

The plan carries exactly one typed `initialStatusExpectation` per planned new
membership of an open Issue. It binds that membership operation, its dependent
initial-status operation, the Issue/Project resource identity, and the expected
`Backlog` or authorized status (including the non-secret authorization
reference). A selected Issue whose membership was already present at Inspect
has no initial-status expectation; its later `In Progress` or `Review` status
is not reset to `Backlog`. A selected Issue already closed at Inspect instead
gets the `Done` operation and no initial-status expectation. The
`requestFingerprint` covers the normalized target, profile, selected Issue
identities, and authorized initial-status inputs. The `planFingerprint` covers
the immutable plan content other than itself. These bindings let later phases
reject a mismatched request or plan without relying on session memory.

## 6. Apply contract

```ts
type OperationOutcome =
  | "applied"
  | "already-conforming"
  | "blocked"
  | "failed"
  | "not-attempted";

type AppliedOperation = {
  operation: PlannedOperation;
  outcome: OperationOutcome;
  safeDiagnostics: readonly string[];
};

type ApplyReport = {
  phase: "apply";
  planFingerprint: string;
  preflightInspectionFingerprint: string;
  operations: readonly AppliedOperation[];
  outcome: "applied" | "no-change" | "blocked" | "partial-failure" | "failed";
  safeDiagnostics: readonly string[];
};

interface Applier {
  apply(plan: ReconciliationPlan): Promise<ApplyReport>;
}
```

Before its first mutation, Apply validates the plan fingerprint and re-inspects
every resource referenced by an operation precondition. A changed fingerprint,
missing identity, new ambiguity, or unsupported capability produces `blocked`
with no mutation to that resource.
An operation is also re-checked immediately before mutation when a GitHub API
conditional write is unavailable.

Apply processes operations in dependency order. On a failed or blocked
operation, it does not attempt dependent operations; they are reported as
`not-attempted`. The report is `partial-failure` whenever a prior mutation may
have succeeded before a later failure. Neither `applied` nor `no-change` is a
conformance claim; callers must run Verify.

## 7. Verify contract

```ts
type VerificationStatus =
  | "conforming"
  | "non-conforming"
  | "unsupported"
  | "unverifiable";

type ResourceVerification = {
  resource: ResourceIdentity;
  status: VerificationStatus;
  safeDiagnostics: readonly string[];
};

type VerificationReport = {
  phase: "verify";
  target: TargetRef;
  profile: ProfileRef;
  verifiedAt: string;
  resources: readonly ResourceVerification[];
  outcome: "verified" | "non-conforming" | "unsupported" | "unverifiable" | "failed";
  safeDiagnostics: readonly string[];
};

type VerificationInput = {
  request: ReconciliationRequest;
  plan: ReconciliationPlan;
  applyReport: ApplyReport;
};

interface Verifier {
  verify(input: VerificationInput): Promise<VerificationReport>;
}
```

Verify accepts the same serialized plan and Apply report as the execution being
checked, including a `no-change` plan and report. Before making a conformance
claim, it checks the plan's target, profile, request fingerprint, and canonical
plan fingerprint against the request, and checks the Apply report's
`planFingerprint` and operation identities against that plan. A missing,
incomplete, contradictory, or mismatched expectation or phase binding is
`unverifiable`. In particular, each planned new membership of an open Issue
must have its matching typed expectation, while an already-present membership
must not acquire one. A `blocked`, `partial-failure`, or `failed` Apply report
cannot yield `verified`. Apply's reported operation success is never evidence
that the expected GitHub state exists.

`verified` is permitted only when every required managed resource, including
selected tracked-Issue Project membership, is `conforming`. `unsupported`,
`unverifiable`, `failed`, and any `non-conforming` resource make the overall
result non-success. Verification reads fresh target state and does not reuse an
Apply report as evidence.

Fresh verification includes the plan's event-scoped initial-status expectations
and the selected Issues' current closed state. For each planned new membership
of an open Issue, Verify re-reads that Project item and compares its current
Status to the typed expected value, regardless of whether Apply claimed the
operations succeeded or an allowed Auto-add mechanism established membership.
An authorized override is checked against the declared status and authorization
reference; an absent or unreadable item or Status is non-conforming or
unverifiable, never conforming.
For a selected Issue that is closed in the fresh read, Verify requires `Done`
even if it was open during Inspect or Apply. It does not infer that every open
tracked Issue should be `Backlog`: membership already present before this plan
is checked for presence, not an initial status. A later, separate reconciliation
uses its own plan and does not carry forward an old initial-status expectation.
If an Issue closes or receives another authorized transition between its
initial-status write and Verify, a current-state read cannot prove that its
earlier initial status was correct. Verify reports that event expectation as
`unverifiable`; `Done` is still checked for a now-closed Issue. A fresh run with
a new Inspect and Plan is the recovery path rather than silently treating the
older expectation as a new requirement to reset an Issue's status.

## 8. GitHub adapter boundary

The reconciliation domain depends on a port that can read normalized managed
state, discover capabilities, evaluate preconditions, and execute one planned
operation. The production adapter alone translates this port into authenticated
GitHub REST or GraphQL calls.

```ts
interface GitHubPort {
  inspectManagedState(request: ReconciliationRequest): Promise<InspectionReport>;
  checkPreconditions(operations: readonly PlannedOperation[]): Promise<InspectionReport>;
  execute(operation: PlannedOperation): Promise<AppliedOperation>;
}
```

The port returns normalized domain values and safe diagnostics. Authentication
mechanisms, HTTP headers, tokens, and raw secret-bearing responses do not cross
this boundary.

## 9. Preservation, idempotency, and recovery

Only a `PlannedOperation` for a declared managed identity may mutate GitHub.
An existing unrelated label, Project, field, Issue, or Pull Request remains
outside the plan even when Inspect reports it for diagnostic context. An
arbitrary existing Project must be classified before any Dedicated User Project
operation; it is never repurposed merely to satisfy a plan.

A conforming second run produces `InspectionReport` observations classified as
compatible, a `no-change` plan with no initial-status expectations, an Apply
report with no operations, and a fresh `verified` report. After a partial
failure, the recovery path is a new Inspect and Plan. It reuses compatible
changes and proposes only the remaining managed deltas; it never assumes the
prior plan still applies.

## 10. Observability and test contract

All phase reports are serializable structured output. Renderers may add
human-readable summaries but must derive them from the report and apply the
same redaction rules. Required safe fields are phase, target, profile,
resource identity, operation identity, classification or outcome, and safe
diagnostics.

| Test layer | Contract evidence |
| --- | --- |
| Unit | Pure planning, stable operation order, no-change outcome, event-scoped initial-status expectations and phase binding, lifecycle-status dependencies, and redaction. |
| Adapter contract | Normalized Inspect findings, capability absence, pagination, membership and lifecycle-status writes, precondition checks, API failures, and safe diagnostics using fixtures or mocks. |
| Live | Explicit supported GitHub.com test target exercises Inspect → Plan → Apply → Verify, a second no-op run, missing membership repair, initial `Backlog` or authorized override, closed-Issue `Done`, and seeded unrelated-state preservation. |

Verification fixtures also cover an already-present membership later in
`In Progress` or `Review`, a missing or stale event expectation, a fresh-read
status mismatch despite reported Apply success, and non-success for unsupported,
unverifiable, blocked, or partially failed outcomes.

No test fixture, plan, report, or log may contain a credential. Live tests are
opt-in and use explicit target input; they do not create hidden persistent state
or broaden the supported environment.

## 11. Requirement mapping

| Contract area | Primary requirements |
| --- | --- |
| Managed identities, observations, and unrelated-state boundary | FR-017, FR-019, FR-024 |
| Pure plan and ordered minimal operations | FR-018, FR-020–FR-021, FR-025 |
| Preconditions, conflicts, and recovery | FR-023, FR-026–FR-027, NFR-004 |
| Fresh verification and explicit non-success outcomes | FR-022, FR-027, NFR-004 |
| Project membership and optional Auto-add repair | FR-030–FR-033, FR-039–FR-040 |
| Initial and closed-Issue lifecycle status effects | FR-031–FR-032 |
| Secret-safe, least-privilege adapter boundary | NFR-005–NFR-006 |
| Agent-neutral and repository-independent state | FR-016, NFR-002, RI-001–RI-006 |
| End-to-end verification evidence | SC-001–SC-003, SC-009 |

Implementation code and tests must preserve these contracts. A change to public
workflow semantics, required native objects, permissions, or support claims
remains subject to the separate authority rules in the requirements baseline.
