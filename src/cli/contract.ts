export const CLI_VERSION = "0.1.0";
export const RESULT_SCHEMA_VERSION = 1;
export const PROFILE_NAME = "v0.1.0-core-profile";

export type Command = "inspect" | "plan" | "apply" | "verify";
export type OutputFormat = "json" | "text";
export type Invocation = {
  command: Command;
  format: OutputFormat;
  owner: string;
  repository: string;
  profile: typeof PROFILE_NAME;
  issuesFile?: string;
  planFile?: string;
  applyReportFile?: string;
};
export type ParseResult = { action: "help" } | { action: "version" } | { action: "run"; invocation: Invocation };
export type CliFailure = {
  schemaVersion: 1;
  phase: "cli";
  resourceScope: "core-profile";
  outcome: "invalid-input" | "failed";
  safeDiagnostics: string[];
};

export class CliInputError extends Error {
  constructor(message: string) { super(message); }
}

export const HELP = `github-workflow ${CLI_VERSION}
Usage: github-workflow <inspect|plan|apply|verify> --owner OWNER --repo REPO --profile ${PROFILE_NAME} [options]

Options:
  --issues FILE        JSON array of selected tracked Issues; optional
  --plan FILE          Saved JSON Plan; required by apply and verify
  --apply-report FILE  Saved JSON Apply report; required by verify
  --format json|text   Output format (default: json)
  --help, -h           Show this help
  --version, -V        Show CLI version

All commands are non-interactive. JSON results go to stdout and have schemaVersion 1.
Save plan/apply artifacts using --format json. Exit codes: 0 success/no-change,
2 invalid input, 3 blocked, 4 unsupported, 5 unverifiable/non-conforming,
6 partial failure/interrupted, 7 remote or unexpected failure.
`;

export function parseCliArgs(argv: string[]): ParseResult {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return { action: "help" };
  if (argv.includes("--version") || argv.includes("-V")) return { action: "version" };
  const [command, ...args] = argv;
  if (!(["inspect", "plan", "apply", "verify"] as string[]).includes(command))
    throw new CliInputError("Expected inspect, plan, apply, or verify command");
  const accepted = new Set(["owner", "repo", "profile", "issues", "plan", "apply-report", "format"]);
  const values = new Map<string, string>();
  if (args.length % 2 !== 0) throw new CliInputError("Expected --option value pairs");
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag.startsWith("--") || !accepted.has(flag.slice(2)) || !value || value.startsWith("--") || values.has(flag.slice(2)))
      throw new CliInputError("Unknown, duplicate, or valueless option");
    values.set(flag.slice(2), value);
  }
  const required = (key: string): string => {
    const value = values.get(key);
    if (!value) throw new CliInputError(`Missing --${key}`);
    return value;
  };
  const profile = required("profile");
  if (profile !== PROFILE_NAME) throw new CliInputError("Unsupported profile selection");
  const format = values.get("format") ?? "json";
  if (format !== "json" && format !== "text") throw new CliInputError("Expected --format json or text");
  if ((command === "inspect" || command === "plan") && (values.has("plan") || values.has("apply-report")) ||
      command === "apply" && values.has("apply-report")) throw new CliInputError("Option is not valid for this command");
  const invocation: Invocation = {
    command: command as Command, format, owner: required("owner"), repository: required("repo"), profile,
    ...(values.has("issues") ? { issuesFile: values.get("issues") } : {}),
    ...(command === "apply" || command === "verify" ? { planFile: required("plan") } : {}),
    ...(command === "verify" ? { applyReportFile: required("apply-report") } : {}),
  };
  return { action: "run", invocation };
}

export function exitCodeFor(outcome: string): number {
  if (["inspected", "ready", "no-change", "applied", "verified"].includes(outcome)) return 0;
  if (outcome === "invalid-input") return 2;
  if (outcome === "blocked") return 3;
  if (outcome === "unsupported") return 4;
  if (["unverifiable", "non-conforming"].includes(outcome)) return 5;
  if (["partial-failure", "interrupted"].includes(outcome)) return 6;
  return 7;
}

export function failure(outcome: CliFailure["outcome"], diagnostic: string): CliFailure {
  return { schemaVersion: RESULT_SCHEMA_VERSION, phase: "cli", resourceScope: "core-profile", outcome,
    safeDiagnostics: [diagnostic] };
}

export function renderText(result: Record<string, unknown>): string {
  const lines = [`Schema: ${result.schemaVersion}`, `Phase: ${result.phase}`, `Outcome: ${result.outcome}`];
  const target = result.target;
  if (target && typeof target === "object" && "owner" in target && "repository" in target)
    lines.push(`Target: ${String(target.owner)}/${String(target.repository)}`);
  const profile = result.profile;
  if (profile && typeof profile === "object" && "name" in profile && "version" in profile)
    lines.push(`Profile: ${String(profile.name)} ${String(profile.version)}`);
  for (const [key, label] of [["stateFingerprint", "State fingerprint"], ["inspectionFingerprint", "Inspection fingerprint"],
    ["planFingerprint", "Plan fingerprint"], ["preflightInspectionFingerprint", "Preflight fingerprint"]]) {
    if (result[key]) lines.push(`${label}: ${String(result[key])}`);
  }
  const capabilities = result.capabilities;
  if (Array.isArray(capabilities)) {
    lines.push(`Capabilities: ${capabilities.length}`);
    for (const item of capabilities) {
      const entry = item as Record<string, unknown>;
      lines.push(`  ${String(entry.capability)}: ${String(entry.status)}`);
    }
  }
  const resources = result.resources;
  if (Array.isArray(resources)) {
    lines.push(`Resources: ${resources.length}`);
    for (const item of resources) {
      if (!item || typeof item !== "object") continue;
      const observed = item as Record<string, unknown>;
      const resource = (observed.resource ?? observed.identity) as Record<string, unknown> | undefined;
      if (resource) lines.push(`  ${String(resource.kind)} ${String(resource.key)}: ${String(observed.status ?? observed.classification)}`);
      if (Array.isArray(observed.safeDiagnostics))
        for (const diagnostic of observed.safeDiagnostics) lines.push(`    ${String(diagnostic)}`);
    }
  }
  const operations = result.operations;
  if (Array.isArray(operations)) {
    lines.push(`Operations: ${operations.length}`);
    for (const item of operations) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const operation = (entry.operation ?? entry) as Record<string, unknown>;
      lines.push(`  ${String(operation.kind)} ${String(operation.id)}${entry.outcome ? `: ${String(entry.outcome)}` : ""}`);
      if (operation.expectedEffect) lines.push(`    Effect: ${String(operation.expectedEffect)}`);
      if (Array.isArray(operation.dependsOn) && operation.dependsOn.length)
        lines.push(`    Depends on: ${operation.dependsOn.map(String).join(", ")}`);
      if (Array.isArray(entry.safeDiagnostics))
        for (const diagnostic of entry.safeDiagnostics) lines.push(`    ${String(diagnostic)}`);
    }
  }
  const blocked = result.blockedResources;
  if (Array.isArray(blocked)) {
    lines.push(`Blocked resources: ${blocked.length}`);
    for (const item of blocked) {
      const entry = item as Record<string, unknown>;
      const resource = entry.identity as Record<string, unknown> | undefined;
      if (resource) lines.push(`  ${String(resource.kind)} ${String(resource.key)}: ${String(entry.classification)}`);
      if (Array.isArray(entry.safeDiagnostics))
        for (const diagnostic of entry.safeDiagnostics) lines.push(`    ${String(diagnostic)}`);
    }
  }
  const expectations = result.initialStatusExpectations;
  if (Array.isArray(expectations)) {
    lines.push(`Initial-status expectations: ${expectations.length}`);
    for (const item of expectations) {
      const entry = item as Record<string, unknown>;
      const resource = entry.resource as Record<string, unknown> | undefined;
      if (resource) lines.push(`  ${String(resource.key)}: ${String(entry.expectedStatus)}`);
    }
  }
  const unrelated = result.unrelatedSummary;
  if (Array.isArray(unrelated)) lines.push(`Unrelated observed: ${unrelated.length}`);
  const warnings = result.warnings;
  if (Array.isArray(warnings) && warnings.length) {
    lines.push("Warnings:");
    for (const warning of warnings) lines.push(`  ${String(warning)}`);
  }
  const diagnostics = result.safeDiagnostics;
  if (Array.isArray(diagnostics) && diagnostics.length) {
    lines.push("Diagnostics:");
    for (const item of diagnostics) lines.push(`  ${String(item)}`);
  }
  return `${lines.join("\n")}\n`;
}
