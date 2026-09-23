import type { AppliedOperation, GitHubPort, InspectionReport, Label, PlannedOperation, ReconciliationRequest, ResourceObservation } from "./domain.js";
import { fingerprint } from "./domain.js";
import { labels } from "./profile.js";

type Fetcher = typeof fetch;

export class GitHubLabelPort implements GitHubPort {
  constructor(private readonly token: string | undefined, private readonly fetcher: Fetcher = fetch) {}

  private async response(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetcher(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}`);
    return response;
  }

  async inspectManagedState(request: ReconciliationRequest): Promise<InspectionReport> {
    this.request = request;
    const base = `https://api.github.com/repos/${encodeURIComponent(request.target.owner)}/${encodeURIComponent(request.target.repository)}`;
    let outcome: InspectionReport["outcome"] = "inspected";
    const diagnostics: string[] = [];
    let found: Label[] = [];
    try {
      const repository = await (await this.response(base)).json() as {
        private?: boolean; has_issues?: boolean; owner?: { type?: string };
      };
      if (repository.private !== false || repository.owner?.type !== "User" || repository.has_issues !== true) {
        outcome = "unsupported";
        diagnostics.push("Target must be a public personal-account repository with Issues enabled");
      } else {
        let next: string | undefined = `${base}/labels?per_page=100`;
        let pages = 0;
        while (next) {
          if (++pages > 100) throw new Error("Incomplete label pagination");
          const response = await this.response(next);
          const page = await response.json();
          if (!Array.isArray(page) || !page.every(item => item && typeof item.name === "string")) {
            throw new Error("Invalid label response");
          }
          found = found.concat(page.map(item => ({ name: item.name })));
          const link = response.headers.get("link") ?? "";
          const match = link.match(/<([^>]+)>;\s*rel="next"/);
          next = match?.[1];
          if (next) {
            const parsed = new URL(next);
            if (parsed.origin !== "https://api.github.com" || parsed.pathname !== `${new URL(base).pathname}/labels`) {
              throw new Error("Unexpected pagination URL");
            }
          }
        }
      }
    } catch {
      outcome = "failed";
      diagnostics.push("GitHub target or label inspection failed");
    }
    const resources: ResourceObservation[] = labels.map(label => {
      const matches = found.filter(item => item.name.toLowerCase() === label.name);
      return {
        identity: { kind: "managed-label", key: label.name },
        classification: outcome === "unsupported" ? "unsupported" : outcome === "failed" ? "unverifiable" :
          matches.length > 1 ? "ambiguous" : matches.length === 1 ? "compatible" : "missing",
        ...(matches.length === 1 ? { actual: { name: matches[0].name } } : {}),
        safeDiagnostics: [],
      };
    });
    return {
      phase: "inspect", resourceScope: "managed-labels", target: request.target, profile: request.profile,
      observedAt: new Date().toISOString(), stateFingerprint: fingerprint(resources), capabilities: [], resources,
      unrelatedSummary: found.filter(item => !labels.some(label => label.name === item.name.toLowerCase()))
        .map(item => ({ kind: "managed-label", key: item.name })),
      outcome, safeDiagnostics: diagnostics,
    };
  }

  async checkPreconditions(operations: readonly PlannedOperation[]): Promise<InspectionReport> {
    if (!this.request || operations.some(operation => operation.resource.kind !== "managed-label" ||
      !labels.some(label => label.name === operation.resource.key))) throw new Error("Invalid precondition request");
    return this.inspectManagedState(this.request);
  }

  async execute(operation: PlannedOperation): Promise<AppliedOperation> {
    if (!this.token) throw new Error("GitHub token is required for apply");
    const label = labels.find(item => item.name === operation.resource.key);
    if (operation.kind !== "ensure-managed-label" || !label) throw new Error("Unsupported operation");
    if (!this.request) throw new Error("Target was not inspected");
    const base = `https://api.github.com/repos/${encodeURIComponent(this.request.target.owner)}/${encodeURIComponent(this.request.target.repository)}`;
    await this.response(`${base}/labels`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(label),
    });
    return { operation, outcome: "applied", safeDiagnostics: [] };
  }

  private request?: ReconciliationRequest;
  bind(request: ReconciliationRequest): this {
    this.request = request;
    return this;
  }
}
