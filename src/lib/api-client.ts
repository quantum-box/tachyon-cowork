import type {
  AgentChunk,
  AgentExecuteRequest,
  AuthConfig,
  ModelInfo,
  SessionSummary,
} from "./types";
import type { TokenManager } from "./token-manager";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeSession(value: unknown): SessionSummary | null {
  if (!isRecord(value)) return null;

  const id =
    typeof value.id === "string"
      ? value.id
      : typeof value.session_id === "string"
        ? value.session_id
        : null;
  if (!id) return null;

  const name =
    typeof value.name === "string"
      ? value.name
      : typeof value.title === "string"
        ? value.title
        : "";

  const createdAt =
    typeof value.created_at === "string"
      ? value.created_at
      : typeof value.createdAt === "string"
        ? value.createdAt
        : new Date().toISOString();

  return { id, name, created_at: createdAt };
}

function normalizeSingleSessionResponse(value: unknown): SessionSummary | null {
  const candidates = [
    value,
    isRecord(value) ? value.session : undefined,
    isRecord(value) ? value.room : undefined,
    isRecord(value) ? value.data : undefined,
    isRecord(value) && isRecord(value.data) ? value.data.session : undefined,
    isRecord(value) && isRecord(value.data) ? value.data.room : undefined,
  ];

  for (const candidate of candidates) {
    const session = normalizeSession(candidate);
    if (session) return session;
  }

  return null;
}

function normalizeSessionsResponse(value: unknown): SessionSummary[] {
  const candidates = [
    value,
    isRecord(value) ? value.sessions : undefined,
    isRecord(value) ? value.items : undefined,
    isRecord(value) ? value.data : undefined,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;

    return candidate
      .map((item) => normalizeSession(item))
      .filter((item): item is SessionSummary => item !== null);
  }

  return [];
}

function normalizeMessagesResponse(value: unknown): AgentChunk[] {
  const candidates = [
    value,
    isRecord(value) ? value.messages : undefined,
    isRecord(value) ? value.chunks : undefined,
    isRecord(value) ? value.items : undefined,
    isRecord(value) ? value.data : undefined,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as AgentChunk[];
    }
  }

  return [];
}

export class AgentChatClient {
  private config: AuthConfig;
  private tokenManager: TokenManager | null = null;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  /** Attach a TokenManager for automatic token refresh. */
  setTokenManager(tm: TokenManager): void {
    this.tokenManager = tm;
  }

  updateConfig(config: Partial<AuthConfig>) {
    this.config = { ...this.config, ...config };
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.accessToken}`,
      "x-operator-id": this.config.tenantId,
    };
    if (this.config.userId) {
      headers["x-user-id"] = this.config.userId;
    }
    return headers;
  }

  /** Ensure the token is fresh before building headers. */
  private async getFreshHeaders(): Promise<Record<string, string>> {
    if (this.tokenManager) {
      const freshToken = await this.tokenManager.ensureFreshToken();
      if (freshToken !== this.config.accessToken) {
        this.config = { ...this.config, accessToken: freshToken };
      }
    }
    return this.getHeaders();
  }

  private buildUrl(path: string): string {
    const base = this.config.apiBaseUrl.replace(/\/+$/, "");
    return `${base}${path}`;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = this.buildUrl(path);
    const headers = await this.getFreshHeaders();
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options?.headers,
      },
    });

    // On 401, try one refresh + retry
    if (response.status === 401 && this.tokenManager) {
      const freshToken = await this.tokenManager.forceRefreshToken();
      this.config = { ...this.config, accessToken: freshToken };
      const retryHeaders = this.getHeaders();
      const retryResponse = await fetch(url, {
        ...options,
        headers: { ...retryHeaders, ...options?.headers },
      });
      if (!retryResponse.ok) {
        if (retryResponse.status === 401) {
          this.tokenManager.handleUnauthorizedError();
        }
        const body = await retryResponse.text().catch(() => "");
        throw new Error(
          `Request failed: ${retryResponse.status} ${retryResponse.statusText}${body ? ` - ${body}` : ""}`,
        );
      }
      return (await retryResponse.json()) as T;
    }

    if (!response.ok) {
      if (response.status === 401 && this.tokenManager) {
        this.tokenManager.handleUnauthorizedError();
      }
      const body = await response.text().catch(() => "");
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
      );
    }
    return (await response.json()) as T;
  }

  // ── Session API ───────────────────────────────────────────────────

  async createSession(
    title?: string,
  ): Promise<{ session: { id: string; name: string } }> {
    const data = await this.request<unknown>("/v1/llms/sessions", {
      method: "POST",
      body: JSON.stringify({ ...(title && { name: title }) }),
    });
    const session = normalizeSingleSessionResponse(data);
    if (!session) {
      throw new Error("Unexpected session create response");
    }
    return { session: { id: session.id, name: session.name } };
  }

  async getSessions(): Promise<SessionSummary[]> {
    const data = await this.request<unknown>("/v1/llms/sessions");
    return normalizeSessionsResponse(data);
  }

  async updateSession(
    id: string,
    payload: { name?: string },
  ): Promise<SessionSummary> {
    const data = await this.request<{ session: SessionSummary }>(
      `/v1/llms/sessions/${id}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
    return data.session;
  }

  async deleteSession(id: string): Promise<void> {
    const url = this.buildUrl(`/v1/llms/sessions/${id}`);
    const headers = await this.getFreshHeaders();
    const response = await fetch(url, {
      method: "DELETE",
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.status}`);
    }
  }

  // ── Agent API ──────────────────────────────────────────────────────

  async executeAgent(
    sessionId: string,
    args: AgentExecuteRequest,
  ): Promise<Response> {
    const url = this.buildUrl(`/v1/llms/sessions/${sessionId}/agent/execute`);
    const headers = await this.getFreshHeaders();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Agent execute failed: ${response.status}${body ? ` - ${body}` : ""}`,
      );
    }
    return response;
  }

  async submitToolResult(
    sessionId: string,
    payload: { tool_id: string; result: string; is_finished: boolean },
  ): Promise<void> {
    const headers = await this.getFreshHeaders();
    const response = await fetch(
      this.buildUrl(`/v1/llms/sessions/${sessionId}/agent/tool-result`),
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      },
    );
    if (response.ok) return;

    const body = await response.text().catch(() => "");
    throw new Error(
      `Tool result submit failed: ${response.status}${body ? ` - ${body}` : ""}`,
    );
  }

  async getMessages(sessionId: string): Promise<AgentChunk[]> {
    try {
      const data = await this.request<unknown>(
        `/v1/llms/sessions/${sessionId}/agent/messages`,
      );
      return normalizeMessagesResponse(data);
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        const fallback = await this.request<unknown>(
          `/v1/llms/sessions/${sessionId}/messages`,
        );
        return normalizeMessagesResponse(fallback);
      }
      throw error;
    }
  }

  async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    const url = this.buildUrl(
      `/v1/llms/sessions/${sessionId}/agent/messages/${messageId}`,
    );
    const headers = await this.getFreshHeaders();
    const response = await fetch(url, { method: "DELETE", headers });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Failed to delete message: ${response.status}${body ? ` - ${body}` : ""}`,
      );
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    const data = await this.request<{ models: ModelInfo[] }>(
      "/v1/llms/models?supported_feature=agent&require_agent_product=true",
    );
    return data.models;
  }

  /** Download a file from a presigned URL as a Blob. */
  async downloadFromUrl(
    url: string,
  ): Promise<{ blob: Blob; filename: string }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Download failed: ${response.status} ${response.statusText}`,
      );
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition");
    let filename = "download";
    if (disposition) {
      const match = /filename[^;=\n]*=["']?([^"';\n]+)/.exec(disposition);
      if (match?.[1]) filename = match[1];
    } else {
      const urlPath = new URL(url).pathname;
      const lastSegment = urlPath.split("/").pop();
      if (lastSegment && lastSegment.includes(".")) filename = lastSegment;
    }
    return { blob, filename };
  }
}
