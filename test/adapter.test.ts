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
