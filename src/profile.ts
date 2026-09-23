import type { ReconciliationRequest, TargetRef } from "./domain.js";

export const labels = [
  { name: "needs-decision", color: "FBCA04", description: "Decision required before work can proceed" },
  { name: "blocked", color: "B60205", description: "Blocked by a condition not represented as an Issue Dependency" },
] as const;

export function requestFor(target: TargetRef): ReconciliationRequest {
  if (!/^[A-Za-z0-9-]+$/.test(target.owner) || !/^[A-Za-z0-9._-]+$/.test(target.repository)) {
    throw new Error("Invalid target owner or repository");
  }
  return { target, profile: { name: "v0.1.0-core-profile", version: "0.1.0" }, trackedIssues: [] };
}
