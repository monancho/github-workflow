import assert from "node:assert/strict";
import { test } from "node:test";
import { fingerprint } from "../src/domain.js";
import { apply, plan, verify } from "../src/core/reconcile.js";
import { identity, labels, requestFor, statuses } from "../src/core/profile.js";
import { planFingerprint } from "../src/core/types.js";
import type { AppliedOperation, GitHubPort, InspectionReport, PlannedOperation, ReconciliationRequest, ResourceObservation, StandardProjectStatus } from "../src/core/types.js";

const target = { owner: "example", repository: "sample" };
type IssueState = { closed: boolean; member: boolean; status: StandardProjectStatus | null };

class MemoryPort implements GitHubPort {
  issuesEnabled = false;
  projectExists = false;
  projectConflict = false;
  statusOptions: string[] = [];
  labelNames = ["unrelated"];
  unrelatedProjects = ["unrelated-project"];
  issues = new Map<number, IssueState>();
  writes: string[] = [];
  failAt = "";
  private request?: ReconciliationRequest;

  async inspectManagedState(request: ReconciliationRequest): Promise<InspectionReport> {
    this.request = request;
    const resources: ResourceObservation[] = [];
    const add = (kind: ResourceObservation["identity"]["kind"], classification: ResourceObservation["classification"], actual?: unknown, number?: number, label?: string) => {
      resources.push({ identity: identity(request.target, kind, number, label), classification, ...(actual === undefined ? {} : { actual }), safeDiagnostics: [] });
    };
    add("repository-issues", this.issuesEnabled ? "compatible" : "missing", { enabled: this.issuesEnabled });
    add("dedicated-project", this.projectConflict ? "conflicting" : this.projectExists ? "compatible" : "missing",
      this.projectExists ? { id: "project-id" } : undefined);
    add("project-statuses", this.projectExists && this.statusOptions.length === statuses.length &&
      statuses.every(status => this.statusOptions.includes(status)) ? "compatible" : "missing",
      this.projectExists ? { options: this.statusOptions } : undefined);
    for (const label of labels) {
      const found = this.labelNames.find(value => value.toLowerCase() === label.name);
      add("managed-label", found ? "compatible" : "missing", found ? { name: found } : undefined, undefined, label.name);
    }
    for (const selected of request.trackedIssues) {
      const issue = this.issues.get(selected.number);
      if (!issue) throw new Error("Missing fixture Issue");
      add("issue-project-membership", issue.member ? "compatible" : "missing",
        { issueId: `issue-${selected.number}`, issueState: issue.closed ? "CLOSED" : "OPEN", ...(issue.member ? { itemId: `item-${selected.number}` } : {}) }, selected.number);
      if (issue.closed) add("closed-issue-project-status", issue.member && issue.status === "Done" ? "compatible" : "missing",
        { issueState: "CLOSED", status: issue.status }, selected.number);
      else add("issue-initial-project-status", issue.member ? "compatible" : "missing",
        { issueState: "OPEN", status: issue.status }, selected.number);
    }
    return { phase: "inspect", resourceScope: "core-profile", target: request.target, profile: request.profile,
      observedAt: new Date().toISOString(), stateFingerprint: fingerprint(resources), capabilities: [], resources,
      unrelatedSummary: [
        ...this.unrelatedProjects.map(key => ({ kind: "dedicated-project" as const, key })),
        ...this.labelNames.filter(name => !labels.some(label => label.name === name)).map(key => ({ kind: "managed-label" as const, key })),
      ], outcome: "inspected", safeDiagnostics: [] };
  }
  async checkPreconditions(_operations: readonly PlannedOperation[]): Promise<InspectionReport> {
    if (!this.request) throw new Error("No fixture request");
    return this.inspectManagedState(this.request);
  }
  async execute(operation: PlannedOperation): Promise<AppliedOperation> {
    if (operation.kind === this.failAt) throw new Error("fixture failure");
    this.writes.push(operation.kind);
    const issue = this.issues.get(operation.input?.issueNumber ?? -1);
    switch (operation.kind) {
      case "ensure-repository-issues": this.issuesEnabled = true; break;
      case "ensure-dedicated-project": this.projectExists = true; break;
      case "ensure-project-statuses": this.statusOptions = [...statuses]; break;
      case "ensure-managed-label": this.labelNames.push(operation.resource.key.split(":label:")[1]); break;
      case "ensure-issue-project-membership": if (!issue) throw new Error("Missing fixture Issue"); issue.member = true; break;
      case "ensure-issue-initial-project-status":
      case "ensure-closed-issue-project-status":
        if (!issue) throw new Error("Missing fixture Issue");
        issue.status = operation.input?.expectedStatus ?? null;
        break;
    }
    return { operation, outcome: "applied", safeDiagnostics: [] };
  }
}

test("clean Core Profile provisions every resource, preserves unrelated state, and repeats as no-op", async () => {
  const port = new MemoryPort();
  port.issues.set(7, { closed: false, member: false, status: null });
  const request = requestFor(target, [{ number: 7 }]);
  const inspected = await port.inspectManagedState(request);
  const planned = plan(request, inspected);
  assert.equal(planned.outcome, "ready");
  assert.deepEqual(planned.operations.map(item => item.kind), ["ensure-repository-issues", "ensure-dedicated-project",
    "ensure-project-statuses", "ensure-managed-label", "ensure-managed-label", "ensure-issue-project-membership",
    "ensure-issue-initial-project-status"]);
  assert.equal(planned.initialStatusExpectations[0].expectedStatus, "Backlog");
  assert.deepEqual(port.writes, []);
  const applied = await apply(port, request, planned);
  assert.equal(applied.outcome, "applied");
  assert.equal((await verify(port, request, planned, applied)).outcome, "verified");
  assert.deepEqual(port.unrelatedProjects, ["unrelated-project"]);
  assert.ok(port.labelNames.includes("unrelated"));
  const repeat = plan(request, await port.inspectManagedState(request));
  assert.equal(repeat.outcome, "no-change");
  assert.deepEqual(repeat.initialStatusExpectations, []);
  assert.equal((await apply(port, request, repeat)).outcome, "no-change");
});

test("present membership in In Progress remains unchanged", async () => {
  const port = new MemoryPort();
  port.issuesEnabled = port.projectExists = true;
  port.statusOptions = [...statuses];
  port.labelNames.push(...labels.map(label => label.name));
  port.issues.set(8, { closed: false, member: true, status: "In Progress" });
  const request = requestFor(target, [{ number: 8 }]);
  const planned = plan(request, await port.inspectManagedState(request));
  assert.equal(planned.outcome, "no-change");
  assert.equal((await verify(port, request, planned, await apply(port, request, planned))).outcome, "verified");
  assert.equal(port.issues.get(8)?.status, "In Progress");
});

test("authorized initial override and closed-Issue Done remain separate lifecycle effects", async () => {
  const port = new MemoryPort();
  port.issuesEnabled = port.projectExists = true;
  port.statusOptions = [...statuses];
  port.labelNames.push(...labels.map(label => label.name));
  port.issues.set(9, { closed: false, member: false, status: null });
  port.issues.set(10, { closed: true, member: false, status: null });
  const request = requestFor(target, [
    { number: 9, authorizedInitialStatus: { status: "Ready", authorizationRef: "issue-9-comment" } },
    { number: 10 },
  ]);
  const planned = plan(request, await port.inspectManagedState(request));
  assert.equal(planned.initialStatusExpectations.length, 1);
  assert.equal(planned.initialStatusExpectations[0].authorizationRef, "issue-9-comment");
  assert.ok(planned.operations.some(item => item.kind === "ensure-closed-issue-project-status"));
  const applied = await apply(port, request, planned);
  assert.equal(applied.outcome, "applied");
  assert.equal((await verify(port, request, planned, applied)).outcome, "verified");
  assert.equal(port.issues.get(9)?.status, "Ready");
  assert.equal(port.issues.get(10)?.status, "Done");
});

test("conflicting project blocks mutation and partial failure requires fresh recovery", async () => {
  const conflict = new MemoryPort();
  conflict.projectConflict = true;
  const request = requestFor(target);
  const blockedPlan = plan(request, await conflict.inspectManagedState(request));
  assert.equal(blockedPlan.outcome, "blocked");
  assert.equal((await apply(conflict, request, blockedPlan)).outcome, "blocked");
  assert.deepEqual(conflict.writes, []);

  const port = new MemoryPort();
  port.failAt = "ensure-dedicated-project";
  const first = plan(request, await port.inspectManagedState(request));
  const applied = await apply(port, request, first);
  assert.equal(applied.outcome, "partial-failure");
  assert.notEqual((await verify(port, request, first, applied)).outcome, "verified");
  port.failAt = "";
  const recovery = plan(request, await port.inspectManagedState(request));
  assert.ok(!recovery.operations.some(item => item.kind === "ensure-repository-issues"));
  assert.equal((await verify(port, request, recovery, await apply(port, request, recovery))).outcome, "verified");
});

test("Verify rejects missing event expectation and false Apply success", async () => {
  const port = new MemoryPort();
  port.issues.set(11, { closed: false, member: false, status: null });
  const request = requestFor(target, [{ number: 11 }]);
  const planned = plan(request, await port.inspectManagedState(request));
  const fabricated = { phase: "apply" as const, resourceScope: "core-profile" as const,
    planFingerprint: planned.planFingerprint, preflightInspectionFingerprint: planned.inspectionFingerprint,
    operations: planned.operations.map(operation => ({ operation, outcome: "applied" as const, safeDiagnostics: [] })),
    outcome: "applied" as const, safeDiagnostics: [] };
  assert.notEqual((await verify(port, request, planned, fabricated)).outcome, "verified");
  const stale = { ...planned, initialStatusExpectations: [] };
  stale.planFingerprint = planFingerprint(stale);
  assert.equal((await verify(port, request, stale, fabricated)).outcome, "unverifiable");
});

test("fresh status mismatch defeats a fabricated Apply success", async () => {
  const port = new MemoryPort();
  port.issuesEnabled = port.projectExists = true;
  port.statusOptions = [...statuses];
  port.labelNames.push(...labels.map(label => label.name));
  port.issues.set(13, { closed: false, member: false, status: null });
  const request = requestFor(target, [{ number: 13 }]);
  const planned = plan(request, await port.inspectManagedState(request));
  port.issues.set(13, { closed: false, member: true, status: "Ready" });
  const fabricated = { phase: "apply" as const, resourceScope: "core-profile" as const,
    planFingerprint: planned.planFingerprint, preflightInspectionFingerprint: planned.inspectionFingerprint,
    operations: planned.operations.map(operation => ({ operation, outcome: "applied" as const, safeDiagnostics: [] })),
    outcome: "applied" as const, safeDiagnostics: [] };
  assert.equal((await verify(port, request, planned, fabricated)).outcome, "unverifiable");
});

test("a concurrently satisfied managed label is reused without a duplicate write", async () => {
  const port = new MemoryPort();
  port.issuesEnabled = port.projectExists = true;
  port.statusOptions = [...statuses];
  port.labelNames.push("needs-decision");
  const request = requestFor(target);
  const planned = plan(request, await port.inspectManagedState(request));
  port.labelNames.push("blocked");
  const applied = await apply(port, request, planned);
  assert.equal(applied.outcome, "applied");
  assert.equal(applied.operations[0].outcome, "already-conforming");
  assert.deepEqual(port.writes, []);
  assert.equal((await verify(port, request, planned, applied)).outcome, "verified");
});

test("native Auto-add can establish membership before authorized initial Status", async () => {
  const port = new MemoryPort();
  port.issuesEnabled = port.projectExists = true;
  port.statusOptions = [...statuses];
  port.labelNames.push(...labels.map(label => label.name));
  port.issues.set(12, { closed: false, member: false, status: null });
  const request = requestFor(target, [{ number: 12, authorizedInitialStatus: { status: "Ready", authorizationRef: "issue-12" } }]);
  const planned = plan(request, await port.inspectManagedState(request));
  port.issues.set(12, { closed: false, member: true, status: "Backlog" });
  const applied = await apply(port, request, planned);
  assert.equal(applied.outcome, "applied");
  assert.deepEqual(applied.operations.map(item => item.outcome), ["already-conforming", "applied"]);
  assert.equal(port.issues.get(12)?.status, "Ready");
  assert.equal((await verify(port, request, planned, applied)).outcome, "verified");
});

test("Apply rejects a re-fingerprinted operation targeting the wrong managed identity", async () => {
  const port = new MemoryPort();
  const request = requestFor(target);
  const planned = plan(request, await port.inspectManagedState(request));
  planned.operations[0].resource = identity(target, "managed-label", undefined, "blocked");
  planned.operations[0].id = `${planned.operations[0].kind}:${planned.operations[0].resource.key}`;
  planned.operations[0].preconditions[0].resource = planned.operations[0].resource;
  planned.planFingerprint = planFingerprint(planned);
  assert.equal((await apply(port, request, planned)).outcome, "blocked");
  assert.deepEqual(port.writes, []);
});

test("malformed serialized phase bindings return structured non-success", async () => {
  const port = new MemoryPort();
  port.issues.set(14, { closed: false, member: false, status: null });
  const request = requestFor(target, [{ number: 14 }]);
  const planned = plan(request, await port.inspectManagedState(request));
  const malformedPlan = { ...planned, initialStatusExpectations: [null] } as unknown as typeof planned;
  malformedPlan.planFingerprint = planFingerprint(malformedPlan);
  assert.equal((await apply(port, request, malformedPlan)).outcome, "blocked");
  const malformedApply = { phase: "apply" as const, resourceScope: "core-profile" as const,
    planFingerprint: planned.planFingerprint, preflightInspectionFingerprint: planned.inspectionFingerprint,
    operations: planned.operations.map(() => null), outcome: "applied" as const, safeDiagnostics: [] } as unknown as Awaited<ReturnType<typeof apply>>;
  assert.equal((await verify(port, request, planned, malformedApply)).outcome, "unverifiable");
  assert.deepEqual(port.writes, []);
});
