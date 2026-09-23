import { fingerprint } from "../domain.js";
import { identity, labels, statuses } from "./profile.js";
import { planFingerprint, resourceFingerprint } from "./types.js";
import type { ApplyReport, GitHubPort, InspectionReport, InitialStatusExpectation, PlannedOperation, ReconciliationPlan, ReconciliationRequest, ResourceIdentity, ResourceObservation, VerificationReport } from "./types.js";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function sameIdentity(a: ResourceIdentity, b: ResourceIdentity): boolean {
  return a.kind === b.kind && a.key === b.key;
}
function observationFor(report: InspectionReport, resource: ResourceIdentity): ResourceObservation | undefined {
  return report.resources.find(item => sameIdentity(item.identity, resource));
}
function validPlan(value: unknown, request: ReconciliationRequest): value is ReconciliationPlan {
  if (!record(value) || !record(value.target) || !record(value.profile) ||
      !Array.isArray(value.operations) || !Array.isArray(value.initialStatusExpectations) ||
      !Array.isArray(value.blockedResources) || !Array.isArray(value.warnings)) return false;
  const plan = value as ReconciliationPlan;
  if (plan.phase !== "plan" || plan.resourceScope !== "core-profile" ||
      fingerprint(plan.target) !== fingerprint(request.target) || fingerprint(plan.profile) !== fingerprint(request.profile) ||
      plan.requestFingerprint !== fingerprint(request) || !plan.inspectionFingerprint ||
      plan.planFingerprint !== planFingerprint(plan) || !["no-change", "ready", "blocked"].includes(plan.outcome)) return false;
  if (plan.initialStatusExpectations.some(item => !record(item) || !record(item.resource) ||
      typeof item.membershipOperationId !== "string" || typeof item.statusOperationId !== "string" ||
      !statuses.includes(item.expectedStatus as typeof statuses[number])) ||
      plan.outcome === "ready" && (plan.blockedResources.length !== 0 || plan.operations.length === 0)) return false;
  const ids = new Set<string>();
  for (const operation of plan.operations) {
    if (!record(operation) || typeof operation.id !== "string" || ids.has(operation.id) ||
        !record(operation.resource) || !Array.isArray(operation.preconditions) || !Array.isArray(operation.dependsOn) ||
        typeof operation.kind !== "string" || typeof operation.expectedEffect !== "string" ||
        operation.preconditions.length !== 1 || operation.preconditions.some(pre => !record(pre) || !record(pre.resource) ||
          typeof pre.expectedFingerprint !== "string" || !pre.expectedFingerprint ||
          pre.resource.kind !== operation.resource.kind || pre.resource.key !== operation.resource.key)) return false;
    const issueNumber = operation.input?.issueNumber;
    const selected = request.trackedIssues.find(issue => issue.number === issueNumber);
    const expectedKind: Record<PlannedOperation["kind"], ResourceIdentity["kind"]> = {
      "ensure-repository-issues": "repository-issues", "ensure-dedicated-project": "dedicated-project",
      "ensure-project-statuses": "project-statuses", "ensure-managed-label": "managed-label",
      "ensure-issue-project-membership": "issue-project-membership",
      "ensure-issue-initial-project-status": "issue-initial-project-status",
      "ensure-closed-issue-project-status": "closed-issue-project-status",
    };
    if (!(operation.kind in expectedKind) || operation.resource.kind !== expectedKind[operation.kind] ||
        operation.id !== `${operation.kind}:${operation.resource.key}`) return false;
    const expectedResource = operation.kind === "ensure-managed-label" ?
      labels.some(label => sameIdentity(operation.resource, identity(request.target, "managed-label", undefined, label.name))) :
      operation.resource.kind.startsWith("issue-") || operation.resource.kind === "closed-issue-project-status" ?
        !!selected && sameIdentity(operation.resource, identity(request.target, operation.resource.kind, issueNumber)) :
        sameIdentity(operation.resource, identity(request.target, operation.resource.kind));
    if (!expectedResource || operation.kind === "ensure-issue-initial-project-status" &&
        operation.input?.expectedStatus !== (selected?.authorizedInitialStatus?.status ?? "Backlog") ||
        operation.kind === "ensure-closed-issue-project-status" && operation.input?.expectedStatus !== "Done") return false;
    ids.add(operation.id);
  }
  if (!plan.operations.every(operation => operation.dependsOn.every(id => ids.has(id) &&
      plan.operations.findIndex(item => item.id === id) < plan.operations.indexOf(operation))) ||
      plan.outcome === "no-change" && (plan.operations.length !== 0 || plan.blockedResources.length !== 0)) return false;
  const memberships = plan.operations.filter(operation => operation.kind === "ensure-issue-project-membership");
  const openMemberships = memberships.filter(operation => !plan.operations.some(item =>
    item.kind === "ensure-closed-issue-project-status" && item.input?.issueNumber === operation.input?.issueNumber));
  if (plan.initialStatusExpectations.length !== openMemberships.length) return false;
  return openMemberships.every(membership => {
    const selected = request.trackedIssues.find(issue => issue.number === membership.input?.issueNumber);
    const expectation = plan.initialStatusExpectations.find(item => item.membershipOperationId === membership.id);
    const statusOp = plan.operations.find(item => item.id === expectation?.statusOperationId);
    return !!selected && !!expectation && !!statusOp && statusOp.kind === "ensure-issue-initial-project-status" &&
      sameIdentity(statusOp.resource, expectation.resource) &&
      expectation.expectedStatus === (selected.authorizedInitialStatus?.status ?? "Backlog") &&
      expectation.authorizationRef === selected.authorizedInitialStatus?.authorizationRef;
  });
}

export function plan(request: ReconciliationRequest, inspected: InspectionReport): ReconciliationPlan {
  if (inspected.phase !== "inspect" || inspected.resourceScope !== "core-profile" ||
      fingerprint(inspected.target) !== fingerprint(request.target) || fingerprint(inspected.profile) !== fingerprint(request.profile)) {
    throw new Error("Inspection does not match request");
  }
  const operations: PlannedOperation[] = [];
  const expectations: InitialStatusExpectation[] = [];
  const blockedResources = inspected.resources.filter(resource => !["missing", "compatible"].includes(resource.classification));
  const add = (resource: ResourceIdentity, kind: PlannedOperation["kind"], dependsOn: string[] = [], input?: PlannedOperation["input"]): string | undefined => {
    const observed = observationFor(inspected, resource);
    if (!observed) throw new Error(`Inspection omitted ${resource.kind}: ${resource.key}`);
    if (observed.classification !== "missing") return undefined;
    const id = `${kind}:${resource.key}`;
    operations.push({
      id, resource, kind, preconditions: [{ resource, expectedFingerprint: resourceFingerprint(observed) }],
      dependsOn, expectedEffect: `Ensure ${resource.kind} for ${resource.key}`,
      ...(input ? { input } : {}),
      ...(kind === "ensure-issue-project-membership" ? { permittedRepairMethods: ["provisioning-reconciliation", "explicit-addition"] as PlannedOperation["permittedRepairMethods"] } : {}),
    });
    return id;
  };
  const issuesId = add(identity(request.target, "repository-issues"), "ensure-repository-issues");
  const projectId = add(identity(request.target, "dedicated-project"), "ensure-dedicated-project", issuesId ? [issuesId] : []);
  const statusId = add(identity(request.target, "project-statuses"), "ensure-project-statuses", projectId ? [projectId] : []);
  for (const label of labels) add(identity(request.target, "managed-label", undefined, label.name), "ensure-managed-label");
  for (const issue of request.trackedIssues) {
    const membership = identity(request.target, "issue-project-membership", issue.number);
    const membershipId = add(membership, "ensure-issue-project-membership", [projectId, statusId, issuesId].filter((id): id is string => !!id), { issueNumber: issue.number });
    const closed = observationFor(inspected, identity(request.target, "closed-issue-project-status", issue.number));
    if (closed) {
      add(closed.identity, "ensure-closed-issue-project-status", [membershipId, statusId].filter((id): id is string => !!id),
        { issueNumber: issue.number, expectedStatus: "Done" });
    } else if (membershipId) {
      const initial = identity(request.target, "issue-initial-project-status", issue.number);
      const expectedStatus = issue.authorizedInitialStatus?.status ?? "Backlog";
      const statusOperationId = add(initial, "ensure-issue-initial-project-status", [membershipId, statusId].filter((id): id is string => !!id),
        { issueNumber: issue.number, expectedStatus });
      if (!statusOperationId) throw new Error("Missing initial-status operation for new membership");
      expectations.push({ resource: initial as InitialStatusExpectation["resource"], membershipOperationId: membershipId,
        statusOperationId, expectedStatus,
        ...(issue.authorizedInitialStatus ? { authorizationRef: issue.authorizedInitialStatus.authorizationRef } : {}) });
    }
  }
  const result: ReconciliationPlan = {
    phase: "plan", resourceScope: "core-profile", target: request.target, profile: request.profile,
    requestFingerprint: fingerprint(request), inspectionFingerprint: inspected.stateFingerprint, planFingerprint: "",
    operations, initialStatusExpectations: expectations, warnings: [], blockedResources,
    outcome: blockedResources.length || inspected.outcome !== "inspected" ? "blocked" : operations.length ? "ready" : "no-change",
  };
  result.planFingerprint = planFingerprint(result);
  return result;
}

export async function apply(port: GitHubPort, request: ReconciliationRequest, planned: ReconciliationPlan): Promise<ApplyReport> {
  const valid = validPlan(planned, request);
  const report: ApplyReport = {
    phase: "apply", resourceScope: "core-profile", planFingerprint: valid ? planned.planFingerprint : "",
    preflightInspectionFingerprint: "", operations: valid ? planned.operations.map(operation => ({ operation, outcome: "not-attempted", safeDiagnostics: [] })) : [],
    outcome: "blocked", safeDiagnostics: [],
  };
  if (!valid || planned.outcome === "blocked") {
    report.safeDiagnostics.push("Invalid, blocked, or mismatched plan");
    return report;
  }
  try {
    const preflight = await port.inspectManagedState(request);
    report.preflightInspectionFingerprint = preflight.stateFingerprint;
    if (preflight.outcome !== "inspected") {
      report.safeDiagnostics.push("Preflight inspection did not succeed");
      return report;
    }
    if (planned.outcome === "no-change") {
      report.outcome = preflight.stateFingerprint === planned.inspectionFingerprint ? "no-change" : "blocked";
      if (report.outcome === "blocked") report.safeDiagnostics.push("Managed state changed since planning");
      return report;
    }
    let changed = 0;
    for (let index = 0; index < planned.operations.length; index++) {
      const operation = planned.operations[index];
      if (operation.dependsOn.some(id => !report.operations.some(item => item.operation.id === id &&
          ["applied", "already-conforming"].includes(item.outcome)))) continue;
      const current = index === 0 ? preflight : await port.checkPreconditions([operation]);
      const observation = observationFor(current, operation.resource);
      const expected = operation.preconditions[0]?.expectedFingerprint;
      const dependencyApplied = operation.dependsOn.some(id => report.operations.some(item => item.operation.id === id && item.outcome === "applied"));
      const membershipEstablished = operation.kind === "ensure-issue-initial-project-status" &&
        operation.dependsOn.some(id => report.operations.some(item => item.operation.id === id &&
          item.operation.kind === "ensure-issue-project-membership" && ["applied", "already-conforming"].includes(item.outcome)));
      const actualStatus = observation && record(observation.actual) ? observation.actual.status : undefined;
      const initialStatusTransition = membershipEstablished && observation &&
        ["missing", "compatible"].includes(observation.classification) &&
        (actualStatus === null || actualStatus === "Backlog" || actualStatus === operation.input?.expectedStatus);
      const changedByDependency = dependencyApplied && observation?.classification === "missing" &&
        ["project-statuses", "issue-project-membership", "issue-initial-project-status", "closed-issue-project-status"].includes(operation.resource.kind);
      if (current.outcome === "inspected" && observation?.classification === "compatible" &&
          (operation.kind !== "ensure-issue-initial-project-status" || actualStatus === operation.input?.expectedStatus)) {
        report.operations[index].outcome = "already-conforming";
        continue;
      }
      if (current.outcome !== "inspected" || !observation ||
          resourceFingerprint(observation) !== expected && !changedByDependency && !initialStatusTransition) {
        report.operations[index].outcome = "blocked";
        report.operations[index].safeDiagnostics.push("Managed resource changed or cannot be read");
        report.outcome = changed ? "partial-failure" : "blocked";
        return report;
      }
      if (observation.classification !== "missing" && !initialStatusTransition) {
        report.operations[index].outcome = "blocked";
        report.outcome = changed ? "partial-failure" : "blocked";
        return report;
      }
      try {
        const outcome = await port.execute(operation);
        if (outcome.outcome !== "applied" || fingerprint(outcome.operation) !== fingerprint(operation)) throw new Error("Invalid operation result");
        report.operations[index] = outcome;
        changed++;
      } catch {
        report.operations[index].outcome = "failed";
        report.operations[index].safeDiagnostics.push("Managed operation failed; inspect and re-plan before retry");
        report.outcome = changed ? "partial-failure" : "failed";
        return report;
      }
    }
    if (report.operations.some(item => item.outcome === "not-attempted")) {
      report.outcome = changed ? "partial-failure" : "blocked";
      report.safeDiagnostics.push("A dependent operation was not attempted");
      return report;
    }
    report.outcome = "applied";
    return report;
  } catch {
    report.outcome = changedCount(report) ? "partial-failure" : "failed";
    report.safeDiagnostics.push("GitHub inspection failed; inspect and re-plan before retry");
    return report;
  }
}
function changedCount(report: ApplyReport): number { return report.operations.filter(item => item.outcome === "applied").length; }

export async function verify(port: GitHubPort, request: ReconciliationRequest, planned: ReconciliationPlan, applied: ApplyReport): Promise<VerificationReport> {
  const report: VerificationReport = {
    phase: "verify", resourceScope: "core-profile", target: request.target, profile: request.profile,
    verifiedAt: new Date().toISOString(), resources: [], outcome: "unverifiable", safeDiagnostics: [],
  };
  if (!validPlan(planned, request) || !record(applied) || !Array.isArray(applied.operations) ||
      applied.phase !== "apply" || applied.resourceScope !== "core-profile" ||
      applied.planFingerprint !== planned.planFingerprint || !applied.preflightInspectionFingerprint ||
      applied.operations.length !== planned.operations.length ||
      applied.operations.some((item, index) => !record(item) || !record(item.operation) ||
        !Array.isArray(item.safeDiagnostics) ||
        !["applied", "already-conforming", "blocked", "failed", "not-attempted"].includes(String(item.outcome)) ||
        fingerprint(item.operation) !== fingerprint(planned.operations[index]))) {
    report.safeDiagnostics.push("Plan or Apply report does not match request");
    return report;
  }
  if (planned.outcome === "no-change" && applied.outcome !== "no-change" ||
      planned.outcome === "ready" && applied.outcome === "no-change" ||
      applied.outcome === "applied" && applied.operations.some(item => !["applied", "already-conforming"].includes(item.outcome))) {
    report.safeDiagnostics.push("Contradictory phase outcomes");
    return report;
  }
  const expectationIds = new Set(planned.initialStatusExpectations.map(item => item.resource.key));
  const newOpenMemberships = planned.operations.filter(item => item.kind === "ensure-issue-project-membership" &&
    !planned.operations.some(other => other.kind === "ensure-closed-issue-project-status" && other.input?.issueNumber === item.input?.issueNumber));
  if (expectationIds.size !== newOpenMemberships.length || newOpenMemberships.some(item => {
    const expectation = planned.initialStatusExpectations.find(value => value.membershipOperationId === item.id);
    const statusOp = planned.operations.find(value => value.id === expectation?.statusOperationId);
    const issue = request.trackedIssues.find(value => value.number === item.input?.issueNumber);
    return !expectation || !issue || !statusOp || statusOp.kind !== "ensure-issue-initial-project-status" ||
      !sameIdentity(statusOp.resource, expectation.resource) ||
      expectation.expectedStatus !== (issue.authorizedInitialStatus?.status ?? "Backlog") ||
      expectation.authorizationRef !== issue.authorizedInitialStatus?.authorizationRef;
  })) {
    report.safeDiagnostics.push("Initial-status expectation is missing or mismatched");
    return report;
  }
  try {
    const fresh = await port.inspectManagedState(request);
    report.resources = fresh.resources.map(observation => ({
      resource: observation.identity,
      status: observation.classification === "compatible" ? "conforming" :
        observation.classification === "unsupported" ? "unsupported" :
        ["unverifiable", "ambiguous"].includes(observation.classification) ? "unverifiable" : "non-conforming",
      safeDiagnostics: observation.safeDiagnostics,
    }));
    const required = [identity(request.target, "repository-issues"), identity(request.target, "dedicated-project"),
      identity(request.target, "project-statuses"), ...labels.map(label => identity(request.target, "managed-label", undefined, label.name))];
    let topologyValid = true;
    for (const selected of request.trackedIssues) {
      const membership = observationFor(fresh, identity(request.target, "issue-project-membership", selected.number));
      const issueState = membership && record(membership.actual) ? membership.actual.issueState : undefined;
      if (issueState !== "OPEN" && issueState !== "CLOSED") topologyValid = false;
      required.push(identity(request.target, "issue-project-membership", selected.number),
        identity(request.target, issueState === "CLOSED" ? "closed-issue-project-status" : "issue-initial-project-status", selected.number));
    }
    const present = new Set(fresh.resources.map(item => `${item.identity.kind}:${item.identity.key}`));
    topologyValid = topologyValid && present.size === required.length &&
      required.every(item => present.has(`${item.kind}:${item.key}`));
    if (fresh.outcome === "failed") report.outcome = "failed";
    else if (fresh.outcome === "unsupported") report.outcome = "unsupported";
    else if (fresh.outcome === "unverifiable" || !topologyValid || planned.outcome === "blocked" || !["applied", "no-change"].includes(applied.outcome)) report.outcome = "unverifiable";
    else if (planned.initialStatusExpectations.some(expectation => {
      const issue = request.trackedIssues.find(item => expectation.resource.key.includes(`:issue:${item.number}:`));
      const nowClosed = issue && fresh.resources.some(item => item.identity.kind === "closed-issue-project-status" && item.identity.key === expectation.resource.key);
      const current = observationFor(fresh, expectation.resource);
      return nowClosed || current?.classification !== "compatible" ||
        !record(current.actual) || current.actual.status !== expectation.expectedStatus;
    })) report.outcome = "unverifiable";
    else if (report.resources.length !== 3 + labels.length + request.trackedIssues.length * 2 ||
        new Set(report.resources.map(item => `${item.resource.kind}:${item.resource.key}`)).size !== report.resources.length ||
        report.resources.some(item => item.status !== "conforming")) report.outcome = "non-conforming";
    else report.outcome = "verified";
    return report;
  } catch {
    report.outcome = "failed";
    report.safeDiagnostics.push("Fresh GitHub verification read failed");
    return report;
  }
}
