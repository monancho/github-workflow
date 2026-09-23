# github-workflow v0.1.0 Requirements Baseline

Status: v0.1.0 baseline
Last updated: 2026-09-23

## 1. Product context and problem

Software work in GitHub is increasingly performed by a mixture of humans and AI
agents. Those participants need one durable work contract that survives individual
tools and sessions. Without that contract, scope, authority, dependencies,
workflow state, review, and evidence can become split between chat history,
agent-specific metadata, and repository artifacts.

`github-workflow` is a GitHub-native, agent-neutral software delivery workflow.
It defines how humans and AI agents can use the same native GitHub records as the
durable source of work state and provides a way to provision that workflow without
making the target repository dependent on `github-workflow` at run time.

The product has three layers:

```text
Core Workflow Contract
        ↓
GitHub Core Profile
        ↓
Provisioning Capability
```

- The **Core Workflow Contract** defines shared work, lifecycle, authority,
  verification, and completion semantics.
- The **GitHub Core Profile** maps that contract to native GitHub capabilities.
- The **Provisioning Capability** reconciles a target environment with the Core
  Profile through inspect, plan, apply, and verify stages.

## 2. Purpose

This document is the canonical requirements baseline for the first public release,
v0.1.0. It establishes the behavior that the release must demonstrate while
leaving architecture and implementation choices open.

Normative requirements have stable identifiers and use **MUST**, **MUST NOT**,
**SHOULD**, or **MAY** as described by RFC 2119 and RFC 8174. Supporting prose,
examples, and rationale are non-normative unless they reference a requirement.

## 3. Definitions

| Term | Meaning in this baseline |
| --- | --- |
| Tracked Issue | A GitHub Issue representing one independently trackable unit of work. |
| Sub-Issue | A native containment relationship used to decompose tracked work. It is not an agent delegation unit. |
| Issue Dependency | A native blocking relationship between tracked work items. It is separate from lifecycle status. |
| Project Status | The lifecycle phase of tracked work in the associated GitHub User Project. |
| Dedicated User Project | The native GitHub User Project managed for exactly one target repository by the Core Profile. |
| Project membership | Representation of a tracked Issue as an item in its Dedicated User Project. |
| Pull Request | A repository change and integration artifact, normally linked to a tracked Issue. |
| Discovery work | Tracked work whose authorized outcome is a decision about value, scope, or placement before independent implementation is approved; its work kind is separate from Project Status. |
| Close reason | The native GitHub Issue close outcome: `Completed` for successful completion or `Not planned` for intentional non-completion. |
| Authorization envelope | The approved scope, acceptance conditions, and constraints within which an executor may make implementation decisions. |
| Managed state | Native GitHub configuration that the Core Profile declares and the Provisioning Capability is responsible for reconciling. |
| Unrelated configuration | Existing target configuration outside managed state. |
| Target repository | The repository to which the Core Profile is applied. |

## 4. Scope

### 4.1 In scope for v0.1.0

- A tool-independent Core Workflow Contract.
- A minimal Core Profile implemented with native GitHub capabilities.
- Provisioning that inspects, plans, applies, and verifies that profile.
- Lifecycle, decomposition, dependency, authority, review, and completion
  semantics for tracked work.
- Verification through self-dogfooding and one independent pilot repository.
- Documentation needed to understand, operate, and verify the public contract.

### 4.2 Non-goals for v0.1.0

v0.1.0 is not an agent orchestrator, multi-agent framework, model router, prompt
framework, agent telemetry platform, token or cost analytics system, custom task
database, GitHub Project replacement UI, generic workflow engine, Scrum or SAFe
implementation, full CI/CD platform, organization governance framework, or
platform engineering system.

The baseline does not choose an implementation language or runtime, finalize an
architecture, define a CLI shape, or select a provisioning backend.

## 5. Target users

The primary users are solo maintainers and small software teams that:

- host a public repository under a personal account on GitHub.com;
- want humans and AI agents to operate under the same workflow rules;
- prefer native GitHub state over a separate task database; and
- want repeatable setup without creating an ongoing dependency on the setup tool.

The logical roles in the workflow are:

- **Maintainer** — owns product scope and repository governance decisions.
- **Executor** — performs approved work within an authorization envelope.
- **Reviewer** — evaluates changes and evidence against the approved work.
- **Release Authority** — authorizes a release.

One person may hold more than one role. A role describes authority and
responsibility, not whether its holder is human or an AI agent.

## 6. Functional requirements

### 6.1 Core Workflow Contract

| ID | Requirement | Verification |
| --- | --- | --- |
| FR-001 | Each independently trackable unit of work MUST be representable by a tracked Issue. | Inspect documented workflow and a completed scenario. |
| FR-002 | Work decomposition MUST use the Sub-Issue relationship without assigning delegation semantics to that relationship. | Inspect a parent/child work scenario and documentation. |
| FR-003 | Blocking between work items MUST be represented as an Issue Dependency and MUST NOT be encoded as a lifecycle status. | Inspect a blocked-work scenario and its project status. |
| FR-004 | The standard Project Status values MUST be `Backlog`, `Ready`, `In Progress`, `Review`, and `Done`. | Inspect the provisioned Project Status field. |
| FR-005 | The lifecycle MUST permit backward movement between non-terminal phases for rework and MUST permit completion without `Review` when review is not required by the work's authorization envelope. | Exercise and record both lifecycle scenarios. |
| FR-006 | When a tracked Issue exists, that Issue MUST remain the canonical work-state holder; a Pull Request MUST be treated as a linked change and integration artifact. | Inspect a linked Issue and Pull Request through completion. |
| FR-007 | The workflow MUST define completion in terms of the tracked work's acceptance conditions and required verification, not merely creation or merge of a Pull Request. | Review completion documentation and evidence for a completed scenario. |
| FR-008 | The same workflow semantics and durable records MUST be usable whether the executor is a human or an AI agent. | Execute equivalent scenarios with human and AI-assisted participation. |
| FR-041 | Before selecting repository work, the responsible actor MUST reconstruct the current queue from applicable native GitHub work state, including tracked Issues and Project membership/Status, Sub-Issues, dependencies, material comments, linked open Pull Requests, review/check state, blockers, decisions, release scope, untriaged work, and parent coordination. Missing required Project membership MUST be identified rather than interpreted as a lifecycle phase. | Review a repository scan that classifies ready, active, review/rework, blocked, decision, Discovery/future, and terminal work, including an Issue absent from its Dedicated User Project. |
| FR-042 | Newly discovered information MUST be handled within the current authorization envelope when it is an in-scope detail. Independent work MUST NOT be executed merely because an Issue or Sub-Issue was created; already authorized independent work MAY be tracked normally, while materially uncertain independent work MUST be tracked as Discovery before implementation is approved. | Review intake decisions for in-scope detail, authorized independent work, material uncertainty, and information with no tracking value. |
| FR-043 | Discovery work MUST use the normal Project Status lifecycle independently of its work kind. Its decision MUST record Adopt, Split, Defer, or Reject as applicable; a finished Discovery MUST close as `Completed` when its decision work succeeds, including a Reject outcome. | Inspect Discovery outcomes and close reasons, including a completed Reject decision. |
| FR-044 | Repository queue selection MUST require execution authority, satisfied real prerequisites, no unresolved external blocker or blocking decision, and compatibility with current sequencing and release scope. The responsible actor SHOULD continue applicable active or review work before starting unrelated Ready work unless an explicit policy or blocker justifies another choice. | Review queue scenarios involving active review, native dependency, unresolved external `blocked` condition, `needs-decision`, Discovery, and sequencing constraints. |

### 6.2 Authority model

| ID | Requirement | Verification |
| --- | --- | --- |
| FR-009 | Approved work MUST define an authorization envelope containing scope, acceptance conditions, and constraints sufficient for execution. | Inspect an approved tracked Issue. |
| FR-010 | An executor MUST be permitted to make implementation decisions autonomously when those decisions remain within the authorization envelope. | Review an execution scenario and its decision record. |
| FR-011 | Separate authority MUST be obtained before material scope expansion, acceptance-condition changes, public-contract changes, governance or security boundary changes, starting independent new work, or performing a release. | Exercise or review documented escalation scenarios. |
| FR-012 | Workflow permissions and decisions MUST be based on logical roles and repository authority, not on whether an actor is human or an AI agent. | Inspect role documentation and representative scenarios. |

### 6.3 GitHub Core Profile

| ID | Requirement | Verification |
| --- | --- | --- |
| FR-013 | The Core Profile MUST map tracked work, decomposition, dependencies, lifecycle state, and repository changes to native GitHub capabilities while preserving the distinctions in Section 3. | Inspect the profile definition and a provisioned target. |
| FR-014 | The canonical lifecycle state for tracked Issues in the Core Profile MUST be the Project Status field of the associated native GitHub User Project. | Inspect a provisioned project and tracked Issues. |
| FR-015 | The Core Profile MUST use native GitHub Issues, Sub-Issues, Issue Dependencies, Projects, and Pull Requests where those capabilities implement the required semantics. | Inspect a provisioned target and workflow scenarios. |
| FR-016 | The Core Profile MUST be usable without agent-, model-, token-, cost-, or difficulty-specific product metadata. | Inspect all required fields and operating documentation. |
| FR-017 | The Core Profile MUST define which GitHub objects and properties are managed and which existing target configuration is outside its responsibility. | Inspect the profile or provisioning contract. |
| FR-028 | The managed Core Profile state MUST include enabled GitHub Issues; one Dedicated User Project; the Project Status values `Backlog`, `Ready`, `In Progress`, `Review`, and `Done`; and the labels `needs-decision` and `blocked`. | Provision a clean supported target and inspect the managed repository and Project state. |
| FR-029 | In the verified v0.1.0 environment, one target repository MUST map to one Dedicated User Project owned by the same personal account. Provisioning MUST NOT automatically convert or repurpose an arbitrary existing Project as that Dedicated User Project. | Inspect project ownership and association on a supported target; provision a target containing an unrelated existing Project. |
| FR-030 | Every tracked Issue participating in lifecycle management MUST have Project membership in its Dedicated User Project. | Create and inspect a tracked Issue and its Project item. |
| FR-031 | A tracked Issue newly added to the Dedicated User Project MUST enter `Backlog` unless an authorized workflow action assigns another applicable status. | Create and add a tracked Issue, then inspect its initial Project Status. |
| FR-032 | Closing a tracked Issue MUST transition its Dedicated User Project Status to `Done`. | Close a tracked Issue and inspect its Project Status. |
| FR-033 | When a tracked Issue exists, a Pull Request MUST NOT be added or retained as a duplicate canonical work item in the Dedicated User Project. | Inspect the Project after creating a Pull Request linked to a tracked Issue. |
| FR-034 | A Pull Request that implements tracked work MUST link to the authorizing Issue. | Inspect linked Issue and Pull Request metadata for an implementation scenario. |
| FR-035 | If merging a Pull Request closes its linked Issue, it MUST do so only when that Issue's acceptance conditions and required verification are satisfied. | Review a merged Pull Request and linked Issue completion evidence. |
| FR-036 | `Done` MUST be the terminal Project Status phase for tracked work. | Inspect the lifecycle definition and a completed or intentionally stopped work item. |
| FR-037 | A successfully completed tracked Issue MUST use the native close reason `Completed`; a cancelled or intentionally non-completed tracked Issue MUST use `Not planned`. | Close representative successful and intentionally stopped Issues, then inspect close reasons. |
| FR-038 | `Done` MUST NOT by itself be treated as proof that a tracked Issue's acceptance conditions were successfully satisfied. | Compare a `Done` Issue closed as `Not planned` with completion evidence for an Issue closed as `Completed`. |
| FR-039 | The Core Profile SHOULD use native GitHub Auto-add for Project membership when it is available and compatible with the supported environment, but Auto-add MUST NOT be the sole required mechanism for satisfying FR-030. | Inspect the profile and provision a supported target with and without Auto-add availability. |
| FR-040 | Missing required Project membership MUST be detectable and repairable through native Auto-add, provisioning reconciliation, executor reconciliation, or explicit addition. | Remove a required Project item, detect the absence, repair it through an allowed mechanism, and inspect the result. |

### 6.4 Provisioning Capability

| ID | Requirement | Verification |
| --- | --- | --- |
| FR-018 | Provisioning MUST follow the ordered contract `Inspect → Plan → Apply → Verify`. | Observe a complete provisioning run. |
| FR-019 | Inspect MUST discover enough current target state, including required Project membership, to distinguish missing, compatible, conflicting, managed, and unrelated configuration before mutation. | Run against targets containing each state category. |
| FR-020 | Plan MUST describe the proposed changes without mutating the target. | Compare target state before and after planning and inspect plan output. |
| FR-021 | Apply MUST make only the changes required to reconcile managed state, including missing required Project membership, with the Core Profile and the approved plan. | Compare the plan, applied operations, and resulting state. |
| FR-022 | Verify MUST compare the resulting target state, including required Project membership, with the Core Profile and report whether reconciliation succeeded. | Introduce conforming and non-conforming outcomes and inspect reports. |
| FR-023 | A successful second provisioning run against an unchanged conforming target MUST make no unnecessary changes. | Run provisioning twice and compare the second plan and applied operations. |
| FR-024 | Provisioning MUST preserve unrelated existing configuration. | Seed unrelated configuration, provision, and compare before and after state. |
| FR-025 | When compatible native configuration already exists, provisioning MUST reuse or reconcile it instead of creating an unnecessary duplicate. | Provision a target with compatible pre-existing objects and inspect identity and changes. |
| FR-026 | Provisioning MUST surface incompatible or ambiguous existing configuration rather than silently overwrite it. | Provision targets with representative conflicts and inspect behavior. |
| FR-027 | Planned changes, applied changes, verification results, and failures MUST be observable to the operator. | Inspect outputs from successful, no-change, and failed runs. |

## 7. Non-functional and quality requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| NFR-001 | Native GitHub capabilities MUST be preferred over custom substitutes when they satisfy the Core Workflow Contract. | Review profile mappings and exceptions. |
| NFR-002 | The workflow MUST remain agent-neutral and MUST NOT require a specific AI agent product. | Complete an operation without the development-time agent product. |
| NFR-003 | Normative behavior and terminology SHOULD use applicable public standards and documented GitHub semantics where they exist. | Review requirements and user documentation references. |
| NFR-004 | Provisioning MUST fail clearly when it cannot verify the requested result; it MUST NOT report success for a partially verified result. | Induce unavailable or mismatched verification state. |
| NFR-005 | Provisioning output MUST NOT expose credentials, authentication tokens, or other secret values. | Review representative output and automated security checks. |
| NFR-006 | Provisioning SHOULD require no broader GitHub permissions than are necessary for the requested operation. | Review documented permissions against exercised API operations. |
| NFR-007 | User-facing documentation MUST describe prerequisites, managed state, workflow semantics, known support boundaries, and verification behavior accurately for the released version. | Review release documentation against implementation and support evidence. |
| NFR-008 | Changes SHOULD be delivered in small, reviewable batches with verification evidence appropriate to their risk. | Review the repository's Issue and Pull Request history. |
| NFR-009 | Automation SHOULD be introduced when repetition, risk, correctness, or security justifies it, rather than being required for every workflow action. | Review automated workflow behavior and the rationale for each required automation. |

## 8. Constraints

| ID | Constraint |
| --- | --- |
| CON-001 | v0.1.0 MUST NOT require a particular implementation language, runtime, CLI shape, architecture, or provisioning backend as part of the product contract. |
| CON-002 | v0.1.0 MUST NOT require organization ownership, organization-only controls, private-repository capabilities, or enterprise-only capabilities. |
| CON-003 | v0.1.0 MUST NOT introduce a custom task database or replacement interface as the canonical store of workflow state. |
| CON-004 | v0.1.0 MUST NOT make agent, model, prompt, token, cost, telemetry, or difficulty metadata a required part of the Core Profile. |
| CON-005 | Provisioning MUST operate without relying on hidden external state. Any input needed to inspect, plan, apply, or verify MUST be obtainable from the target, explicit operator input, or documented local inputs. |

## 9. Public contract boundary

For v0.1.0, the public contract consists of:

- the Core Workflow Contract semantics and terminology in this document;
- the native GitHub objects, fields, values, and relationships declared by the
  Core Profile;
- the observable inspect, plan, apply, and verify behavior;
- the boundary between managed and unrelated target state;
- published prerequisites, permissions, support claims, and failure behavior; and
- any user-facing input or output interface explicitly documented for the release.

The implementation language, internal modules, internal data structures,
dependency choices, and unexposed backend design are not public contract merely
because they appear in the implementation.

| ID | Requirement |
| --- | --- |
| PC-001 | A change to public workflow semantics, required native objects or values, support claims, documented user-facing inputs or outputs, permissions, or destructive behavior MUST be treated as a public-contract change. |
| PC-002 | Public-contract changes MUST receive separate authority under FR-011 and update the affected canonical documentation in the same change. |
| PC-003 | Undocumented implementation details MUST NOT be presented as compatibility guarantees. |

## 10. Repository-independence requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| RI-001 | After provisioning, normal operation of the target repository and workflow MUST NOT require a running `github-workflow` service or runtime. | Disable or remove the provisioning runtime and complete a normal lifecycle scenario. |
| RI-002 | The target repository MUST NOT require a specific AI agent or agent product for continued operation. | Complete a normal lifecycle scenario without that product. |
| RI-003 | The Core Profile MUST NOT require a `github-workflow`-specific runtime or configuration file in the target repository. | Inspect a conforming target repository. |
| RI-004 | Durable workflow state MUST remain represented by native GitHub capabilities in the target environment. | Inspect work state after provisioning tooling is unavailable. |
| RI-005 | Continued operation MUST NOT depend on an external `github-workflow` task database or other hidden service state. | Complete a normal lifecycle scenario using only the target's documented GitHub state. |
| RI-006 | Dependence on the Dedicated User Project associated with the Core Profile is permitted and does not violate repository independence. | Confirm the only non-repository workflow dependency is documented native GitHub state. |

## 11. Supported-environment boundary

The verified v0.1.0 support target is deliberately narrow.

| Dimension | Supported v0.1.0 baseline |
| --- | --- |
| Hosting | GitHub.com |
| Ownership | Personal account |
| Repository visibility | Public |
| GitHub plan | Capabilities available on GitHub Free |
| Team shape | Solo maintainers and small teams |
| Development mode | Human and AI-assisted development, without a required agent product |
| Project topology | One target repository ↔ one Dedicated User Project, owned by the same personal account |

Organization-owned repositories, private repositories, GitHub Enterprise Server,
Enterprise Managed Users, cross-owner projects, and shared multi-repository
projects are not part of the verified v0.1.0 support claim.

| ID | Requirement |
| --- | --- |
| SUP-001 | Release claims for v0.1.0 MUST describe support no more broadly than the verified environment in this section. |
| SUP-002 | An unverified or explicitly excluded environment MUST NOT be represented as supported merely because provisioning appears to work there. |
| SUP-003 | Expanding the supported-environment boundary MUST update this baseline and add environment-specific verification evidence before the expanded claim is released. |

## 12. v0.1.0 success criteria

All criteria in this section must be satisfied before release authorization. A
criterion may be demonstrated by automated checks, reproducible manual evidence,
or both.

| ID | Release criterion | Principal requirements | Minimum evidence |
| --- | --- | --- | --- |
| SC-001 | Clean Core Profile provisioning | FR-013–FR-022, FR-028–FR-033, FR-039–FR-040 | Successful inspect, plan, apply, and verify record on a clean supported target that confirms enabled Issues, the Dedicated User Project, managed labels, Status values, and required Project membership without requiring Auto-add as the sole mechanism. |
| SC-002 | Idempotent second run | FR-023 | A second unchanged run reports no unnecessary changes. |
| SC-003 | Preservation of unrelated configuration | FR-017, FR-024–FR-026, FR-029 | Before/after evidence from a target containing unrelated and compatible existing configuration, including an arbitrary existing Project. |
| SC-004 | Normal tracked-work lifecycle | FR-001, FR-004–FR-007, FR-030–FR-038 | One tracked Issue moves through the applicable lifecycle, is linked to its implementing Pull Request, and is closed with the appropriate close reason. |
| SC-005 | Sub-Issue decomposition | FR-002, FR-013, FR-015 | A parent Issue is decomposed with native Sub-Issues without delegation semantics. |
| SC-006 | Native dependency handling | FR-003, FR-013, FR-015 | A blocking relationship is represented natively and independently of Project Status. |
| SC-007 | Authority-boundary behavior | FR-009–FR-012 | Evidence of autonomous in-envelope execution and escalation of an out-of-envelope decision. |
| SC-008 | Agent-neutral operation | FR-008, FR-012, NFR-002 | Equivalent workflow participation without dependence on a specific agent product. |
| SC-009 | Continued operation without a `github-workflow` runtime | RI-001–RI-005 | A normal lifecycle scenario after provisioning tooling is unavailable. |
| SC-010 | Self-dogfooding | NFR-008 | The project uses this workflow to implement and verify a release-scoped change. |
| SC-011 | Independent pilot repository | SUP-001–SUP-003 | Successful provisioning and workflow evidence from one separate repository in the supported environment. |
| SC-012 | Release through the same workflow | FR-006, FR-007, FR-009–FR-012 | The v0.1.0 release is authorized, tracked, verified, and completed using the Core Workflow Contract. |

## 13. Requirement change and traceability rules

This is a living baseline, not a frozen up-front specification. Learning during
implementation may change it, but the repository must preserve a reviewable link
between approved work, requirements, implementation, verification, and release.

| ID | Rule |
| --- | --- |
| TR-001 | `docs/REQUIREMENTS.md` MUST remain the canonical requirements baseline for v0.1.0. |
| TR-002 | Every normative requirement MUST have a stable unique ID; an ID MUST NOT be reused for a different meaning. |
| TR-003 | When a requirement is removed, its ID MUST be retained in a deprecation record or repository history rather than reassigned. |
| TR-004 | A change that affects requirements MUST update this document and any other affected canonical documentation in the same change as the implementation. |
| TR-005 | A requirement-changing Pull Request MUST identify the authorizing Issue, the affected requirement IDs, and the relevant verification evidence. |
| TR-006 | A material change to scope, acceptance conditions, the public contract, governance or security boundaries, or release criteria MUST receive the separate authority required by FR-011. |
| TR-007 | Verification assets SHOULD reference the requirement or success-criterion IDs they demonstrate where practical. |
| TR-008 | Release evidence MUST trace every v0.1.0 success criterion to a passing verification result or an explicitly authorized exception. |
