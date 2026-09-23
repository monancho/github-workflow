import assert from "node:assert/strict";
import { test } from "node:test";
import { GitHubLabelPort } from "../src/github.js";
import { apply, plan, verify } from "../src/reconcile.js";
import { requestFor } from "../src/profile.js";

const request = requestFor({ owner: "example", repository: "sample" });

class Fixture {
  names: string[];
  posts = 0;
  failPostAt = 0;
  public = true;
  constructor(names: string[] = []) { this.names = [...names]; }

  fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/sample")) {
      return Response.json({ private: !this.public, has_issues: true, owner: { type: "User" } });
    }
    if (url.includes("/labels?")) return Response.json(this.names.map(name => ({ name })));
    if (url.endsWith("/labels") && init?.method === "POST") {
      this.posts++;
      if (this.posts === this.failPostAt) return Response.json({ message: "Bearer secret-token" }, { status: 503 });
      const body = JSON.parse(String(init.body)) as { name: string };
      this.names.push(body.name);
      return Response.json(body, { status: 201 });
    }
    return Response.json({}, { status: 404 });
  };

  port() { return new GitHubLabelPort("secret-token", this.fetch).bind(request); }
}

test("missing labels run through all phases, preserve unrelated labels, and repeat as no-op", async () => {
  const fixture = new Fixture(["unrelated"]);
  const port = fixture.port();
  const inspected = await port.inspectManagedState(request);
  assert.equal(inspected.outcome, "inspected");
  assert.equal(inspected.unrelatedSummary[0].key, "unrelated");
  const planned = plan(request, inspected);
  assert.equal(planned.outcome, "ready");
  assert.deepEqual(planned.operations.map(operation => operation.resource.key), ["needs-decision", "blocked"]);
  assert.deepEqual(fixture.names, ["unrelated"]);
  const applied = await apply(port, request, planned);
  assert.equal(applied.outcome, "applied");
  assert.equal((await verify(port, request, planned, applied)).outcome, "verified");
  assert.deepEqual(fixture.names, ["unrelated", "needs-decision", "blocked"]);
  const repeated = plan(request, await port.inspectManagedState(request));
  assert.equal(repeated.outcome, "no-change");
  assert.equal(repeated.operations.length, 0);
  const noChange = await apply(port, request, repeated);
  assert.equal(noChange.outcome, "no-change");
  assert.equal((await verify(port, request, repeated, noChange)).outcome, "verified");
  assert.equal(fixture.posts, 2);
});

test("existing labels with different visual metadata are reused by name", async () => {
  const fixture = new Fixture(["Needs-Decision", "blocked"]);
  const port = fixture.port();
  const planned = plan(request, await port.inspectManagedState(request));
  assert.equal(planned.outcome, "no-change");
  assert.equal((await apply(port, request, planned)).outcome, "no-change");
  assert.equal(fixture.posts, 0);
});

test("a resource changed after planning blocks mutation", async () => {
  const fixture = new Fixture();
  const port = fixture.port();
  const planned = plan(request, await port.inspectManagedState(request));
  fixture.names.push("needs-decision");
  const applied = await apply(port, request, planned);
  assert.equal(applied.outcome, "blocked");
  assert.equal(fixture.posts, 0);
  assert.notEqual((await verify(port, request, planned, applied)).outcome, "verified");
});

test("partial failure is observable, secret-safe, and recoverable by a fresh plan", async () => {
  const fixture = new Fixture();
  fixture.failPostAt = 2;
  const port = fixture.port();
  const planned = plan(request, await port.inspectManagedState(request));
  const applied = await apply(port, request, planned);
  assert.equal(applied.outcome, "partial-failure");
  assert.deepEqual(applied.operations.map(operation => operation.outcome), ["applied", "failed"]);
  assert.doesNotMatch(JSON.stringify(applied), /secret-token/);
  assert.notEqual((await verify(port, request, planned, applied)).outcome, "verified");
  const recovery = plan(request, await port.inspectManagedState(request));
  assert.deepEqual(recovery.operations.map(operation => operation.resource.key), ["blocked"]);
});

test("fresh Verify rejects a false Apply success claim", async () => {
  const fixture = new Fixture();
  const port = fixture.port();
  const planned = plan(request, await port.inspectManagedState(request));
  const fabricated = {
    phase: "apply" as const, resourceScope: "managed-labels" as const,
    planFingerprint: planned.planFingerprint, preflightInspectionFingerprint: planned.inspectionFingerprint,
    operations: planned.operations.map(operation => ({ operation, outcome: "applied" as const, safeDiagnostics: [] })),
    outcome: "applied" as const, safeDiagnostics: [],
  };
  assert.equal((await verify(port, request, planned, fabricated)).outcome, "non-conforming");
  fabricated.planFingerprint = "stale";
  assert.equal((await verify(port, request, planned, fabricated)).outcome, "unverifiable");
  fabricated.planFingerprint = planned.planFingerprint;
  fabricated.preflightInspectionFingerprint = "";
  assert.equal((await verify(port, request, planned, fabricated)).outcome, "unverifiable");
});

test("unsupported targets do not produce executable plans", async () => {
  const fixture = new Fixture();
  fixture.public = false;
  const port = fixture.port();
  const inspected = await port.inspectManagedState(request);
  assert.equal(inspected.outcome, "unsupported");
  const planned = plan(request, inspected);
  assert.equal(planned.outcome, "blocked");
  assert.equal((await apply(port, request, planned)).outcome, "blocked");
  assert.equal(fixture.posts, 0);
});
