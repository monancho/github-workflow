import { createHash } from "node:crypto";

export type TargetRef = { owner: string; repository: string };
export type ProfileRef = { name: "v0.1.0-core-profile"; version: "0.1.0" };
export type ResourceIdentity = { kind: "managed-label"; key: string };
export type ResourceObservation = {
  identity: ResourceIdentity;
  classification: "missing" | "compatible" | "ambiguous" | "unsupported" | "unverifiable";
  actual?: { name: string };
  safeDiagnostics: string[];
};
export type ReconciliationRequest = { target: TargetRef; profile: ProfileRef; trackedIssues: [] };
export type InspectionReport = {
  phase: "inspect";
  resourceScope: "managed-labels";
  target: TargetRef;
  profile: ProfileRef;
  observedAt: string;
  stateFingerprint: string;
  capabilities: [];
  resources: ResourceObservation[];
  unrelatedSummary: ResourceIdentity[];
  outcome: "inspected" | "unsupported" | "unverifiable" | "failed";
  safeDiagnostics: string[];
};
export type PlannedOperation = {
  id: string;
  resource: ResourceIdentity;
  kind: "ensure-managed-label";
  preconditions: { resource: ResourceIdentity; expectedFingerprint: string }[];
  dependsOn: [];
  expectedEffect: string;
};
export type ReconciliationPlan = {
  phase: "plan";
  resourceScope: "managed-labels";
  target: TargetRef;
  profile: ProfileRef;
  requestFingerprint: string;
  inspectionFingerprint: string;
  planFingerprint: string;
  operations: PlannedOperation[];
  initialStatusExpectations: [];
  warnings: string[];
  blockedResources: ResourceObservation[];
  outcome: "no-change" | "ready" | "blocked";
};
export type AppliedOperation = {
  operation: PlannedOperation;
  outcome: "applied" | "already-conforming" | "blocked" | "failed" | "not-attempted";
  safeDiagnostics: string[];
};
export type ApplyReport = {
  phase: "apply";
  resourceScope: "managed-labels";
  planFingerprint: string;
  preflightInspectionFingerprint: string;
  operations: AppliedOperation[];
  outcome: "applied" | "no-change" | "blocked" | "partial-failure" | "failed";
  safeDiagnostics: string[];
};
export type VerificationReport = {
  phase: "verify";
  resourceScope: "managed-labels";
  target: TargetRef;
  profile: ProfileRef;
  verifiedAt: string;
  resources: { resource: ResourceIdentity; status: "conforming" | "non-conforming" | "unsupported" | "unverifiable"; safeDiagnostics: string[] }[];
  outcome: "verified" | "non-conforming" | "unsupported" | "unverifiable" | "failed";
  safeDiagnostics: string[];
};
export type Label = { name: string };
export interface GitHubPort {
  inspectManagedState(request: ReconciliationRequest): Promise<InspectionReport>;
  checkPreconditions(operations: readonly PlannedOperation[]): Promise<InspectionReport>;
  execute(operation: PlannedOperation): Promise<AppliedOperation>;
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function observationFingerprint(observation: ResourceObservation): string {
  return fingerprint({ identity: observation.identity, classification: observation.classification, actual: observation.actual });
}
export function planFingerprint(plan: ReconciliationPlan): string {
  const { planFingerprint: _ignored, ...content } = plan;
  return fingerprint(content);
}
