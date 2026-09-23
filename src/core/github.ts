import { fingerprint } from "../domain.js";
import { identity, labels, statuses } from "./profile.js";
import type { AppliedOperation, GitHubPort, InspectionReport, PlannedOperation, ReconciliationRequest, ResourceObservation, StandardProjectStatus } from "./types.js";

type Fetcher = typeof fetch;
type ProjectOption = { id?: string; name: string; color?: string; description?: string };
type ProjectField = { __typename: string; id: string; name: string; options?: ProjectOption[] };
type Project = { id: string; title: string; number: number; closed: boolean; owner?: { login?: string }; repositories: { nodes: { nameWithOwner: string }[]; pageInfo: { hasNextPage: boolean } }; fields: { nodes: ProjectField[]; pageInfo: { hasNextPage: boolean } }; items: { nodes: { id: string }[] } };
type Issue = { id: string; number: number; state: "OPEN" | "CLOSED"; projectItems: { nodes: { id: string; project: { id: string }; fieldValueByName?: { name?: string; optionId?: string } | null }[]; pageInfo: { hasNextPage: boolean } } };
type Context = { repoId: string; ownerId: string; project?: Project; statusField?: ProjectField; issues: Map<number, Issue> };
type ProjectsPage = { user?: { id: string; projectsV2: { nodes: { id: string; title: string }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } };

const projectQuery = `query($id:ID!){node(id:$id){... on ProjectV2{id title number closed owner{... on User{login}} repositories(first:100){nodes{nameWithOwner} pageInfo{hasNextPage}} fields(first:100){nodes{__typename ... on ProjectV2Field{id name} ... on ProjectV2SingleSelectField{id name options{id name color description}}} pageInfo{hasNextPage}} items(first:1){nodes{id}}}}}`;
const issueQuery = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){issue(number:$number){id number state projectItems(first:100){nodes{id project{id} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name optionId}}} pageInfo{hasNextPage}}}}}`;

export class GitHubCorePort implements GitHubPort {
  private request?: ReconciliationRequest;
  private context?: Context;
  constructor(private readonly token: string | undefined, private readonly fetcher: Fetcher = fetch) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...extra };
  }
  private async rest<T>(url: string, init: RequestInit = {}): Promise<{ value: T; response: Response }> {
    const response = await this.fetcher(url, { ...init, headers: { ...this.headers(), ...init.headers } });
    if (!response.ok) throw new Error("GitHub REST request failed");
    return { value: await response.json() as T, response };
  }
  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await this.fetcher("https://api.github.com/graphql", {
      method: "POST", headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error("GitHub GraphQL request failed");
    const result = await response.json() as { data?: T; errors?: unknown[] };
    if (!result.data || result.errors?.length) throw new Error("GitHub GraphQL response was incomplete");
    return result.data;
  }
  private async projects(owner: string): Promise<{ ownerId: string; entries: { id: string; title: string }[] }> {
    const entries: { id: string; title: string }[] = [];
    let after: string | null = null;
    for (let page = 0; page < 100; page++) {
      const data: ProjectsPage = await this.graphql<ProjectsPage>(
        `query($login:String!,$after:String){user(login:$login){id projectsV2(first:100,after:$after){nodes{id title} pageInfo{hasNextPage endCursor}}}}`,
        { login: owner, after });
      if (!data.user) throw new Error("Target owner is not a User");
      entries.push(...data.user.projectsV2.nodes);
      if (!data.user.projectsV2.pageInfo.hasNextPage) return { ownerId: data.user.id, entries };
      after = data.user.projectsV2.pageInfo.endCursor;
      if (!after) throw new Error("Incomplete Project pagination");
    }
    throw new Error("Project pagination limit reached");
  }
  private async labels(base: string): Promise<{ name: string }[]> {
    const found: { name: string }[] = [];
    let next: string | undefined = `${base}/labels?per_page=100`;
    for (let page = 0; next && page < 100; page++) {
      const { value, response }: { value: unknown; response: Response } = await this.rest<unknown>(next);
      if (!Array.isArray(value) || !value.every(item => item && typeof item.name === "string")) throw new Error("Invalid label listing");
      found.push(...value.map(item => ({ name: item.name })));
      const match: RegExpMatchArray | null = (response.headers.get("link") ?? "").match(/<([^>]+)>;\s*rel="next"/);
      next = match?.[1];
      if (next) {
        const parsed = new URL(next);
        if (parsed.origin !== "https://api.github.com" || parsed.pathname !== `${new URL(base).pathname}/labels`) throw new Error("Unexpected label pagination URL");
      }
    }
    if (next) throw new Error("Label pagination limit reached");
    return found;
  }
  private unavailable(request: ReconciliationRequest, classification: "unsupported" | "unverifiable", diagnostic: string): InspectionReport {
    const resources: ResourceObservation[] = [
      identity(request.target, "repository-issues"), identity(request.target, "dedicated-project"),
      identity(request.target, "project-statuses"), ...labels.map(label => identity(request.target, "managed-label", undefined, label.name)),
      ...request.trackedIssues.flatMap(issue => [identity(request.target, "issue-project-membership", issue.number),
        identity(request.target, issue.authorizedInitialStatus ? "issue-initial-project-status" : "closed-issue-project-status", issue.number)]),
    ].map(resource => ({ identity: resource, classification, safeDiagnostics: [diagnostic] }));
    return { phase: "inspect", resourceScope: "core-profile", target: request.target, profile: request.profile,
      observedAt: new Date().toISOString(), stateFingerprint: fingerprint(resources), capabilities: [], resources,
      unrelatedSummary: [], outcome: classification === "unsupported" ? "unsupported" : "unverifiable", safeDiagnostics: [diagnostic] };
  }

  async inspectManagedState(request: ReconciliationRequest): Promise<InspectionReport> {
    this.request = request;
    this.context = undefined;
    const base = `https://api.github.com/repos/${encodeURIComponent(request.target.owner)}/${encodeURIComponent(request.target.repository)}`;
    try {
      const repo = (await this.rest<{ id: number; node_id: string; name: string; private: boolean; has_issues: boolean; owner: { type: string; login: string } }>(base)).value;
      if (!repo || typeof repo.node_id !== "string" || !repo.node_id || typeof repo.private !== "boolean" ||
          typeof repo.name !== "string" || typeof repo.has_issues !== "boolean" || !repo.owner || typeof repo.owner.type !== "string" ||
          typeof repo.owner.login !== "string") throw new Error("Incomplete repository response");
      if (repo.private || repo.owner.type !== "User" || repo.owner.login.toLowerCase() !== request.target.owner.toLowerCase()) {
        return this.unavailable(request, "unsupported", "Target must be a public personal-account GitHub.com repository");
      }
      if (repo.name !== request.target.repository || repo.owner.login !== request.target.owner) {
        return this.unavailable(request, "unverifiable", "Target owner/repository spelling must match canonical GitHub identity");
      }
      const { ownerId, entries } = await this.projects(request.target.owner);
      const candidates = entries.filter(entry => entry.title === request.target.repository);
      let project: Project | undefined;
      let projectClass: ResourceObservation["classification"] = candidates.length > 1 ? "ambiguous" : "missing";
      if (candidates.length === 1) {
        const data = await this.graphql<{ node?: Project }>(projectQuery, { id: candidates[0].id });
        project = data.node;
        if (!project || project.fields.pageInfo.hasNextPage || project.repositories.pageInfo.hasNextPage) {
          throw new Error("Project details could not be fully read");
        }
        const links = project.repositories.nodes.map(item => item.nameWithOwner.toLowerCase());
        projectClass = project.closed || project.owner?.login?.toLowerCase() !== request.target.owner.toLowerCase() ||
          links.length !== 1 || links[0] !== `${request.target.owner}/${request.target.repository}`.toLowerCase() ?
          "conflicting" : "compatible";
      }
      const statusFields = project?.fields.nodes.filter(field => field.name === "Status") ?? [];
      const statusField = statusFields.length === 1 && statusFields[0].__typename === "ProjectV2SingleSelectField" ? statusFields[0] : undefined;
      const foundLabels = await this.labels(base);
      const issues = new Map<number, Issue>();
      for (const selected of request.trackedIssues) {
        const data = await this.graphql<{ repository?: { issue?: Issue } }>(issueQuery,
          { owner: request.target.owner, repo: request.target.repository, number: selected.number });
        const issue = data.repository?.issue;
        if (!issue || issue.number !== selected.number || !["OPEN", "CLOSED"].includes(issue.state) ||
            typeof issue.id !== "string" || !issue.projectItems || issue.projectItems.pageInfo.hasNextPage ||
            selected.nodeId && selected.nodeId !== issue.id) {
          throw new Error("Selected Issue or Project membership could not be fully read");
        }
        issues.set(selected.number, issue);
      }
      this.context = { repoId: repo.node_id, ownerId, project: projectClass === "compatible" ? project : undefined, statusField, issues };
      const resources: ResourceObservation[] = [];
      const push = (resource: ResourceObservation) => resources.push(resource);
      push({ identity: identity(request.target, "repository-issues"), classification: repo.has_issues ? "compatible" : "missing",
        actual: { enabled: repo.has_issues }, safeDiagnostics: [] });
      push({ identity: identity(request.target, "dedicated-project"), classification: projectClass,
        ...(project ? { actual: { id: project.id, title: project.title, linkedRepositories: project.repositories.nodes.map(item => item.nameWithOwner) } } : {}),
        safeDiagnostics: projectClass === "conflicting" ? ["Same-title Project is not dedicated to this repository"] : [] });
      let statusClass: ResourceObservation["classification"] = "missing";
      let statusActual: unknown;
      if (projectClass === "compatible" && project) {
        if (statusFields.length > 1 || statusFields.length === 1 && !statusField) statusClass = "conflicting";
        else if (statusField) {
          if (!Array.isArray(statusField.options)) throw new Error("Incomplete Status options");
          const names = statusField.options?.map(option => option.name) ?? [];
          const extras = names.filter(name => !statuses.includes(name as StandardProjectStatus));
          const duplicates = new Set(names).size !== names.length;
          const defaultTemplate = names.length === 3 && ["Todo", "In Progress", "Done"].every(name => names.includes(name)) && !project.items.nodes.length;
          statusClass = duplicates || extras.length && !defaultTemplate ? "conflicting" :
            names.length === statuses.length && statuses.every(name => names.includes(name)) ? "compatible" : "missing";
          statusActual = { projectId: project.id, fieldId: statusField.id, options: statusField.options, defaultTemplate };
        }
      } else if (projectClass !== "missing") statusClass = projectClass;
      push({ identity: identity(request.target, "project-statuses"), classification: statusClass,
        ...(statusActual ? { actual: statusActual } : {}), safeDiagnostics: [] });
      for (const label of labels) {
        const matches = foundLabels.filter(item => item.name.toLowerCase() === label.name);
        push({ identity: identity(request.target, "managed-label", undefined, label.name),
          classification: matches.length > 1 ? "ambiguous" : matches.length ? "compatible" : "missing",
          ...(matches.length === 1 ? { actual: { name: matches[0].name } } : {}), safeDiagnostics: [] });
      }
      for (const selected of request.trackedIssues) {
        const issue = issues.get(selected.number)!;
        const items = projectClass === "compatible" && project ? issue.projectItems.nodes.filter(item => item.project.id === project.id) : [];
        const membershipClass = items.length > 1 ? "ambiguous" : items.length ? "compatible" : "missing";
        const item = items[0];
        push({ identity: identity(request.target, "issue-project-membership", selected.number), classification: membershipClass,
          actual: { issueId: issue.id, issueState: issue.state, ...(item ? { itemId: item.id } : {}) }, safeDiagnostics: [] });
        const status = item?.fieldValueByName?.name;
        if (issue.state === "CLOSED") {
          push({ identity: identity(request.target, "closed-issue-project-status", selected.number),
            classification: item && status === "Done" ? "compatible" : "missing",
            actual: { issueState: issue.state, status: status ?? null, ...(item ? { itemId: item.id } : {}) }, safeDiagnostics: [] });
        } else {
          push({ identity: identity(request.target, "issue-initial-project-status", selected.number),
            classification: item ? "compatible" : "missing",
            actual: { issueState: issue.state, status: status ?? null, ...(item ? { itemId: item.id } : {}) }, safeDiagnostics: [] });
        }
      }
      const unrelatedSummary = [
        ...entries.filter(entry => entry.title !== request.target.repository).map(entry => ({ kind: "dedicated-project" as const, key: `unrelated-project:${entry.id}` })),
        ...foundLabels.filter(item => !labels.some(label => label.name === item.name.toLowerCase()))
          .map(item => ({ kind: "managed-label" as const, key: `unrelated-label:${item.name}` })),
      ];
      return { phase: "inspect", resourceScope: "core-profile", target: request.target, profile: request.profile,
        observedAt: new Date().toISOString(), stateFingerprint: fingerprint(resources),
        capabilities: [{ capability: "project-item-add", status: this.token ? "available" : "unknown", safeDiagnostics: [] }],
        resources, unrelatedSummary, outcome: "inspected", safeDiagnostics: [] };
    } catch {
      return this.unavailable(request, "unverifiable", "GitHub managed state could not be fully inspected");
    }
  }

  async checkPreconditions(operations: readonly PlannedOperation[]): Promise<InspectionReport> {
    if (!this.request || !operations.length) throw new Error("Missing operation context");
    return this.inspectManagedState(this.request);
  }

  async execute(operation: PlannedOperation): Promise<AppliedOperation> {
    if (!this.token || !this.request) throw new Error("GitHub token and target are required for mutation");
    const request = this.request;
    const context = this.context;
    if (!context) throw new Error("Current managed state was not inspected");
    const base = `https://api.github.com/repos/${encodeURIComponent(request.target.owner)}/${encodeURIComponent(request.target.repository)}`;
    if (operation.kind === "ensure-repository-issues") {
      await this.rest(`${base}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ has_issues: true }) });
    } else if (operation.kind === "ensure-dedicated-project") {
      await this.graphql(`mutation($input:CreateProjectV2Input!){createProjectV2(input:$input){projectV2{id}}}`,
        { input: { ownerId: context.ownerId, repositoryId: context.repoId, title: request.target.repository } });
    } else if (operation.kind === "ensure-project-statuses") {
      const project = context.project;
      if (!project) throw new Error("Dedicated Project is unavailable");
      const existing = context.statusField?.options ?? [];
      const options = statuses.map(name => {
        const old = existing.find(option => option.name === name);
        return old ? { id: old.id, name, color: old.color ?? "GRAY", description: old.description ?? "" } :
          { name, color: "GRAY", description: "" };
      });
      if (context.statusField) {
        await this.graphql(`mutation($input:UpdateProjectV2FieldInput!){updateProjectV2Field(input:$input){projectV2Field{... on ProjectV2SingleSelectField{id}}}}`,
          { input: { fieldId: context.statusField.id, singleSelectOptions: options } });
      } else {
        await this.graphql(`mutation($input:CreateProjectV2FieldInput!){createProjectV2Field(input:$input){projectV2Field{... on ProjectV2SingleSelectField{id}}}}`,
          { input: { projectId: project.id, dataType: "SINGLE_SELECT", name: "Status", singleSelectOptions: options } });
      }
    } else if (operation.kind === "ensure-managed-label") {
      const label = labels.find(value => operation.resource.key.endsWith(`:label:${value.name}`));
      if (!label) throw new Error("Unknown managed label");
      await this.rest(`${base}/labels`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(label) });
    } else if (operation.kind === "ensure-issue-project-membership") {
      const project = context.project;
      const issue = context.issues.get(operation.input?.issueNumber ?? -1);
      if (!project || !issue) throw new Error("Issue or Project is unavailable");
      await this.graphql(`mutation($input:AddProjectV2ItemByIdInput!){addProjectV2ItemById(input:$input){item{id}}}`,
        { input: { projectId: project.id, contentId: issue.id } });
    } else if (operation.kind === "ensure-issue-initial-project-status" || operation.kind === "ensure-closed-issue-project-status") {
      const project = context.project;
      const field = context.statusField;
      const issue = context.issues.get(operation.input?.issueNumber ?? -1);
      const item = issue?.projectItems.nodes.find(value => value.project.id === project?.id);
      const option = field?.options?.find(value => value.name === operation.input?.expectedStatus);
      if (!project || !field || !item || !option?.id) throw new Error("Status target is unavailable");
      await this.graphql(`mutation($input:UpdateProjectV2ItemFieldValueInput!){updateProjectV2ItemFieldValue(input:$input){projectV2Item{id}}}`,
        { input: { projectId: project.id, itemId: item.id, fieldId: field.id, value: { singleSelectOptionId: option.id } } });
    } else throw new Error("Unknown operation");
    return { operation, outcome: "applied", safeDiagnostics: [] };
  }
}
