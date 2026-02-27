#!/usr/bin/env node

/**
 * cursor-team.mjs — Agentic Coding Team Orchestrator for OpenClaw
 *
 * CLI that wraps the Cursor Cloud Agents API to let the OpenClaw Pi agent
 * launch, coordinate, and monitor a team of Cursor background agents.
 *
 * Usage:
 *   node cursor-team.mjs <command> [options]
 *
 * Commands:
 *   launch          Launch a single Cursor agent
 *   team            Launch multiple agents in parallel
 *   status          Get status of a single agent
 *   team-status     Get status of multiple agents
 *   conversation    Get conversation history for an agent
 *   followup        Send a follow-up instruction to an agent
 *   stop            Stop a running agent
 *   delete          Delete an agent
 *   list            List recent agents
 *   models          List available models
 *   repos           List connected repositories
 *   poll            Poll agents until completion
 *   whoami          Show API key info
 *
 * Environment:
 *   CURSOR_API_KEY  Required. Your Cursor API key.
 */

import {
  launchAgent,
  listAgents,
  getAgent,
  getAgentConversation,
  addFollowUp,
  stopAgent,
  deleteAgent,
  getApiKeyInfo,
  listModels,
  listRepositories,
  pollAgent,
  pollAgents,
} from "./cursor-api.mjs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey() {
  const key = process.env.CURSOR_API_KEY;
  if (!key) {
    fatal("CURSOR_API_KEY environment variable is not set.\nGet your key from: Cursor Dashboard → Settings → API Keys");
  }
  return key;
}

function fatal(msg) {
  console.error(JSON.stringify({ error: msg }));
  process.exit(1);
}

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Parse CLI arguments into a flat key-value map.
 * Supports: --key value, --key=value, --flag (boolean true)
 * @param {string[]} args
 * @returns {Record<string, string>}
 */
function parseArgs(args) {
  const result = {};
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        // --key=value
        result[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        // --key value
        result[arg.slice(2)] = args[i + 1];
        i++;
      } else {
        // --flag (boolean)
        result[arg.slice(2)] = "true";
      }
    }
    i++;
  }
  return result;
}

function parseBool(val) {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "boolean") return val;
  return val === "true" || val === "1" || val === "yes";
}

function requireArg(opts, name) {
  if (!opts[name]) {
    fatal(`Missing required argument: --${name}`);
  }
  return opts[name];
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdLaunch(opts) {
  const apiKey = getApiKey();
  const repo = requireArg(opts, "repo");
  const promptText = requireArg(opts, "prompt");

  const result = await launchAgent(apiKey, {
    promptText,
    repository: repo,
    ref: opts.ref || "main",
    model: opts.model,
    autoCreatePr: parseBool(opts["auto-pr"]),
    openAsCursorGithubApp: parseBool(opts["cursor-github-app"]),
    skipReviewerRequest: parseBool(opts["skip-reviewer"]),
    branchName: opts.branch,
    webhookUrl: opts["webhook-url"],
    webhookSecret: opts["webhook-secret"],
  });

  output({
    success: true,
    agent: {
      id: result.id,
      name: result.name,
      status: result.status,
      branch: result.target?.branchName,
      url: result.target?.url,
      createdAt: result.createdAt,
    },
  });
}

async function cmdTeam(opts) {
  const apiKey = getApiKey();
  const repo = requireArg(opts, "repo");
  const tasksRaw = requireArg(opts, "tasks");

  let tasks;
  try {
    tasks = JSON.parse(tasksRaw);
  } catch (e) {
    fatal(`Invalid JSON for --tasks: ${e.message}`);
  }

  if (!Array.isArray(tasks) || tasks.length === 0) {
    fatal("--tasks must be a non-empty JSON array of {name, prompt} objects");
  }

  // Validate all tasks before launching any
  for (const task of tasks) {
    if (!task.prompt) {
      fatal(`Task "${task.name || "unnamed"}" is missing a "prompt" field`);
    }
  }

  const ref = opts.ref || "main";
  const model = opts.model;
  const autoCreatePr = parseBool(opts["auto-pr"]);
  const webhookUrl = opts["webhook-url"];
  const webhookSecret = opts["webhook-secret"];

  // Launch all agents in parallel
  const launches = tasks.map((task) =>
    launchAgent(apiKey, {
      promptText: task.prompt,
      repository: repo,
      ref,
      model: task.model || model,
      autoCreatePr,
      branchName: task.branch,
      webhookUrl,
      webhookSecret,
    })
      .then((agent) => ({
        taskName: task.name || "unnamed",
        success: true,
        id: agent.id,
        name: agent.name,
        status: agent.status,
        branch: agent.target?.branchName,
        url: agent.target?.url,
      }))
      .catch((err) => ({
        taskName: task.name || "unnamed",
        success: false,
        error: err.message,
      }))
  );

  const results = await Promise.all(launches);

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  output({
    summary: {
      total: tasks.length,
      launched: successCount,
      failed: failCount,
    },
    agents: results,
    // Convenience: array of just the IDs for use with poll/team-status
    ids: results.filter((r) => r.success).map((r) => r.id),
  });
}

async function cmdStatus(opts) {
  const apiKey = getApiKey();
  const id = requireArg(opts, "id");
  const agent = await getAgent(apiKey, id);
  output({
    id: agent.id,
    name: agent.name,
    status: agent.status,
    branch: agent.target?.branchName,
    url: agent.target?.url,
    prUrl: agent.target?.prUrl,
    summary: agent.summary,
    createdAt: agent.createdAt,
  });
}

async function cmdTeamStatus(opts) {
  const apiKey = getApiKey();
  const idsRaw = requireArg(opts, "ids");

  let ids;
  try {
    ids = JSON.parse(idsRaw);
  } catch (e) {
    fatal(`Invalid JSON for --ids: ${e.message}`);
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    fatal("--ids must be a non-empty JSON array of agent ID strings");
  }

  const checks = await Promise.allSettled(
    ids.map((id) => getAgent(apiKey, id))
  );

  const agents = ids.map((id, i) => {
    const result = checks[i];
    if (result.status === "fulfilled") {
      const a = result.value;
      return {
        id: a.id,
        name: a.name,
        status: a.status,
        branch: a.target?.branchName,
        url: a.target?.url,
        prUrl: a.target?.prUrl,
        summary: a.summary,
      };
    } else {
      return { id, status: "ERROR", error: result.reason?.message };
    }
  });

  const statusCounts = {};
  for (const a of agents) {
    statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
  }

  output({
    summary: statusCounts,
    agents,
  });
}

async function cmdConversation(opts) {
  const apiKey = getApiKey();
  const id = requireArg(opts, "id");
  const conv = await getAgentConversation(apiKey, id);
  output(conv);
}

async function cmdFollowup(opts) {
  const apiKey = getApiKey();
  const id = requireArg(opts, "id");
  const promptText = requireArg(opts, "prompt");
  const result = await addFollowUp(apiKey, id, promptText);
  output({ success: true, id: result.id });
}

async function cmdStop(opts) {
  const apiKey = getApiKey();
  const id = requireArg(opts, "id");
  const result = await stopAgent(apiKey, id);
  output({ success: true, id: result.id });
}

async function cmdDelete(opts) {
  const apiKey = getApiKey();
  const id = requireArg(opts, "id");
  const result = await deleteAgent(apiKey, id);
  output({ success: true, id: result.id });
}

async function cmdList(opts) {
  const apiKey = getApiKey();
  const limit = parseInt(opts.limit || "20", 10);
  const cursor = opts.cursor;
  const result = await listAgents(apiKey, limit, cursor);
  output(result);
}

async function cmdModels() {
  const apiKey = getApiKey();
  const result = await listModels(apiKey);
  output(result);
}

async function cmdRepos() {
  const apiKey = getApiKey();
  const result = await listRepositories(apiKey);
  output(result);
}

async function cmdPoll(opts) {
  const idsRaw = requireArg(opts, "ids");
  const apiKey = getApiKey();

  let ids;
  try {
    ids = JSON.parse(idsRaw);
  } catch (e) {
    fatal(`Invalid JSON for --ids: ${e.message}`);
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    fatal("--ids must be a non-empty JSON array of agent ID strings");
  }

  const intervalSec = parseInt(opts.interval || "30", 10);
  const timeoutSec = parseInt(opts.timeout || "1800", 10);

  const results = await pollAgents(
    apiKey,
    ids,
    intervalSec * 1000,
    timeoutSec * 1000
  );

  const statusCounts = {};
  for (const a of results) {
    const s = a.status || "UNKNOWN";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  output({
    summary: statusCounts,
    agents: results.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      branch: a.target?.branchName,
      url: a.target?.url,
      prUrl: a.target?.prUrl,
      summary: a.summary,
    })),
  });
}

async function cmdWhoami() {
  const apiKey = getApiKey();
  const info = await getApiKeyInfo(apiKey);
  output(info);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const COMMANDS = {
  launch: cmdLaunch,
  team: cmdTeam,
  status: cmdStatus,
  "team-status": cmdTeamStatus,
  conversation: cmdConversation,
  followup: cmdFollowup,
  stop: cmdStop,
  delete: cmdDelete,
  list: cmdList,
  models: cmdModels,
  repos: cmdRepos,
  poll: cmdPoll,
  whoami: cmdWhoami,
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    output({
      usage: "node cursor-team.mjs <command> [options]",
      commands: Object.keys(COMMANDS),
      help: "Use --help after any command for details",
    });
    process.exit(0);
  }

  const handler = COMMANDS[command];
  if (!handler) {
    fatal(
      `Unknown command: "${command}". Valid commands: ${Object.keys(COMMANDS).join(", ")}`
    );
  }

  const opts = parseArgs(args.slice(1));

  try {
    await handler(opts);
  } catch (err) {
    fatal(err.message);
  }
}

main();
