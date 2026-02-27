/**
 * Cursor Cloud Agents API Client
 *
 * Type-safe wrapper for https://api.cursor.com/v0/*
 * Authentication: Basic Auth with API key (key: as username, empty password)
 *
 * @see https://cursor.com/docs/cloud-agent/api/endpoints
 */

const BASE_URL = "https://api.cursor.com";

/**
 * Build Basic Auth header from API key.
 * Cursor uses Basic Auth where the API key is the username and password is empty.
 * @param {string} apiKey
 * @returns {string}
 */
function authHeader(apiKey) {
  // Node 22+ has global btoa, but Buffer.from is safer for binary
  const encoded = Buffer.from(`${apiKey}:`).toString("base64");
  return `Basic ${encoded}`;
}

/**
 * Core HTTP request handler with structured error handling.
 * @param {string} apiKey
 * @param {string} method
 * @param {string} path
 * @param {object} [body]
 * @returns {Promise<any>}
 */
async function request(apiKey, method, path, body) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    Authorization: authHeader(apiKey),
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const init = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new Error(`Network error calling ${method} ${path}: ${err.message}`);
  }

  // 204 No Content (e.g. DELETE)
  if (response.status === 204) {
    return {};
  }

  let data;
  const text = await response.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    const msg =
      data?.message || data?.error || text || `HTTP ${response.status}`;
    const err = new Error(msg);
    err.status = response.status;
    err.body = data;

    if (response.status === 401) {
      err.message = `Authentication failed: ${msg}. Check CURSOR_API_KEY.`;
    } else if (response.status === 403) {
      err.message = `Forbidden: ${msg}. Ensure the GitHub App is installed on this repo.`;
    } else if (response.status === 404) {
      err.message = `Not found: ${msg}. Agent may have been deleted.`;
    } else if (response.status === 429) {
      err.message = `Rate limit exceeded: ${msg}. Back off and retry.`;
    }
    throw err;
  }

  return data;
}

// ─── Agent Lifecycle ──────────────────────────────────────────────────────────

/**
 * POST /v0/agents — Launch a new cloud agent.
 *
 * @param {string} apiKey
 * @param {object} params
 * @param {string} params.promptText        — Task description
 * @param {Array}  [params.promptImages]     — Optional images [{data, dimension:{width,height}}]
 * @param {string} params.repository         — GitHub repo URL
 * @param {string} [params.ref]              — Git ref (default: main)
 * @param {string} [params.model]            — Model name (default: auto)
 * @param {boolean}[params.autoCreatePr]     — Auto-create PR on finish
 * @param {boolean}[params.openAsCursorGithubApp] — Open PR as Cursor GitHub App
 * @param {boolean}[params.skipReviewerRequest]   — Skip reviewer request
 * @param {string} [params.branchName]       — Custom branch name
 * @param {string} [params.webhookUrl]       — Webhook URL
 * @param {string} [params.webhookSecret]    — Webhook HMAC secret (≥32 chars)
 * @returns {Promise<Agent>}
 */
export async function launchAgent(apiKey, params) {
  const body = {
    prompt: {
      text: params.promptText,
    },
    source: {
      repository: params.repository,
    },
  };

  if (params.promptImages?.length) {
    body.prompt.images = params.promptImages;
  }
  if (params.ref) {
    body.source.ref = params.ref;
  }
  if (params.model) {
    body.model = params.model;
  }

  // Target options
  const target = {};
  let hasTarget = false;
  if (params.autoCreatePr !== undefined) {
    target.autoCreatePr = params.autoCreatePr;
    hasTarget = true;
  }
  if (params.openAsCursorGithubApp !== undefined) {
    target.openAsCursorGithubApp = params.openAsCursorGithubApp;
    hasTarget = true;
  }
  if (params.skipReviewerRequest !== undefined) {
    target.skipReviewerRequest = params.skipReviewerRequest;
    hasTarget = true;
  }
  if (params.branchName) {
    target.branchName = params.branchName;
    hasTarget = true;
  }
  if (hasTarget) {
    body.target = target;
  }

  // Webhook
  if (params.webhookUrl) {
    body.webhook = { url: params.webhookUrl };
    if (params.webhookSecret) {
      if (params.webhookSecret.length < 32) {
        throw new Error("Webhook secret must be at least 32 characters");
      }
      body.webhook.secret = params.webhookSecret;
    }
  }

  return request(apiKey, "POST", "/v0/agents", body);
}

/**
 * GET /v0/agents — List agents with pagination.
 * @param {string} apiKey
 * @param {number} [limit=20]  — Max 100
 * @param {string} [cursor]    — Pagination cursor
 * @returns {Promise<{agents: Agent[], nextCursor?: string}>}
 */
export async function listAgents(apiKey, limit = 20, cursor) {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(limit, 100)));
  if (cursor) params.set("cursor", cursor);
  return request(apiKey, "GET", `/v0/agents?${params}`);
}

/**
 * GET /v0/agents/:id — Get agent details.
 * @param {string} apiKey
 * @param {string} id
 * @returns {Promise<Agent>}
 */
export async function getAgent(apiKey, id) {
  return request(apiKey, "GET", `/v0/agents/${encodeURIComponent(id)}`);
}

/**
 * GET /v0/agents/:id/conversation — Get conversation history.
 * @param {string} apiKey
 * @param {string} id
 * @returns {Promise<{id: string, messages: ConversationMessage[]}>}
 */
export async function getAgentConversation(apiKey, id) {
  return request(
    apiKey,
    "GET",
    `/v0/agents/${encodeURIComponent(id)}/conversation`
  );
}

/**
 * POST /v0/agents/:id/followup — Send follow-up instruction.
 * @param {string} apiKey
 * @param {string} id
 * @param {string} promptText
 * @param {Array}  [promptImages]
 * @returns {Promise<{id: string}>}
 */
export async function addFollowUp(apiKey, id, promptText, promptImages) {
  const body = { prompt: { text: promptText } };
  if (promptImages?.length) {
    body.prompt.images = promptImages;
  }
  return request(
    apiKey,
    "POST",
    `/v0/agents/${encodeURIComponent(id)}/followup`,
    body
  );
}

/**
 * POST /v0/agents/:id/stop — Stop a running agent.
 * @param {string} apiKey
 * @param {string} id
 * @returns {Promise<{id: string}>}
 */
export async function stopAgent(apiKey, id) {
  return request(
    apiKey,
    "POST",
    `/v0/agents/${encodeURIComponent(id)}/stop`
  );
}

/**
 * DELETE /v0/agents/:id — Delete an agent permanently.
 * @param {string} apiKey
 * @param {string} id
 * @returns {Promise<{id: string}>}
 */
export async function deleteAgent(apiKey, id) {
  return request(
    apiKey,
    "DELETE",
    `/v0/agents/${encodeURIComponent(id)}`
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * GET /v0/me — API key info.
 * @param {string} apiKey
 * @returns {Promise<{apiKeyName: string, createdAt: string, userEmail: string}>}
 */
export async function getApiKeyInfo(apiKey) {
  return request(apiKey, "GET", "/v0/me");
}

/**
 * GET /v0/models — List available models.
 * @param {string} apiKey
 * @returns {Promise<{models: string[]}>}
 */
export async function listModels(apiKey) {
  return request(apiKey, "GET", "/v0/models");
}

/**
 * GET /v0/repositories — List connected repositories.
 * ⚠️  Strict rate limit: 1 req/min, 30 req/hour.
 * @param {string} apiKey
 * @returns {Promise<{repositories: Repository[]}>}
 */
export async function listRepositories(apiKey) {
  return request(apiKey, "GET", "/v0/repositories");
}

// ─── Polling ──────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["FINISHED", "STOPPED", "FAILED"]);

/**
 * Poll a single agent until it reaches a terminal state.
 * @param {string} apiKey
 * @param {string} id
 * @param {number} [intervalMs=30000]
 * @param {number} [timeoutMs=1800000]  — 30 min default
 * @returns {Promise<Agent>}
 */
export async function pollAgent(apiKey, id, intervalMs = 30000, timeoutMs = 1800000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const agent = await getAgent(apiKey, id);
    if (TERMINAL_STATUSES.has(agent.status)) {
      return agent;
    }
    await sleep(intervalMs);
  }

  // Final check
  const agent = await getAgent(apiKey, id);
  if (TERMINAL_STATUSES.has(agent.status)) {
    return agent;
  }
  throw new Error(
    `Agent ${id} did not reach terminal state within ${timeoutMs / 1000}s. Last status: ${agent.status}`
  );
}

/**
 * Poll multiple agents until all reach terminal states.
 * @param {string} apiKey
 * @param {string[]} ids
 * @param {number} [intervalMs=30000]
 * @param {number} [timeoutMs=1800000]
 * @returns {Promise<Agent[]>}
 */
export async function pollAgents(apiKey, ids, intervalMs = 30000, timeoutMs = 1800000) {
  const deadline = Date.now() + timeoutMs;
  const results = new Map();

  while (Date.now() < deadline) {
    const pending = ids.filter((id) => !results.has(id));
    if (pending.length === 0) break;

    // Check all pending in parallel
    const checks = await Promise.allSettled(
      pending.map((id) => getAgent(apiKey, id))
    );

    for (let i = 0; i < pending.length; i++) {
      const result = checks[i];
      if (result.status === "fulfilled") {
        const agent = result.value;
        if (TERMINAL_STATUSES.has(agent.status)) {
          results.set(pending[i], agent);
        }
      }
      // On rejection, we'll retry next iteration
    }

    if (results.size === ids.length) break;
    await sleep(intervalMs);
  }

  // Final sweep for any still-pending
  const stillPending = ids.filter((id) => !results.has(id));
  if (stillPending.length > 0) {
    const finalChecks = await Promise.allSettled(
      stillPending.map((id) => getAgent(apiKey, id))
    );
    for (let i = 0; i < stillPending.length; i++) {
      if (finalChecks[i].status === "fulfilled") {
        results.set(stillPending[i], finalChecks[i].value);
      }
    }
  }

  return ids.map((id) => results.get(id) || { id, status: "UNKNOWN" });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
