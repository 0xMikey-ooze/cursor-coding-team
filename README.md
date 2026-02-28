# cursor-coding-team

An [OpenClaw](https://github.com/openclaw/openclaw) skill that wraps the [Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints) into an agentic coding team. Launch, orchestrate, and manage multiple Cursor background agents as a coordinated coding team — directly from your OpenClaw Pi agent.

## What It Does

Your OpenClaw agent gets the ability to:

- **Launch parallel coding agents** — decompose a feature into sub-tasks and run them simultaneously on any GitHub repo
- **Poll for completion** — wait for agents to finish with configurable intervals and timeouts
- **Send follow-ups** — refine agent work mid-flight with additional instructions
- **Review conversations** — read the full agent transcript to understand what was done
- **Auto-create PRs** — each agent can open its own pull request on completion
- **Sequential pipelines** — chain agents where one picks up where the previous left off

## Architecture

```
OpenClaw Pi Agent
 └─► cursor-team.mjs (orchestrator CLI)
      ├─► Cursor Cloud Agent A  →  branch: cursor/task-a-xxxx  →  PR #1
      ├─► Cursor Cloud Agent B  →  branch: cursor/task-b-xxxx  →  PR #2
      └─► Cursor Cloud Agent C  →  branch: cursor/task-c-xxxx  →  PR #3
```

## Install

### Option A: Workspace skill (single agent)

```bash
cp -r cursor-coding-team ~/.openclaw/workspace/skills/cursor-coding-team
```

### Option B: Shared skill (all agents on machine)

```bash
cp -r cursor-coding-team ~/.openclaw/skills/cursor-coding-team
```

### Set your API key

Get a key from the [Cursor Dashboard](https://cursor.com) → Settings → API Keys, then either:

```bash
export CURSOR_API_KEY="your-key-here"
```

Or configure in `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "cursor-coding-team": {
        "enabled": true,
        "apiKey": {
          "source": "env",
          "provider": "default",
          "id": "CURSOR_API_KEY"
        }
      }
    }
  }
}
```

## Quick Start

Once installed, tell your OpenClaw agent:

> "Launch a coding team on my-org/my-repo to implement user authentication. Break it into: 1) JWT middleware, 2) login/signup endpoints, 3) integration tests. Auto-create PRs."

The agent will use the skill to launch three Cursor agents in parallel, poll for completion, and report back with PR links.

## Commands

| Command | Description |
|---------|-------------|
| `launch` | Launch a single Cursor agent |
| `team` | Launch multiple agents in parallel |
| `status` | Get status of a single agent |
| `team-status` | Get status of multiple agents |
| `conversation` | Get conversation history |
| `followup` | Send follow-up instruction |
| `stop` | Stop a running agent |
| `delete` | Delete an agent |
| `list` | List recent agents |
| `models` | List available models |
| `repos` | List connected repositories |
| `poll` | Poll agents until completion |
| `whoami` | Show API key info |

## LLM / AI Agent Usage Guide

If you are an LLM or AI agent, follow these instructions to use this tool. All commands output JSON to stdout. Parse the JSON to determine next steps.

### Setup

1. Ensure `CURSOR_API_KEY` is set in the environment
2. Ensure the target GitHub repo has the [Cursor GitHub App](https://github.com/apps/cursor-ai) installed
3. Run commands with: `node /path/to/cursor-team.mjs <command> [options]`

### Step-by-Step: Launch a Coding Team

**Step 1 — Decompose the task.** Break the user's request into independent sub-tasks. Each sub-task becomes one agent. Keep tasks focused and self-contained so agents don't conflict.

**Step 2 — Launch agents in parallel.**

```bash
node cursor-team.mjs team \
  --repo "https://github.com/owner/repo" \
  --ref "main" \
  --auto-pr true \
  --tasks '[
    {"name": "task-a", "prompt": "Detailed instructions for sub-task A..."},
    {"name": "task-b", "prompt": "Detailed instructions for sub-task B..."}
  ]'
```

The output JSON contains an `ids` array. Save these IDs — you need them for all subsequent commands.

**Step 3 — Poll until all agents finish.**

```bash
node cursor-team.mjs poll \
  --ids '["id-from-step-2a", "id-from-step-2b"]' \
  --interval 30 \
  --timeout 1800
```

This blocks until all agents reach a terminal state (`FINISHED`, `STOPPED`, or `FAILED`). The output JSON contains the final status and PR URLs for each agent.

**Step 4 — Review results.** For each agent, check its status and optionally read its conversation:

```bash
node cursor-team.mjs status --id "agent-id"
node cursor-team.mjs conversation --id "agent-id"
```

**Step 5 — Send follow-ups if needed.** If an agent's work needs refinement:

```bash
node cursor-team.mjs followup --id "agent-id" --prompt "Please also add error handling for..."
```

Then poll again for completion.

### Step-by-Step: Launch a Single Agent

For simpler tasks that don't need decomposition:

```bash
node cursor-team.mjs launch \
  --repo "https://github.com/owner/repo" \
  --prompt "Fix the bug in UserService.getProfile() described in issue #42" \
  --auto-pr true
```

Save the `id` from the response, then poll:

```bash
node cursor-team.mjs poll --ids '["the-agent-id"]' --interval 30 --timeout 1800
```

### Command Reference

| Command | Required Args | Optional Args | Description |
|---------|--------------|---------------|-------------|
| `launch` | `--repo`, `--prompt` | `--ref`, `--model`, `--auto-pr`, `--branch`, `--webhook-url`, `--webhook-secret` | Launch one agent |
| `team` | `--repo`, `--tasks` (JSON array) | `--ref`, `--model`, `--auto-pr`, `--webhook-url`, `--webhook-secret` | Launch multiple agents in parallel |
| `status` | `--id` | | Get agent status, branch, PR URL |
| `team-status` | `--ids` (JSON array) | | Get status of multiple agents |
| `conversation` | `--id` | | Get full conversation transcript |
| `followup` | `--id`, `--prompt` | | Send follow-up instruction |
| `stop` | `--id` | | Stop a running agent |
| `delete` | `--id` | | Delete an agent permanently |
| `list` | | `--limit`, `--cursor` | List recent agents |
| `models` | | | List available models |
| `repos` | | | List connected repos (rate-limited: 1/min) |
| `poll` | `--ids` (JSON array) | `--interval` (sec), `--timeout` (sec) | Block until agents finish |
| `whoami` | | | Show API key info |

### Agent Status Values

- `CREATING` — agent is being provisioned, wait and poll again
- `RUNNING` — agent is actively working, wait and poll again
- `FINISHED` — agent completed successfully, check PR URL in status
- `STOPPED` — agent was manually stopped
- `FAILED` — agent encountered an error, read conversation for details

### Workflow Patterns

**Parallel (independent tasks):** Use `team` to launch all at once, then `poll` to wait.

**Sequential (dependent tasks):** Launch agent 1, poll until finished, read its conversation to understand what it did, then launch agent 2 with `--ref` set to agent 1's branch so it builds on that work.

**Review after implementation:** After implementation agents finish, launch a review agent on the same branch with a prompt like: "Review all changes on this branch for security issues, bugs, and test coverage gaps."

### Error Handling

All errors are returned as JSON: `{"error": "message"}`. Common cases:

- **Missing `CURSOR_API_KEY`** — set the environment variable before running
- **401** — invalid API key, get a new one from cursor.com dashboard
- **403** — the Cursor GitHub App is not installed on the target repo
- **404** — agent was deleted or ID is wrong
- **429** — rate limited, wait and retry with longer interval

### Tips for Effective Agent Prompts

- Be specific: reference exact file paths, function names, and line numbers when possible
- Include acceptance criteria: tell the agent what "done" looks like
- One concern per agent: don't mix unrelated tasks in a single agent
- Reference issues: include issue numbers and descriptions for context
- Mention the branch: if building on another agent's work, explain what was already done

## Files

```
cursor-coding-team/
├── SKILL.md          # OpenClaw skill definition (YAML frontmatter + instructions)
├── cursor-api.mjs    # Cursor Cloud Agents API client (all 10 endpoints + polling)
├── cursor-team.mjs   # CLI orchestrator (13 commands, JSON output)
└── README.md
```

## Requirements

- Node.js ≥ 22 (ships with OpenClaw)
- `CURSOR_API_KEY` environment variable
- GitHub repos must have the Cursor GitHub App installed

## API Coverage

Wraps every endpoint from the [Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints):

| Endpoint | Method | Wrapped |
|----------|--------|---------|
| `/v0/agents` | `POST` | ✅ `launch` |
| `/v0/agents` | `GET` | ✅ `list` |
| `/v0/agents/:id` | `GET` | ✅ `status` |
| `/v0/agents/:id/conversation` | `GET` | ✅ `conversation` |
| `/v0/agents/:id/followup` | `POST` | ✅ `followup` |
| `/v0/agents/:id/stop` | `POST` | ✅ `stop` |
| `/v0/agents/:id` | `DELETE` | ✅ `delete` |
| `/v0/me` | `GET` | ✅ `whoami` |
| `/v0/models` | `GET` | ✅ `models` |
| `/v0/repositories` | `GET` | ✅ `repos` |

## License

MIT
