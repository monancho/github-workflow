#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { GitHubCorePort } from "./core/github.js";
import { apply, plan, verify } from "./core/reconcile.js";
import { requestFor } from "./core/profile.js";
import type { ApplyReport, ReconciliationPlan, TrackedIssueRef } from "./core/types.js";

function argumentsMap(args: string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith("--") || !args[index + 1]) throw new Error("Expected --option value pairs");
    options.set(args[index].slice(2), args[index + 1]);
  }
  return options;
}
function required(options: Map<string, string>, key: string): string {
  const value = options.get(key);
  if (!value) throw new Error(`Missing --${key}`);
  return value;
}
async function jsonFile<T>(path: string): Promise<T> {
  const bytes = await readFile(path);
  const utf16le = bytes[0] === 0xff && bytes[1] === 0xfe;
  const utf16be = bytes[0] === 0xfe && bytes[1] === 0xff;
  const value = utf16le || utf16be ?
    new TextDecoder(utf16le ? "utf-16le" : "utf-16be").decode(bytes.subarray(2)) :
    new TextDecoder("utf-8").decode(bytes);
  return JSON.parse(value.replace(/^\uFEFF/, "")) as T;
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || !["inspect", "plan", "apply", "verify"].includes(command)) {
    process.stderr.write("Usage: github-workflow <inspect|plan|apply|verify> --owner OWNER --repo REPO [--issues FILE] [--plan FILE] [--apply-report FILE]\n");
    return 2;
  }
  const options = argumentsMap(args);
  const issues = options.has("issues") ? await jsonFile<TrackedIssueRef[]>(required(options, "issues")) : [];
  const request = requestFor({ owner: required(options, "owner"), repository: required(options, "repo") }, issues);
  const cancellation = new AbortController();
  process.once("SIGINT", () => cancellation.abort());
  process.once("SIGTERM", () => cancellation.abort());
  const port = new GitHubCorePort(process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN, fetch, cancellation.signal);
  let result: unknown;
  if (command === "inspect") result = await port.inspectManagedState(request);
  if (command === "plan") result = plan(request, await port.inspectManagedState(request));
  if (command === "apply") result = await apply(port, request, await jsonFile<ReconciliationPlan>(required(options, "plan")), cancellation.signal);
  if (command === "verify") result = await verify(port, request,
    await jsonFile<ReconciliationPlan>(required(options, "plan")),
    await jsonFile<ApplyReport>(required(options, "apply-report")), cancellation.signal);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  const outcome = (result as { outcome: string }).outcome;
  return ["inspected", "ready", "no-change", "applied", "verified"].includes(outcome) ? 0 : 1;
}

main().then(code => { process.exitCode = code; }).catch(() => {
  process.stderr.write("Command failed before a structured result could be produced; inspect target state before retry\n");
  process.exitCode = 2;
});
