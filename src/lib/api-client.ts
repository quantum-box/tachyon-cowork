import type {
  AgentChunk,
  AgentExecuteRequest,
  AuthConfig,
  ChatRoom,
  ModelInfo,
} from "./types";

export class AgentChatClient {
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
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

  private buildUrl(path: string): string {
    const base = this.config.apiBaseUrl.replace(/\/+$/, "");
    return `${base}${path}`;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options?.headers,
      },
    });
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
    const response = await fetch(url, {
      method: "DELETE",
      headers: this.getHeaders(),
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
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...this.getHeaders(),
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
}
