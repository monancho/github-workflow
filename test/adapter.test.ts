import assert from "node:assert/strict";
import { test } from "node:test";
import { GitHubCorePort } from "../src/core/github.js";
import { requestFor, statuses } from "../src/core/profile.js";
import { apply, plan, verify } from "../src/core/reconcile.js";

class GitHubFixture {
  issuesEnabled = false;
  project = false;
  projectClosed = false;
  duplicateProject = false;
  linked = true;
  options = ["Todo", "In Progress", "Done"];
  labels = ["unrelated"];
  member = false;
  archivedItem = false;
  issueClosed = false;
  status: string | null = null;
  privateRepo = false;
  incompleteRepo = false;
  failLabelCreate = false;
  writes: string[] = [];

  fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/sample") && init?.method === "PATCH") {
      this.issuesEnabled = true;
      this.writes.push("issues");
      return Response.json({ has_issues: true });
    }
    if (url.endsWith("/sample")) return Response.json({ node_id: "repo-id", name: "sample", private: this.privateRepo,
      ...(this.incompleteRepo ? {} : { has_issues: this.issuesEnabled }), owner: { type: "User", login: "example" } });
    if (url.includes("/labels?")) return Response.json(this.labels.map(name => ({ name })));
    if (url.endsWith("/labels") && init?.method === "POST") {
      if (this.failLabelCreate) return Response.json({ message: "Bearer dummy-secret" }, { status: 503 });
      const value = JSON.parse(String(init.body)) as { name: string };
      this.labels.push(value.name);
      this.writes.push(`label:${value.name}`);
      return Response.json(value, { status: 201 });
    }
    if (url.endsWith("/graphql")) {
      const { query, variables } = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, any> };
      if (query.includes("createProjectV2(input:")) {
        this.project = true; this.writes.push("project");
        return Response.json({ data: { createProjectV2: { projectV2: { id: "project-id" } } } });
      }
      if (query.includes("updateProjectV2Field(input:") || query.includes("createProjectV2Field(input:")) {
        this.options = variables.input.singleSelectOptions.map((value: { name: string }) => value.name);
        this.writes.push("statuses");
        return Response.json({ data: { updateProjectV2Field: { projectV2Field: { id: "field-id" } } } });
      }
      if (query.includes("addProjectV2ItemById(input:")) {
        this.member = true; this.writes.push("membership");
        return Response.json({ data: { addProjectV2ItemById: { item: { id: "item-id" } } } });
      }
      if (query.includes("updateProjectV2ItemFieldValue(input:")) {
        this.status = String(variables.input.value.singleSelectOptionId).slice(4);
        this.writes.push("initial-status");
        return Response.json({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "item-id" } } } });
      }
      if (query.includes("projectsV2(first:100")) return Response.json({ data: { user: {
        id: "owner-id", projectsV2: { nodes: this.project ? [{ id: "project-id", title: "sample" },
          ...(this.duplicateProject ? [{ id: "duplicate-id", title: "sample" }] : []),
          { id: "unrelated-id", title: "other" }] :
          [{ id: "unrelated-id", title: "other" }], pageInfo: { hasNextPage: false, endCursor: null } },
      } } });
      if (query.includes("node(id:$id)")) return Response.json({ data: { node: {
        id: "project-id", title: "sample", number: 2, closed: this.projectClosed, owner: { login: "example" },
        repositories: { nodes: [{ nameWithOwner: this.linked ? "example/sample" : "example/other" }], pageInfo: { hasNextPage: false } },
        fields: { nodes: [{ __typename: "ProjectV2SingleSelectField", id: "field-id", name: "Status",
          options: this.options.map(name => ({ id: `opt-${name}`, name, color: "GRAY", description: "" })) }],
          pageInfo: { hasNextPage: false } },
        items: { nodes: this.member ? [{ id: "item-id", isArchived: this.archivedItem }] : [] },
      } } });
      if (query.includes("issue(number:$number)")) return Response.json({ data: { repository: { issue: {
        id: "issue-id", number: 7, state: this.issueClosed ? "CLOSED" : "OPEN", projectItems: {
          nodes: this.member ? [{ id: "item-id", isArchived: this.archivedItem, project: { id: "project-id" },
            fieldValueByName: this.status ? { name: this.status, optionId: `opt-${this.status}` } : null }] : [],
          pageInfo: { hasNextPage: false },
        },
      } } } });
    }
    return Response.json({ message: "unexpected fixture request" }, { status: 404 });
  };
}

test("REST/GraphQL adapter reconciles a clean target and preserves unrelated resources", async () => {
  const fixture = new GitHubFixture();
  const request = requestFor({ owner: "example", repository: "sample" }, [{ number: 7 }]);
  const port = new GitHubCorePort("dummy-secret", fixture.fetch);
  const inspected = await port.inspectManagedState(request);
  assert.equal(inspected.outcome, "inspected");
  assert.ok(inspected.unrelatedSummary.some(item => item.key === "unrelated-project:unrelated-id"));
  const planned = plan(request, inspected);
  const applied = await apply(port, request, planned);
  assert.equal(applied.outcome, "applied");
  assert.equal((await verify(port, request, planned, applied)).outcome, "verified");
  assert.deepEqual(fixture.options, statuses);
  assert.equal(fixture.status, "Backlog");
  assert.ok(fixture.labels.includes("unrelated"));
  const repeat = plan(request, await port.inspectManagedState(request));
  assert.equal(repeat.outcome, "no-change");
  assert.equal((await apply(port, request, repeat)).outcome, "no-change");
});

test("adapter surfaces unsupported target and redacts failed API response", async () => {
  const fixture = new GitHubFixture();
  const request = requestFor({ owner: "example", repository: "sample" });
  const port = new GitHubCorePort("dummy-secret", fixture.fetch);
  fixture.privateRepo = true;
  assert.equal((await port.inspectManagedState(request)).outcome, "unsupported");
  fixture.privateRepo = false;
  fixture.incompleteRepo = true;
  assert.equal((await port.inspectManagedState(request)).outcome, "unverifiable");
  fixture.incompleteRepo = false;
  fixture.failLabelCreate = true;
  const planned = plan(request, await port.inspectManagedState(request));
  const applied = await apply(port, request, planned);
  assert.equal(applied.outcome, "partial-failure");
  assert.doesNotMatch(JSON.stringify(applied), /dummy-secret/);
});

test("adapter blocks an unrelated same-title Project and conflicting Status options", async () => {
  const fixture = new GitHubFixture();
  fixture.project = true;
  fixture.linked = false;
  const request = requestFor({ owner: "example", repository: "sample" });
  const port = new GitHubCorePort("dummy-secret", fixture.fetch);
  let inspected = await port.inspectManagedState(request);
  assert.equal(inspected.resources.find(item => item.identity.kind === "dedicated-project")?.classification, "conflicting");
  assert.equal(plan(request, inspected).outcome, "blocked");
  fixture.linked = true;
  fixture.options = [...statuses, "Paused"];
  inspected = await port.inspectManagedState(request);
  assert.equal(inspected.resources.find(item => item.identity.kind === "project-statuses")?.classification, "conflicting");
  assert.equal((await apply(port, request, plan(request, inspected))).outcome, "blocked");
  assert.deepEqual(fixture.writes, []);
  fixture.options = [...statuses];
  fixture.projectClosed = true;
  inspected = await port.inspectManagedState(request);
  assert.equal(inspected.resources.find(item => item.identity.kind === "dedicated-project")?.classification, "conflicting");
  fixture.projectClosed = false;
  fixture.duplicateProject = true;
  inspected = await port.inspectManagedState(request);
  assert.equal(inspected.resources.find(item => item.identity.kind === "dedicated-project")?.classification, "ambiguous");
});

test("adapter transitions an already-present closed Issue to Done", async () => {
  const fixture = new GitHubFixture();
  fixture.issuesEnabled = fixture.project = fixture.member = fixture.issueClosed = true;
  fixture.options = [...statuses];
  fixture.labels.push("needs-decision", "blocked");
  fixture.status = "Review";
  const request = requestFor({ owner: "example", repository: "sample" }, [{ number: 7 }]);
  const port = new GitHubCorePort("dummy-secret", fixture.fetch);
  const planned = plan(request, await port.inspectManagedState(request));
  assert.deepEqual(planned.operations.map(item => item.kind), ["ensure-closed-issue-project-status"]);
  const applied = await apply(port, request, planned);
  assert.equal(applied.outcome, "applied");
  assert.equal(fixture.status, "Done");
  assert.equal((await verify(port, request, planned, applied)).outcome, "verified");
});

test("archived Project membership cannot falsely satisfy tracked-Issue lifecycle", async () => {
  const fixture = new GitHubFixture();
  fixture.issuesEnabled = fixture.project = fixture.member = fixture.archivedItem = true;
  fixture.options = [...statuses];
  fixture.labels.push("needs-decision", "blocked");
  fixture.status = "Ready";
  const request = requestFor({ owner: "example", repository: "sample" }, [{ number: 7 }]);
  const port = new GitHubCorePort("dummy-secret", fixture.fetch);
  const inspected = await port.inspectManagedState(request);
  assert.equal(inspected.resources.find(item => item.identity.kind === "issue-project-membership")?.classification, "conflicting");
  assert.equal(plan(request, inspected).outcome, "blocked");
  assert.deepEqual(fixture.writes, []);
});

test("read-only transient and rate-limit responses retry, while mutation failures do not", async () => {
  const fixture = new GitHubFixture();
  const request = requestFor({ owner: "example", repository: "sample" });
  let repoReads = 0;
  let projectReads = 0;
  let labelWrites = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/sample") && !init?.method && repoReads++ === 0)
      return Response.json({ message: "transient" }, { status: 503 });
    if (url.endsWith("/graphql") && String(init?.body).includes("projectsV2(first:100") && projectReads++ === 0)
      return Response.json({ message: "limited" }, { status: 429, headers: { "retry-after": "0" } });
    if (url.endsWith("/labels") && init?.method === "POST") {
      labelWrites++;
      return Response.json({ message: "Bearer dummy-secret" }, { status: 503 });
    }
    return fixture.fetch(input, init);
  };
  const port = new GitHubCorePort("dummy-secret", fetcher);
  const inspected = await port.inspectManagedState(request);
  assert.equal(inspected.outcome, "inspected");
  assert.equal(repoReads, 2);
  assert.equal(projectReads, 2);
  const applied = await apply(port, request, plan(request, inspected));
  assert.equal(applied.outcome, "partial-failure");
  assert.equal(labelWrites, 1);
  assert.doesNotMatch(JSON.stringify(applied), /dummy-secret/);
});

test("pagination includes later managed labels and unrelated Projects", async () => {
  const fixture = new GitHubFixture();
  fixture.issuesEnabled = fixture.project = true;
  fixture.options = [...statuses];
  const request = requestFor({ owner: "example", repository: "sample" });
  let projectPages = 0;
  let labelPages = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/labels?")) {
      labelPages++;
      if (url.includes("page=2")) return Response.json([{ name: "blocked" }, { name: "other" }]);
      return Response.json([{ name: "needs-decision" }], { headers: {
        link: '<https://api.github.com/repos/example/sample/labels?per_page=100&page=2>; rel="next"',
      } });
    }
    if (url.endsWith("/graphql") && String(init?.body).includes("projectsV2(first:100")) {
      projectPages++;
      const { variables } = JSON.parse(String(init?.body)) as { variables: { after?: string } };
      if (!variables.after) return Response.json({ data: { user: { id: "owner-id", projectsV2: {
        nodes: [{ id: "unrelated-first", title: "other-first" }], pageInfo: { hasNextPage: true, endCursor: "next" },
      } } } });
    }
    return fixture.fetch(input, init);
  };
  const port = new GitHubCorePort("dummy-secret", fetcher);
  const inspected = await port.inspectManagedState(request);
  assert.equal(inspected.outcome, "inspected");
  assert.equal(projectPages, 2);
  assert.equal(labelPages, 2);
  assert.ok(inspected.unrelatedSummary.some(item => item.key === "unrelated-project:unrelated-first"));
  assert.equal(plan(request, inspected).outcome, "no-change");
});

test("authorization loss and partial GraphQL data stay unverifiable", async () => {
  const request = requestFor({ owner: "example", repository: "sample" });
  const unauthorized = new GitHubCorePort("dummy-secret", async () =>
    Response.json({ message: "Bearer dummy-secret" }, { status: 401 }));
  const result = await unauthorized.inspectManagedState(request);
  assert.equal(result.outcome, "unverifiable");
  assert.match(result.safeDiagnostics.join(" "), /authorization/);
  assert.doesNotMatch(JSON.stringify(result), /dummy-secret/);
  const fixture = new GitHubFixture();
  const partial = new GitHubCorePort("dummy-secret", async (input, init) =>
    String(input).endsWith("/graphql") ? Response.json({ data: { user: null }, errors: [{ message: "partial" }] }) :
      fixture.fetch(input, init));
  assert.equal((await partial.inspectManagedState(request)).outcome, "unverifiable");
});

test("primary rate limit does not retry before reset", async () => {
  const request = requestFor({ owner: "example", repository: "sample" });
  let attempts = 0;
  const port = new GitHubCorePort("dummy-secret", async () => {
    attempts++;
    return Response.json({ message: "limited" }, { status: 403, headers: {
      "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60),
    } });
  });
  const inspected = await port.inspectManagedState(request);
  assert.equal(inspected.outcome, "unverifiable");
  assert.match(inspected.safeDiagnostics.join(" "), /rate limit/);
  assert.equal(attempts, 1);
});

test("a thrown read-network error retries, but mid-Apply authorization loss stops later writes", async () => {
  const fixture = new GitHubFixture();
  const request = requestFor({ owner: "example", repository: "sample" });
  let repoReads = 0;
  let afterWrite = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/sample") && !init?.method) {
      repoReads++;
      if (repoReads === 1) throw new Error("network lost");
      if (afterWrite) return Response.json({ message: "Bearer dummy-secret" }, { status: 401 });
    }
    const response = await fixture.fetch(input, init);
    if (url.endsWith("/sample") && init?.method === "PATCH") afterWrite = true;
    return response;
  };
  const port = new GitHubCorePort("dummy-secret", fetcher);
  const inspected = await port.inspectManagedState(request);
  assert.equal(inspected.outcome, "inspected");
  assert.equal(repoReads, 2);
  const result = await apply(port, request, plan(request, inspected));
  assert.equal(result.outcome, "partial-failure");
  assert.deepEqual(fixture.writes, ["issues"]);
  assert.doesNotMatch(JSON.stringify(result), /dummy-secret/);
});
