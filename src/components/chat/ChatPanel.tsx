import type { useAgentChat } from "../../hooks/useAgentChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

type Props = {
  chat: ReturnType<typeof useAgentChat>;
};

export function ChatPanel({ chat }: Props) {
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Error banner */}
      {chat.error && (
        <div className="mx-4 mt-3 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {chat.error.message}
        </div>
      )}

      <MessageList chunks={chat.chunks} isLoading={chat.isLoading} />

      <ChatInput
        input={chat.input}
        onInputChange={chat.setInput}
        onSubmit={chat.handleSubmit}
        isLoading={chat.isLoading}
      />
    </div>
  );
}
