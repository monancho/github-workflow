import { fingerprint } from "../domain.js";

export type TargetRef = { owner: string; repository: string };
export type ProfileRef = { name: "v0.1.0-core-profile"; version: "0.1.0" };
export type StandardProjectStatus = "Backlog" | "Ready" | "In Progress" | "Review" | "Done";
export type TrackedIssueRef = {
  number: number;
  nodeId?: string;
  authorizedInitialStatus?: { status: StandardProjectStatus; authorizationRef: string };
};
export type ReconciliationRequest = { target: TargetRef; profile: ProfileRef; trackedIssues: TrackedIssueRef[] };
export type ResourceKind = "repository-issues" | "dedicated-project" | "project-statuses" | "managed-label" |
  "issue-project-membership" | "issue-initial-project-status" | "closed-issue-project-status";
export type ResourceIdentity = { kind: ResourceKind; key: string };
export type ObservationClass = "missing" | "compatible" | "conflicting" | "ambiguous" | "unrelated" | "unsupported" | "unverifiable";
export type ResourceObservation = { identity: ResourceIdentity; classification: ObservationClass; actual?: unknown; safeDiagnostics: string[] };
export type InspectionReport = {
  phase: "inspect";
  resourceScope: "core-profile";
  target: TargetRef;
  profile: ProfileRef;
  observedAt: string;
  stateFingerprint: string;
  capabilities: { capability: string; status: "available" | "unavailable" | "unknown"; safeDiagnostics: string[] }[];
  resources: ResourceObservation[];
  unrelatedSummary: ResourceIdentity[];
  outcome: "inspected" | "unsupported" | "unverifiable" | "failed";
  safeDiagnostics: string[];
};
export type OperationKind = "ensure-repository-issues" | "ensure-dedicated-project" | "ensure-project-statuses" |
  "ensure-managed-label" | "ensure-issue-project-membership" | "ensure-issue-initial-project-status" |
  "ensure-closed-issue-project-status";
export type PlannedOperation = {
  id: string;
  resource: ResourceIdentity;
  kind: OperationKind;
  preconditions: { resource: ResourceIdentity; expectedFingerprint: string }[];
  dependsOn: string[];
  expectedEffect: string;
  input?: { issueNumber?: number; expectedStatus?: StandardProjectStatus };
  permittedRepairMethods?: ("native-auto-add" | "provisioning-reconciliation" | "executor-reconciliation" | "explicit-addition")[];
};
export type InitialStatusExpectation = {
  resource: ResourceIdentity & { kind: "issue-initial-project-status" };
  membershipOperationId: string;
  statusOperationId: string;
  expectedStatus: StandardProjectStatus;
  authorizationRef?: string;
};
export type ReconciliationPlan = {
  phase: "plan";
  resourceScope: "core-profile";
  target: TargetRef;
  profile: ProfileRef;
  requestFingerprint: string;
  inspectionFingerprint: string;
  planFingerprint: string;
  operations: PlannedOperation[];
  initialStatusExpectations: InitialStatusExpectation[];
  warnings: string[];
  blockedResources: ResourceObservation[];
  outcome: "no-change" | "ready" | "blocked";
};
export type AppliedOperation = { operation: PlannedOperation; outcome: "applied" | "already-conforming" | "blocked" | "failed" | "not-attempted"; safeDiagnostics: string[] };
export type ApplyReport = {
  phase: "apply";
  resourceScope: "core-profile";
  planFingerprint: string;
  preflightInspectionFingerprint: string;
  operations: AppliedOperation[];
  outcome: "applied" | "no-change" | "blocked" | "partial-failure" | "failed";
  safeDiagnostics: string[];
};
export type ResourceVerification = { resource: ResourceIdentity; status: "conforming" | "non-conforming" | "unsupported" | "unverifiable"; safeDiagnostics: string[] };
export type VerificationReport = {
  phase: "verify";
  resourceScope: "core-profile";
  target: TargetRef;
  profile: ProfileRef;
  verifiedAt: string;
  resources: ResourceVerification[];
  outcome: "verified" | "non-conforming" | "unsupported" | "unverifiable" | "failed";
  safeDiagnostics: string[];
};
export interface GitHubPort {
  inspectManagedState(request: ReconciliationRequest): Promise<InspectionReport>;
  checkPreconditions(operations: readonly PlannedOperation[]): Promise<InspectionReport>;
  execute(operation: PlannedOperation): Promise<AppliedOperation>;
}
export function resourceFingerprint(observation: ResourceObservation): string {
  return fingerprint({ identity: observation.identity, classification: observation.classification, actual: observation.actual });
}
export function planFingerprint(plan: ReconciliationPlan): string {
  const { planFingerprint: _ignored, ...content } = plan;
  return fingerprint(content);
}
