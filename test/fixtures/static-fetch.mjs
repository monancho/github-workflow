const mode = process.env.GITHUB_WORKFLOW_FIXTURE_MODE ?? "conforming";
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (mode === "auth") return Response.json({ message: "Bearer fixture-secret" }, { status: 401 });
  if (url.endsWith("/repos/example/sample")) return Response.json({
    node_id: "repo-id", name: "sample", private: mode === "private", has_issues: true,
    owner: { type: "User", login: "example" },
  });
  if (url.includes("/labels?")) return Response.json([{ name: "needs-decision" }, { name: "blocked" }]);
  if (url.endsWith("/graphql")) {
    const { query } = JSON.parse(String(init?.body));
    if (query.includes("projectsV2(first:100")) return Response.json({ data: { user: {
      id: "owner-id", projectsV2: { nodes: [{ id: "project-id", title: "sample" }],
        pageInfo: { hasNextPage: false, endCursor: null } },
    } } });
    if (query.includes("node(id:$id)")) return Response.json({ data: { node: {
      id: "project-id", title: "sample", number: 2, closed: false, owner: { login: "example" },
      repositories: { nodes: [{ nameWithOwner: "example/sample" }], pageInfo: { hasNextPage: false } },
      fields: { nodes: [{ __typename: "ProjectV2SingleSelectField", id: "field-id", name: "Status",
        options: ["Backlog", "Ready", "In Progress", "Review", "Done"].map(name => ({
          id: `opt-${name}`, name, color: "GRAY", description: "",
        })) }], pageInfo: { hasNextPage: false } },
      items: { nodes: [] },
    } } });
  }
  return Response.json({ message: "Unexpected fixture request" }, { status: 404 });
};
