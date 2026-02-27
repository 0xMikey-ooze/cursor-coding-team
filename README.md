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
