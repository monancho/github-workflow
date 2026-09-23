#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { CLI_VERSION, CliInputError, exitCodeFor, failure, HELP, parseCliArgs, renderText, supportedNodeVersion } from "./cli/contract.js";
import { GitHubCorePort } from "./core/github.js";
import { apply, plan, verify } from "./core/reconcile.js";
import { requestFor } from "./core/profile.js";
import type { ApplyReport, ReconciliationPlan, TrackedIssueRef } from "./core/types.js";

async function jsonFile<T>(path: string): Promise<T> {
  try {
    const bytes = await readFile(path);
    const utf16le = bytes[0] === 0xff && bytes[1] === 0xfe;
    const utf16be = bytes[0] === 0xfe && bytes[1] === 0xff;
    const value = utf16le || utf16be ?
      new TextDecoder(utf16le ? "utf-16le" : "utf-16be").decode(bytes.subarray(2)) :
      new TextDecoder("utf-8").decode(bytes);
    return JSON.parse(value.replace(/^\uFEFF/, "")) as T;
  } catch {
    throw new CliInputError("Could not read a valid JSON input file");
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const requestedText = argv.includes("--format") && argv[argv.indexOf("--format") + 1] === "text";
  try {
    const parsed = parseCliArgs(argv);
    if (parsed.action === "help") { process.stdout.write(HELP); return 0; }
    if (parsed.action === "version") { process.stdout.write(`${CLI_VERSION}\n`); return 0; }
    const { command, format, owner, repository, issuesFile, planFile, applyReportFile } = parsed.invocation;
    if (!supportedNodeVersion(process.versions.node)) {
      const result = failure("unsupported", "Node.js 22 or 24 LTS is required for v0.1.0");
      process.stdout.write(format === "text" ? renderText(result) : `${JSON.stringify(result, null, 2)}\n`);
      return exitCodeFor(result.outcome);
    }
    const issues = issuesFile ? await jsonFile<TrackedIssueRef[]>(issuesFile) : [];
    let request;
    try { request = requestFor({ owner, repository }, issues); }
    catch { throw new CliInputError("Invalid target or tracked-Issue selection"); }
    const cancellation = new AbortController();
    process.once("SIGINT", () => cancellation.abort());
    process.once("SIGTERM", () => cancellation.abort());
    const port = new GitHubCorePort(process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN, fetch, cancellation.signal);
    let result: Record<string, unknown>;
    if (command === "inspect") result = await port.inspectManagedState(request) as unknown as Record<string, unknown>;
    else if (command === "plan") result = plan(request, await port.inspectManagedState(request)) as unknown as Record<string, unknown>;
    else if (command === "apply") result = await apply(port, request,
      await jsonFile<ReconciliationPlan>(planFile!), cancellation.signal) as unknown as Record<string, unknown>;
    else result = await verify(port, request,
      await jsonFile<ReconciliationPlan>(planFile!), await jsonFile<ApplyReport>(applyReportFile!),
      cancellation.signal) as unknown as Record<string, unknown>;
    process.stdout.write(format === "text" ? renderText(result) : `${JSON.stringify(result, null, 2)}\n`);
    return exitCodeFor(String(result.outcome));
  } catch (error) {
    const invalid = error instanceof CliInputError;
    const result = failure(invalid ? "invalid-input" : "failed",
      invalid ? error.message : "Command failed before a phase result could be produced; inspect target state before retry");
    process.stdout.write(requestedText ? renderText(result) : `${JSON.stringify(result, null, 2)}\n`);
    if (!invalid) process.stderr.write("Command failed before a phase result could be produced\n");
    return exitCodeFor(result.outcome);
  }
}

main().then(code => { process.exitCode = code; });
