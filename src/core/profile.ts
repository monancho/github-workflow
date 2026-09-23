import type { ReconciliationRequest, ResourceIdentity, ResourceKind, StandardProjectStatus, TargetRef, TrackedIssueRef } from "./types.js";

export const labels = [
  { name: "needs-decision", color: "FBCA04", description: "Decision required before work can proceed" },
  { name: "blocked", color: "B60205", description: "Blocked by a condition not represented as an Issue Dependency" },
] as const;
export const statuses: StandardProjectStatus[] = ["Backlog", "Ready", "In Progress", "Review", "Done"];

export function requestFor(target: TargetRef, trackedIssues: TrackedIssueRef[] = []): ReconciliationRequest {
  if (!/^[A-Za-z0-9-]+$/.test(target.owner) || !/^[A-Za-z0-9._-]+$/.test(target.repository)) {
    throw new Error("Invalid target owner or repository");
  }
  const numbers = new Set<number>();
  for (const issue of trackedIssues) {
    if (!Number.isSafeInteger(issue.number) || issue.number < 1 || numbers.has(issue.number) ||
        issue.nodeId !== undefined && (typeof issue.nodeId !== "string" || !issue.nodeId.trim()) ||
        issue.authorizedInitialStatus && (!statuses.includes(issue.authorizedInitialStatus.status) ||
          !issue.authorizedInitialStatus.authorizationRef?.trim())) {
      throw new Error("Invalid or duplicate tracked Issue selection");
    }
    numbers.add(issue.number);
  }
  return {
    target, profile: { name: "v0.1.0-core-profile", version: "0.1.0" },
    trackedIssues: [...trackedIssues].sort((a, b) => a.number - b.number),
  };
}

export function identity(target: TargetRef, kind: ResourceKind, issueNumber?: number, labelName?: string): ResourceIdentity {
  if (kind === "managed-label") return { kind, key: `${target.owner}/${target.repository}:label:${labelName}` };
  if (kind.startsWith("issue-") || kind === "closed-issue-project-status") return { kind, key: `${target.owner}/${target.repository}:issue:${issueNumber}:project` };
  return { kind, key: `${target.owner}/${target.repository}:${kind}` };
}
