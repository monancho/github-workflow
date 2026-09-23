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

type TrackedIssueRef = {
  number: number;
  nodeId?: string;
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

Each managed resource has a stable identity and a resource-specific desired
state. The initial resource kinds are:

```ts
type ResourceKind =
  | "repository-issues"
  | "dedicated-project"
  | "project-statuses"
  | "managed-label"
  | "issue-project-membership";

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
    | "ensure-issue-project-membership";
  preconditions: readonly OperationPrecondition[];
  dependsOn: readonly string[];
  expectedEffect: string;
  permittedRepairMethods?: readonly RepairMethod[];
};

type ReconciliationPlan = {
  phase: "plan";
  target: TargetRef;
  profile: ProfileRef;
  inspectionFingerprint: string;
  operations: readonly PlannedOperation[];
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

Before its first mutation, Apply re-inspects every resource referenced by an
operation precondition. A changed fingerprint, missing identity, new ambiguity,
or unsupported capability produces `blocked` with no mutation to that resource.
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

interface Verifier {
  verify(request: ReconciliationRequest): Promise<VerificationReport>;
}
```

`verified` is permitted only when every required managed resource, including
selected tracked-Issue Project membership, is `conforming`. `unsupported`,
`unverifiable`, `failed`, and any `non-conforming` resource make the overall
result non-success. Verification reads fresh target state and does not reuse an
Apply report as evidence.

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
compatible, a `no-change` plan, an Apply report with no operations, and a fresh
`verified` report. After a partial failure, the recovery path is a new Inspect
and Plan. It reuses compatible changes and proposes only the remaining managed
deltas; it never assumes the prior plan still applies.

## 10. Observability and test contract

All phase reports are serializable structured output. Renderers may add
human-readable summaries but must derive them from the report and apply the
same redaction rules. Required safe fields are phase, target, profile,
resource identity, operation identity, classification or outcome, and safe
diagnostics.

| Test layer | Contract evidence |
| --- | --- |
| Unit | Pure planning, stable operation order, no-change outcome, dependency handling, and redaction. |
| Adapter contract | Normalized Inspect findings, capability absence, pagination, precondition checks, API failures, and safe diagnostics using fixtures or mocks. |
| Live | Explicit supported GitHub.com test target exercises Inspect → Plan → Apply → Verify, a second no-op run, missing membership repair, and seeded unrelated-state preservation. |

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
| Secret-safe, least-privilege adapter boundary | NFR-005–NFR-006 |
| Agent-neutral and repository-independent state | FR-016, NFR-002, RI-001–RI-006 |
| End-to-end verification evidence | SC-001–SC-003, SC-009 |

Implementation code and tests must preserve these contracts. A change to public
workflow semantics, required native objects, permissions, or support claims
remains subject to the separate authority rules in the requirements baseline.
