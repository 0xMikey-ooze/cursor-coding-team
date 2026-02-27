---
name: cursor-coding-team
description: >
  Agentic coding team powered by Cursor Cloud Agents API.
  Launch, orchestrate, and manage multiple Cursor background agents as a coordinated coding team.
  Supports parallel task decomposition, agent-to-agent handoff, status polling, conversation retrieval,
  follow-ups, auto-PR creation, and webhook-driven completion notifications.
version: 1.0.0
metadata:
  openclaw:
    requires:
      env:
        - CURSOR_API_KEY
      bins:
        - node
    primaryEnv: CURSOR_API_KEY
    emoji: "🏗️"
    homepage: https://cursor.com/docs/cloud-agent/api/endpoints
---

# Cursor Coding Team — Agentic Orchestrator

You have access to a **team of Cursor Cloud Agents** that can execute coding tasks in parallel on GitHub repositories. Each agent is an autonomous Cursor background agent running in the cloud with full repo context, file editing, terminal access, and the ability to create branches and PRs.

## Architecture

```
You (OpenClaw Pi agent)
 └─► cursor-team.mjs (orchestrator)
      ├─► Cursor Agent A  ─► branch: cursor/task-a-xxxx
      ├─► Cursor Agent B  ─► branch: cursor/task-b-xxxx
      └─► Cursor Agent C  ─► branch: cursor/task-c-xxxx
```

## Available Commands

All commands use the orchestrator script at `SKILL_DIR/cursor-team.mjs`.

### 1. Launch a Single Agent

```bash
node SKILL_DIR/cursor-team.mjs launch \
  --repo "https://github.com/owner/repo" \
  --prompt "Implement the user authentication middleware" \
  --ref "main" \
  --model "auto" \
  --auto-pr true
```

**Parameters:**
- `--repo` (required): GitHub repository URL
- `--prompt` (required): Task description for the agent
- `--ref` (optional): Git ref to branch from (default: `main`)
- `--model` (optional): Model to use (default: `auto`)
- `--auto-pr` (optional): Auto-create PR on completion (default: `false`)
- `--branch` (optional): Custom branch name
- `--webhook-url` (optional): Webhook URL for completion notifications
- `--webhook-secret` (optional): HMAC secret for webhook verification (min 32 chars)

### 2. Launch a Coding Team (Parallel Agents)

```bash
node SKILL_DIR/cursor-team.mjs team \
  --repo "https://github.com/owner/repo" \
  --ref "main" \
  --auto-pr true \
  --tasks '[
    {"name": "auth", "prompt": "Implement JWT authentication middleware in src/middleware/auth.ts"},
    {"name": "api",  "prompt": "Add CRUD endpoints for /api/users with validation"},
    {"name": "tests","prompt": "Write integration tests for the user API endpoints"}
  ]'
```

This launches all agents in parallel and returns their IDs for tracking.

### 3. Check Agent Status

```bash
node SKILL_DIR/cursor-team.mjs status --id "bc_abc123"
```

### 4. Check All Team Status

```bash
node SKILL_DIR/cursor-team.mjs team-status --ids '["bc_abc123","bc_def456","bc_ghi789"]'
```

Returns a consolidated view of all agents with their statuses, branches, and PR URLs.

### 5. Get Agent Conversation

```bash
node SKILL_DIR/cursor-team.mjs conversation --id "bc_abc123"
```

Returns the full conversation history (prompts and responses) for an agent.

### 6. Send Follow-up Instruction

```bash
node SKILL_DIR/cursor-team.mjs followup \
  --id "bc_abc123" \
  --prompt "Also add rate limiting to the auth middleware"
```

### 7. Stop an Agent

```bash
node SKILL_DIR/cursor-team.mjs stop --id "bc_abc123"
```

### 8. Delete an Agent

```bash
node SKILL_DIR/cursor-team.mjs delete --id "bc_abc123"
```

### 9. List Recent Agents

```bash
node SKILL_DIR/cursor-team.mjs list --limit 20
```

### 10. List Available Models

```bash
node SKILL_DIR/cursor-team.mjs models
```

### 11. List Connected Repositories

```bash
node SKILL_DIR/cursor-team.mjs repos
```

**Warning:** Repository listing has strict rate limits (1 request/minute, 30/hour). Cache results.

### 12. Poll Until Complete

```bash
node SKILL_DIR/cursor-team.mjs poll \
  --ids '["bc_abc123","bc_def456"]' \
  --interval 30 \
  --timeout 1800
```

Polls all agents at the given interval (seconds) until all reach a terminal state (FINISHED, STOPPED, FAILED) or the timeout (seconds) is reached. Returns final status summary.

### 13. Get API Key Info

```bash
node SKILL_DIR/cursor-team.mjs whoami
```

## Workflow Patterns

### Pattern A: Parallel Feature Development

When given a large feature request, decompose it into independent sub-tasks and launch them as a team:

1. Analyze the feature and identify independent work streams
2. Use `team` command to launch all agents in parallel
3. Use `poll` to wait for completion
4. Review results via `conversation` and `status` for each agent
5. If adjustments are needed, use `followup` on specific agents

### Pattern B: Sequential Pipeline

For tasks with dependencies:

1. Launch first agent (e.g., "create database schema")
2. Poll until FINISHED
3. Read the conversation to understand what was done
4. Launch second agent on the same repo referencing the first agent's branch
5. Continue the chain

### Pattern C: Code Review Agent

Launch a dedicated review agent after implementation agents finish:

```bash
node SKILL_DIR/cursor-team.mjs launch \
  --repo "https://github.com/owner/repo" \
  --ref "cursor/feature-branch-from-impl-agent" \
  --prompt "Review all changes on this branch. Check for: security vulnerabilities, performance issues, missing error handling, test coverage gaps. Create a detailed review as GitHub PR comments."
```

### Pattern D: Bug Fix Swarm

Launch multiple agents to investigate and fix different aspects of a bug:

```bash
node SKILL_DIR/cursor-team.mjs team \
  --repo "https://github.com/owner/repo" \
  --tasks '[
    {"name": "investigate", "prompt": "Investigate the root cause of issue #42. Read the error logs, trace the code path, and document your findings in a new file INVESTIGATION.md"},
    {"name": "fix",         "prompt": "Fix the null pointer exception in UserService.getProfile() described in issue #42. Include regression tests."},
    {"name": "harden",      "prompt": "Add defensive null checks and input validation across all UserService methods. Add comprehensive error handling."}
  ]'
```

## Agent Status Values

| Status     | Meaning                                |
|------------|----------------------------------------|
| `CREATING` | Agent is being provisioned             |
| `RUNNING`  | Agent is actively working              |
| `FINISHED` | Agent completed its task               |
| `STOPPED`  | Agent was manually stopped             |
| `FAILED`   | Agent encountered an error             |

## Important Notes

- **Authentication**: Requires `CURSOR_API_KEY` environment variable. Get your key from the Cursor Dashboard → Settings → API Keys.
- **Repositories**: The Cursor API can only access repositories connected to your Cursor account via GitHub App installation.
- **Rate Limits**: Repository listing is heavily rate-limited (1/min, 30/hr). Cache results aggressively.
- **Branch Naming**: Cursor auto-generates branch names like `cursor/<task-name>-<hash>`. You can override with `--branch`.
- **Concurrent Agents**: You can run many agents simultaneously. The API handles scheduling.
- **Cost**: Each agent run consumes Cursor usage credits. Be mindful when launching large teams.
- **Polling**: When polling for status, use intervals of 30-60 seconds to avoid rate limits.

## Error Handling

The orchestrator provides clear error messages for:
- `401` — Invalid API key
- `403` — Permission denied (check GitHub App installation)
- `404` — Agent not found (may have been deleted)
- `429` — Rate limit exceeded (back off and retry)
- `5xx` — Cursor server error (retry with exponential backoff)

## Completion Notification

After launching agents and polling for completion, always notify the user:

```bash
openclaw system event --text "Cursor coding team finished: 3/3 agents completed" --mode now
```
