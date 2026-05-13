// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "../useKeyboardShortcuts";

function ShortcutHarness({
  onNewChat,
  onNewRealtimeChat,
}: {
  onNewChat: () => void;
  onNewRealtimeChat: () => void;
}) {
  useKeyboardShortcuts({ onNewChat, onNewRealtimeChat });
  return null;
}

describe("useKeyboardShortcuts", () => {
  it("routes Cmd+Shift+N to a realtime new chat", () => {
    const onNewChat = vi.fn();
    const onNewRealtimeChat = vi.fn();

    render(
      <ShortcutHarness
        onNewChat={onNewChat}
        onNewRealtimeChat={onNewRealtimeChat}
      />,
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "n",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    expect(onNewRealtimeChat).toHaveBeenCalledOnce();
    expect(onNewChat).not.toHaveBeenCalled();
  });

  it("keeps Cmd+N on the standard new chat shortcut", () => {
    const onNewChat = vi.fn();
    const onNewRealtimeChat = vi.fn();

    render(
      <ShortcutHarness
        onNewChat={onNewChat}
        onNewRealtimeChat={onNewRealtimeChat}
      />,
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "n",
        metaKey: true,
        bubbles: true,
      }),
    );

    expect(onNewChat).toHaveBeenCalledOnce();
    expect(onNewRealtimeChat).not.toHaveBeenCalled();
  });
});
