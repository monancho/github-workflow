import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CLI_VERSION, CliInputError, exitCodeFor, parseCliArgs, renderText, supportedNodeVersion } from "../src/cli/contract.js";

const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const preloadUrl = new URL("../../test/fixtures/static-fetch.mjs", import.meta.url).href;
const common = ["--owner", "example", "--repo", "sample", "--profile", "v0.1.0-core-profile"];

function run(args: string[], mode = "conforming"): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", preloadUrl, cliPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GITHUB_WORKFLOW_FIXTURE_MODE: mode },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

test("CLI argument contract and exit codes are explicit", () => {
  assert.equal(supportedNodeVersion("22.23.2"), true);
  assert.equal(supportedNodeVersion("v24.13.1"), true);
  assert.equal(supportedNodeVersion("20.20.2"), false);
  assert.equal(supportedNodeVersion("26.10.0"), false);
  assert.equal(parseCliArgs(["--help"]).action, "help");
  assert.equal(parseCliArgs(["--version"]).action, "version");
  const parsed = parseCliArgs(["verify", ...common, "--plan", "plan.json", "--apply-report", "apply.json", "--format", "text"]);
  assert.equal(parsed.action, "run");
  if (parsed.action === "run") assert.equal(parsed.invocation.format, "text");
  for (const args of [
    ["plan", "--owner", "example", "--repo", "sample"],
    ["inspect", ...common, "--owner", "other"],
    ["plan", ...common, "--plan", "stale.json"],
    ["apply", ...common],
    ["verify", ...common, "--plan", "plan.json"],
    ["plan", ...common, "--format", "yaml"],
  ]) assert.throws(() => parseCliArgs(args), CliInputError);
  for (const [outcome, expected] of Object.entries({
    inspected: 0, ready: 0, "no-change": 0, applied: 0, verified: 0,
    "invalid-input": 2, blocked: 3, unsupported: 4, unverifiable: 5, "non-conforming": 5,
    "partial-failure": 6, interrupted: 6, failed: 7,
  })) assert.equal(exitCodeFor(outcome), expected);
});

test("CLI phases produce reusable versioned JSON and equivalent text", async () => {
  const id = randomUUID();
  const planFile = join(tmpdir(), `github-workflow-cli-plan-${id}.json`);
  const applyFile = join(tmpdir(), `github-workflow-cli-apply-${id}.json`);
  try {
    const inspected = await run(["inspect", ...common]);
    assert.equal(inspected.code, 0);
    assert.equal(inspected.stderr, "");
    assert.equal(JSON.parse(inspected.stdout).schemaVersion, 1);
    assert.equal(JSON.parse(inspected.stdout).outcome, "inspected");

    const planned = await run(["plan", ...common]);
    assert.equal(planned.code, 0);
    const plan = JSON.parse(planned.stdout);
    assert.equal(plan.schemaVersion, 1);
    assert.equal(plan.planSchemaVersion, 1);
    assert.equal(plan.profile.version, CLI_VERSION);
    assert.equal(plan.outcome, "no-change");
    await writeFile(planFile, planned.stdout);

    const textPlan = await run(["plan", ...common, "--format", "text"]);
    assert.equal(textPlan.code, 0);
    assert.equal(textPlan.stdout, renderText(plan));
    assert.equal(textPlan.stderr, "");

    const stale = { ...plan, schemaVersion: 2 };
    await writeFile(planFile, JSON.stringify(stale));
    const blocked = await run(["apply", ...common, "--plan", planFile]);
    assert.equal(blocked.code, 3);
    assert.equal(JSON.parse(blocked.stdout).outcome, "blocked");
    assert.equal(blocked.stderr, "");
    await writeFile(planFile, planned.stdout);

    const applied = await run(["apply", ...common, "--plan", planFile]);
    assert.equal(applied.code, 0);
    assert.equal(JSON.parse(applied.stdout).outcome, "no-change");
    assert.equal(JSON.parse(applied.stdout).schemaVersion, 1);
    await writeFile(applyFile, applied.stdout);

    const verified = await run(["verify", ...common, "--plan", planFile, "--apply-report", applyFile]);
    assert.equal(verified.code, 0);
    assert.equal(JSON.parse(verified.stdout).outcome, "verified");
    assert.equal(JSON.parse(verified.stdout).schemaVersion, 1);
    assert.equal(verified.stderr, "");
  } finally {
    await Promise.allSettled([unlink(planFile), unlink(applyFile)]);
  }
});

test("CLI failures stay parseable, redacted, and non-interactive", async () => {
  const unsupported = await run(["inspect", ...common], "private");
  assert.equal(unsupported.code, 4);
  assert.equal(JSON.parse(unsupported.stdout).outcome, "unsupported");
  assert.equal(unsupported.stderr, "");
  const auth = await run(["inspect", ...common], "auth");
  assert.equal(auth.code, 5);
  assert.equal(JSON.parse(auth.stdout).outcome, "unverifiable");
  assert.doesNotMatch(auth.stdout + auth.stderr, /fixture-secret/);
  const invalid = await run(["plan", "--owner", "example", "--repo", "sample"]);
  assert.equal(invalid.code, 2);
  assert.equal(JSON.parse(invalid.stdout).outcome, "invalid-input");
  assert.equal(invalid.stderr, "");
  const invalidText = await run(["plan", "--owner", "example", "--repo", "sample", "--format", "text"]);
  assert.equal(invalidText.code, 2);
  assert.match(invalidText.stdout, /Outcome: invalid-input/);
  assert.equal(invalidText.stderr, "");
  const blockedText = await run(["plan", ...common, "--format", "text"], "private");
  assert.equal(blockedText.code, 3);
  assert.match(blockedText.stdout, /Blocked resources: 5/);
  const help = await run(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Usage: github-workflow/);
  const version = await run(["--version"]);
  assert.equal(version.code, 0);
  assert.equal(version.stdout, `${CLI_VERSION}\n`);
});
