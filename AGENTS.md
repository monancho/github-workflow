# Repository agent continuation

Follow [`CONTRIBUTING.md`](CONTRIBUTING.md) for repository execution policy and
[`docs/WORKFLOW_SPEC.md`](docs/WORKFLOW_SPEC.md) for the workflow contract. This
file tells a repository coding agent when to continue that workflow during an
authorized task. It grants no execution, merge, settings, or release authority.
GitHub Issues, Project state, PRs, reviews, and checks are the durable record;
the current chat, worktree, and agent identity are not required to resume.

## At each start or resumption

Scan the repository queue as described in `CONTRIBUTING.md`. Read the selected
Issue and latest material comments, Project state, prerequisites and blockers,
linked PR and its current head SHA, unresolved feedback, checks, and applicable
canonical documentation. Reconstruct the next transition from that state. Prefer
applicable active or Review work before selecting independent new work. An Issue
or PR merely being open is not itself authorization to execute or merge.

## Continue a review-ready handoff

When a Child has committed and pushed an in-scope change, opened or updated a
linked non-draft PR, recorded self-verification, identified its current head SHA,
and left no handoff failure unresolved, treat that handoff as the start of Main's
Review. Move the authorizing Issue to `Review` if needed and continue in the same
task without waiting for another user request to review the PR. Do not treat
"PR opened" or Executor Complete as Work Done.

Main performs Review independent of Child self-verification, then acceptance QA
proportionate to risk. Re-read the Issue, PR diff/body/reviews and canonical
requirements; check scope, semantics, unrelated changes, edge cases, and
evidence. Record findings and QA evidence on the PR. A documented low-risk
change may use the same independent Reviewer for QA. Missing optional checks
are not passing checks.

Keep each quality conclusion tied to the PR head SHA. A new push invalidates
Review and QA conclusions for older heads: inspect the new diff and feedback,
then repeat independent Review and applicable QA on the current head. For a
normal in-scope blocking finding, record it on the PR and return it to the same
Child branch and PR for correction, verification, commit, and push. Do not open a
replacement PR for ordinary rework. Track the finding and its resolution in
the PR so another session can reconstruct the loop.

After the current head passes Review, QA, and required checks, evaluate Merge
Authority under `CONTRIBUTING.md` separately. Merge autonomously only within
its stated envelope. If human integration judgment is required, record the
exact decision needed in the Issue or PR, mark `needs-decision` where
appropriate, and leave that PR unmerged. Re-scan GitHub and continue another
authorized, unblocked, prerequisite-free Issue if one exists. A suspended PR
does not grant authority for unrelated work.

If the same material finding persists or Reviewer and Executor repeatedly
disagree, stop automatic rework after the second equivalent unresolved cycle.
Record the finding, head SHAs, attempted corrections, and precise decision
needed on the PR or Issue; do not loop indefinitely. Escalate sooner for a
material scope or acceptance change, a public contract, significant architecture,
support, security, governance, destructive-state, or release boundary, ambiguous
verification, or an explicit `needs-decision` condition.

After a permitted merge or terminal non-completion, reconcile the Issue, Project,
and parent; confirm durable evidence; clean up the finished local worktree and
branch and the remote branch under the adopted branch policy; then re-scan the
queue. If interrupted, resume from GitHub's current Issue/PR/head/check state,
not a remembered session outcome or stale local worktree.
