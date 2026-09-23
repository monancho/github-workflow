# github-workflow v0.1.0 Provisioning Architecture

Status: v0.1.0 implementation architecture

This document is the canonical implementation architecture for the v0.1.0
Provisioning Capability. It realizes the behavior in
[`REQUIREMENTS.md`](REQUIREMENTS.md) and
[`WORKFLOW_SPEC.md`](WORKFLOW_SPEC.md) without changing their public workflow
contract. The language, CLI shape, and module layout below are implementation
decisions, not additional public compatibility guarantees.

## 1. Scope and constraints

The Provisioning Capability reconciles the managed GitHub Core Profile through
the ordered `Inspect → Plan → Apply → Verify` contract. It targets only the
verified v0.1.0 environment: public GitHub.com repositories owned by personal
accounts using GitHub Free capabilities.

The architecture must preserve native GitHub state as the durable target state.
It has no service, database, daemon, orchestration framework, or persistent
product state. It does not require an agent product, model metadata, or a
repository-resident `github-workflow` configuration file.

## 2. Decisions

| Area | Decision | Rationale |
| --- | --- | --- |
| Runtime and language | TypeScript on a supported Node.js LTS runtime. | Provides a small cross-platform CLI and typed domain model without introducing a running service. |
| CLI boundary | One local CLI exposes `inspect`, `plan`, `apply`, and `verify` commands. Each command targets an explicit GitHub owner and repository and emits structured JSON; a human-readable rendering is derived from that result. | Makes each required phase observable and independently testable. |
| GitHub access | A single GitHub adapter owns authenticated REST and GraphQL calls. Domain, planning, and CLI modules do not call GitHub APIs directly. | Keeps GitHub capability details and authentication at one replaceable boundary. |
| Desired state | A versioned in-process Core Profile declaration describes managed resources and stable identities. It is not written into the target repository or a product database. | Keeps the profile explicit while preserving repository independence. |
| Plan representation | `plan` returns a serializable JSON document containing profile version, target identity, observed-state fingerprint, ordered operations, expected effects, and warnings. It is printed by default and may be saved only at an explicit operator-selected path. | Supports dry runs and review without hidden state. |
| Apply safety | `apply` accepts a plan, re-inspects relevant managed state, and rejects a stale, ambiguous, or unsupported plan before a conflicting mutation. | Prevents a plan from silently overwriting changed target state. |
| Verification | `verify` re-reads managed state from GitHub and reports each requirement-facing resource as conforming, non-conforming, unsupported, or unverifiable. | A successful apply is not treated as proof of compliance. |

## 3. Module boundaries

The first implementation uses the following logical layout. This is a design
map, not a request to create empty directories before code needs them.

```text
src/
  cli/             command parsing, input validation, renderers, exit mapping
  profile/         versioned desired Core Profile resource declarations
  domain/          resource identities, observed state, plans, operations, results
  github/          authenticated GitHub adapter and GitHub-specific translations
  reconcile/       inspect, pure planning, apply coordination, verification
  observability/   redaction, structured events, diagnostics
test/
  unit/            profile, domain, planner, and rendering tests
  contract/        adapter behavior against deterministic fixtures or mocks
  live/            opt-in GitHub.com verification against an explicit test target
```

Dependencies point inward: `cli` and `github` depend on `reconcile` and
`domain`; `reconcile` depends on `profile`, `domain`, and an abstract GitHub
port; `domain` has no GitHub SDK dependency. The production GitHub adapter is
the only implementation of that port in v0.1.0.

## 4. Managed-state model

Each managed resource declares an identity, desired state, and comparison rule.
The initial resource set is limited to the v0.1.0 Core Profile:

- repository Issues availability;
- Dedicated User Project identity and association;
- Project Status values;
- managed labels;
- membership of the explicitly selected tracked Issues in the Dedicated User
  Project; and
- lifecycle effects required for newly added and closed tracked Issues.

The membership resource is keyed by the Issue and Dedicated User Project
identities. Native Auto-add is discovered as an optional convenience; it is not
the identity or sole reconciliation mechanism. A missing required membership
produces a planned repair using an available allowed mechanism. Pull Requests
are not represented as canonical membership resources when their tracked Issue
exists.

The initial architecture does not decide which repository Issues are tracked in
every operational context. The selected tracked-Issue set is explicit command
input to the reconciliation boundary. Its user-facing selection interface and
the exact resource schemas are defined by the follow-on reconciliation-contract
work. This keeps the architecture from inventing a new public tracking rule.

Observed state distinguishes:

- **missing** — a declared managed resource or required membership is absent;
- **compatible** — existing state satisfies the declared comparison rule;
- **conflicting or ambiguous** — existing state cannot be safely reused;
- **unrelated** — state outside the declared resource identities; and
- **unsupported or unverifiable** — GitHub capability or read access cannot
  establish the required result.

Only declared managed resources can produce operations. Unrelated configuration
is recorded for context when discovered but is never mutated by this capability.

## 5. Phase responsibilities

```text
GitHub target
    │
    ├─ Inspect ──> observed state + capability findings
    │                   │
    ├─ Plan <───────────┘  pure desired-versus-observed comparison
    │                   │
    ├─ Apply <──────────── ordered minimal operations + re-inspection guards
    │                   │
    └─ Verify <─────────── fresh observed state + conformance report
```

`Inspect` performs no mutation and collects only the state needed to classify
managed resources, Project membership, capability availability, and unrelated
configuration boundaries. `Plan` is pure: identical desired and observed inputs
produce the same ordered operations and no remote mutation.

`Apply` executes only planned operations after its guard checks. Operations are
small and resource-scoped, such as creating a missing managed label, creating a
Dedicated User Project, adding an Issue to that Project, or changing a managed
Status value. It does not delete, repurpose, or broadly overwrite state to reach
conformance. Each applied operation records its outcome for a later verification
report.

`Verify` is a new read, rather than a restatement of apply results. It compares
the fresh state with the same profile declaration and does not report success if
any required resource is non-conforming, unsupported, or unverifiable.

## 6. Reconciliation and idempotency

The planner normalizes observed managed state before comparison and derives a
minimal ordered operation list. Resource identities are resolved before
creation; compatible state is reused. A conforming target produces an empty
plan, so a second unchanged run has no operations.

Every mutating operation has a precondition based on the inspected identity and
expected state. Before mutation, the GitHub adapter checks the precondition when
the API supports it; otherwise `apply` re-inspects the affected resource. A
changed identity, contradictory state, or ambiguous Project relationship stops
that operation as a conflict rather than overwriting it.

An apply interruption can leave a target partly changed. The result records the
operations completed, failed, and not attempted; it never calls that outcome
successful. A subsequent `inspect` and `plan` are the recovery path. They
reclassify already-completed compatible changes and plan only the remaining
managed deltas.

## 7. Errors, observability, and secret safety

The domain result model distinguishes these operator-visible outcomes:

| Outcome | Meaning | Apply behavior |
| --- | --- | --- |
| Invalid input | Target, profile, or plan input is malformed. | Do not mutate. |
| Authentication or authorization failure | Required GitHub access is absent or denied. | Do not mutate the affected resource. |
| Unsupported capability | The supported target cannot expose a required GitHub capability. | Do not substitute unrelated automation; report non-conformance. |
| Conflict or ambiguity | Existing state cannot be safely reconciled. | Do not overwrite; return the discovered state and required decision. |
| Remote failure | A transient or unexpected GitHub API failure occurred. | Stop the affected operation and report partial state if any mutation preceded it. |
| Verification failure | Fresh state does not match the profile. | Return non-success even if apply requests completed. |

Structured events include the phase, target identity, resource kind, operation
identity, outcome, and safe diagnostics. Renderers redact tokens, authorization
headers, secrets, and any values identified as credentials. Plans and results
must not embed credentials. Logging is process-local output only; it is not a
telemetry service or persistent product record.

## 8. Testing architecture

Unit tests cover profile declarations, state normalization, planning,
idempotency, stale-plan guards, redaction, and exit mapping without GitHub
network access. Adapter contract tests use deterministic fixtures or HTTP mocks
to cover successful responses, capability absence, authorization failures,
conflicts, pagination, and partial failures.

Live verification is opt-in and runs only against an explicit public GitHub.com
test target in the supported environment with credentials supplied at runtime.
It verifies the Inspect → Plan → Apply → Verify path, an unchanged second run,
and preservation of seeded unrelated state. Live tests use uniquely identifiable
test resources and record redacted evidence; they do not rely on a shared hidden
database or extend support claims beyond the verified environment.

## 9. Extension path

Additional Core Profile resources are added as new profile declarations,
observers, comparators, operation planners, appliers, verifiers, and tests at
the existing resource boundary. They must declare their managed identities and
preservation rules before they can plan mutations.

This extension path supports new GitHub resources without plugins, a service,
or agent-specific orchestration. Any new resource that changes public workflow
semantics, required native objects, permissions, or supported environments
requires the separate authority and canonical-document updates specified in the
requirements baseline.

## 10. Requirement mapping

| Architecture element | Primary requirements |
| --- | --- |
| Four-phase commands and pure plan | FR-018–FR-020 |
| Minimal guarded reconciliation and no-op second run | FR-021, FR-023, FR-025–FR-026 |
| Fresh conformance verification and partial-failure reporting | FR-022, FR-027, NFR-004 |
| Managed-resource boundary and preservation | FR-017, FR-024 |
| Dedicated Project, membership, and optional Auto-add handling | FR-028–FR-033, FR-039–FR-040 |
| JSON observability and redaction | FR-027, NFR-005–NFR-006 |
| Agent-neutral, repository-independent extension path | FR-016, NFR-002, RI-001–RI-006 |
| Supported-target live verification | SUP-001–SUP-003, SC-001–SC-003 |

The precise typed interfaces and command inputs are defined in
[`../specs/RECONCILIATION_CONTRACT.md`](../specs/RECONCILIATION_CONTRACT.md).
Implementation work must preserve this document's boundaries and use the current
requirements baseline as the source of public behavior.
