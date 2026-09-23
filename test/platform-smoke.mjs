import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const fixture = new URL("./fixtures/static-fetch.mjs", import.meta.url).href;
const installedCli = fileURLToPath(new URL("../portable-install/node_modules/github-workflow/dist/src/cli.js", import.meta.url));
const common = ["--owner", "example", "--repo", "sample", "--profile", "v0.1.0-core-profile"];
for (const [phase, expected] of [["inspect", "inspected"], ["plan", "no-change"]]) {
  const result = spawnSync(process.execPath, ["--import", fixture, installedCli, phase, ...common], {
    encoding: "utf8",
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.outcome, expected);
  assert.equal(report.resourceScope, "core-profile");
}
process.stdout.write(`Installed CLI Inspect/Plan passed on ${process.platform} Node ${process.versions.node}\n`);
