import { fingerprint, observationFingerprint, planFingerprint } from "./domain.js";
import type { ApplyReport, GitHubPort, InspectionReport, PlannedOperation, ReconciliationPlan, ReconciliationRequest, VerificationReport } from "./domain.js";
import { labels } from "./profile.js";

function sameRequest(request: ReconciliationRequest, plan: ReconciliationPlan): boolean {
  return plan.resourceScope === "managed-labels" &&
    fingerprint(request) === plan.requestFingerprint &&
    fingerprint(request.target) === fingerprint(plan.target) &&
    fingerprint(request.profile) === fingerprint(plan.profile) &&
    plan.planFingerprint === planFingerprint(plan);
}

export function plan(request: ReconciliationRequest, inspection: InspectionReport): ReconciliationPlan {
  if (fingerprint(request.target) !== fingerprint(inspection.target) ||
      fingerprint(request.profile) !== fingerprint(inspection.profile) || inspection.resourceScope !== "managed-labels") {
    throw new Error("Inspection does not match request");
  }
  const operations: PlannedOperation[] = [];
  const blockedResources = inspection.resources.filter(r => !["missing", "compatible"].includes(r.classification));
  for (const label of labels) {
    const observation = inspection.resources.find(r => r.identity.kind === "managed-label" && r.identity.key === label.name);
    if (!observation) throw new Error(`Inspection omitted managed label ${label.name}`);
    if (observation.classification === "missing") {
      operations.push({
        id: `ensure-managed-label:${label.name}`,
        resource: observation.identity,
        kind: "ensure-managed-label",
        preconditions: [{ resource: observation.identity, expectedFingerprint: observationFingerprint(observation) }],
        dependsOn: [],
        expectedEffect: `Create managed label ${label.name}`,
      });
    }
  }
  const result: ReconciliationPlan = {
    phase: "plan", resourceScope: "managed-labels", target: request.target, profile: request.profile,
    requestFingerprint: fingerprint(request), inspectionFingerprint: inspection.stateFingerprint,
    planFingerprint: "", operations, initialStatusExpectations: [], warnings: [], blockedResources,
    outcome: blockedResources.length || inspection.outcome !== "inspected" ? "blocked" : operations.length ? "ready" : "no-change",
  };
  result.planFingerprint = planFingerprint(result);
  return result;
}

export async function apply(port: GitHubPort, request: ReconciliationRequest, planned: ReconciliationPlan): Promise<ApplyReport> {
  const report: ApplyReport = {
    phase: "apply", resourceScope: "managed-labels", planFingerprint: planned.planFingerprint,
    preflightInspectionFingerprint: "", operations: planned.operations.map(operation => ({ operation, outcome: "not-attempted", safeDiagnostics: [] })),
    outcome: "blocked", safeDiagnostics: [],
  };
  if (!sameRequest(request, planned) || planned.outcome === "blocked" || planned.initialStatusExpectations.length) {
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
    if (planned.outcome !== "ready" || !planned.operations.length ||
        new Set(planned.operations.map(o => o.id)).size !== planned.operations.length ||
        planned.operations.some(o => o.kind !== "ensure-managed-label" || o.resource.kind !== "managed-label" ||
          o.id !== `ensure-managed-label:${o.resource.key}` || o.preconditions.length !== 1 ||
          o.preconditions[0].resource.key !== o.resource.key || !labels.some(l => l.name === o.resource.key))) {
      report.safeDiagnostics.push("Plan operation is invalid");
      return report;
    }
    let applied = 0;
    for (let i = 0; i < planned.operations.length; i++) {
      const operation = planned.operations[i];
      const current = i === 0 ? preflight : await port.inspectManagedState(request);
      const observation = current.resources.find(r => r.identity.key === operation.resource.key);
      if (current.outcome !== "inspected" || !observation ||
          observationFingerprint(observation) !== operation.preconditions[0].expectedFingerprint) {
        report.operations[i].outcome = "blocked";
        report.operations[i].safeDiagnostics.push("Managed resource changed or cannot be read");
        report.outcome = applied ? "partial-failure" : "blocked";
        return report;
      }
      try {
        const result = await port.execute(operation);
        if (result.outcome !== "applied" || fingerprint(result.operation) !== fingerprint(operation)) throw new Error("Operation did not apply");
        report.operations[i] = result;
        applied++;
      } catch {
        report.operations[i].outcome = "failed";
        report.operations[i].safeDiagnostics.push("GitHub label operation failed; inspect target before retry");
        report.outcome = applied ? "partial-failure" : "failed";
        return report;
      }
    }
    report.outcome = "applied";
    return report;
  } catch {
    report.outcome = report.operations.some(o => o.outcome === "applied") ? "partial-failure" : "failed";
    report.safeDiagnostics.push("GitHub inspection failed; inspect target before retry");
    return report;
  }
}

export async function verify(port: GitHubPort, request: ReconciliationRequest, planned: ReconciliationPlan, applied: ApplyReport): Promise<VerificationReport> {
  const report: VerificationReport = {
    phase: "verify", resourceScope: "managed-labels", target: request.target, profile: request.profile,
    verifiedAt: new Date().toISOString(), resources: [], outcome: "unverifiable", safeDiagnostics: [],
  };
  const validOutcomes = planned.outcome === "no-change" ?
    planned.operations.length === 0 && applied.outcome === "no-change" && applied.operations.length === 0 :
    planned.outcome === "ready" ? planned.operations.length > 0 &&
      (applied.outcome === "applied" ? applied.operations.every(entry => entry.outcome === "applied" || entry.outcome === "already-conforming") :
        ["blocked", "partial-failure", "failed"].includes(applied.outcome)) :
      applied.outcome === "blocked";
  const bindingsValid = sameRequest(request, planned) && applied.phase === "apply" && validOutcomes &&
    applied.resourceScope === "managed-labels" && applied.planFingerprint === planned.planFingerprint &&
    applied.operations.length === planned.operations.length &&
    applied.operations.every((entry, index) => fingerprint(entry.operation) === fingerprint(planned.operations[index]));
  if (!bindingsValid) {
    report.safeDiagnostics.push("Plan or Apply report does not match request");
    return report;
  }
  try {
    const fresh = await port.inspectManagedState(request);
    report.resources = fresh.resources.map(observation => ({
      resource: observation.identity,
      status: observation.classification === "compatible" ? "conforming" :
        observation.classification === "unsupported" ? "unsupported" :
        observation.classification === "unverifiable" || observation.classification === "ambiguous" ? "unverifiable" : "non-conforming",
      safeDiagnostics: observation.safeDiagnostics,
    }));
    if (fresh.outcome === "failed") report.outcome = "failed";
    else if (fresh.outcome === "unsupported") report.outcome = "unsupported";
    else if (fresh.outcome === "unverifiable" || planned.outcome === "blocked" || !["applied", "no-change"].includes(applied.outcome)) report.outcome = "unverifiable";
    else if (report.resources.length !== labels.length || report.resources.some(r => r.status !== "conforming")) report.outcome = "non-conforming";
    else report.outcome = "verified";
    return report;
  } catch {
    report.outcome = "failed";
    report.safeDiagnostics.push("Fresh GitHub verification read failed");
    return report;
  }
}
