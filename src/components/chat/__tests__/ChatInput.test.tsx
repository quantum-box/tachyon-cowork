// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInput } from "../ChatInput";

const baseProps = {
  input: "",
  onInputChange: vi.fn(),
  onSubmit: vi.fn(),
  files: [],
  onFilesAdd: vi.fn(),
  onFileRemove: vi.fn(),
};

describe("ChatInput", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("focuses the textarea when a focus request is received", async () => {
    const { rerender } = render(<ChatInput {...baseProps} focusRequest={0} />);
    const textarea = screen.getByPlaceholderText("メッセージを入力...");

    expect(textarea).not.toHaveFocus();

    rerender(<ChatInput {...baseProps} focusRequest={1} />);

    await waitFor(() => {
      expect(textarea).toHaveFocus();
    });
  });
});
