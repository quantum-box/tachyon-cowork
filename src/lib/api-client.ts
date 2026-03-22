import type {
  AgentChunk,
  AgentExecuteRequest,
  AuthConfig,
  ChatRoom,
  ModelInfo,
} from "./types";
import type { TokenManager } from "./token-manager";

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
      const freshToken = await this.tokenManager.ensureFreshToken();
      this.config = { ...this.config, accessToken: freshToken };
      const retryHeaders = this.getHeaders();
      const retryResponse = await fetch(url, {
        ...options,
        headers: { ...retryHeaders, ...options?.headers },
      });
      if (!retryResponse.ok) {
        const body = await retryResponse.text().catch(() => "");
        throw new Error(
          `Request failed: ${retryResponse.status} ${retryResponse.statusText}${body ? ` - ${body}` : ""}`,
        );
      }
      return (await retryResponse.json()) as T;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
      );
    }
    return (await response.json()) as T;
  }

  // ── Chatroom API ──────────────────────────────────────────────────

  async createChatRoom(
    title?: string,
  ): Promise<{ chatroom: { id: string; name: string } }> {
    return this.request("/v1/llms/chatrooms", {
      method: "POST",
      body: JSON.stringify({ ...(title && { name: title }) }),
    });
  }

  async getChatrooms(): Promise<ChatRoom[]> {
    const data = await this.request<{ chatrooms: ChatRoom[] }>(
      "/v1/llms/chatrooms",
    );
    return data.chatrooms;
  }

  async updateChatRoom(
    id: string,
    payload: { name?: string },
  ): Promise<ChatRoom> {
    const data = await this.request<{ chatroom: ChatRoom }>(
      `/v1/llms/chatrooms/${id}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
    return data.chatroom;
  }

  async deleteChatroom(id: string): Promise<void> {
    const url = this.buildUrl(`/v1/llms/chatrooms/${id}`);
    const headers = await this.getFreshHeaders();
    const response = await fetch(url, {
      method: "DELETE",
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to delete chatroom: ${response.status}`);
    }
  }

  // ── Agent API ──────────────────────────────────────────────────────

  async executeAgent(
    chatRoomId: string,
    args: AgentExecuteRequest,
  ): Promise<Response> {
    const url = this.buildUrl(
      `/v1/llms/sessions/${chatRoomId}/agent/execute`,
    );
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
      throw new Error(`Agent execute failed: ${response.status}${body ? ` - ${body}` : ""}`);
    }
    return response;
  }

  async getMessages(chatRoomId: string): Promise<AgentChunk[]> {
    const data = await this.request<{ messages: AgentChunk[] }>(
      `/v1/llms/sessions/${chatRoomId}/agent/messages`,
    );
    return data.messages;
  }

  async getModels(): Promise<ModelInfo[]> {
    const data = await this.request<{ models: ModelInfo[] }>(
      "/v1/llms/models?supported_feature=agent&require_agent_product=true",
    );
    return data.models;
  }

  /** Download a file from a presigned URL as a Blob. */
  async downloadFromUrl(url: string): Promise<{ blob: Blob; filename: string }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
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
