import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsPage } from "../SettingsPage";

const baseProps = {
  onBack: vi.fn(),
  theme: "system" as const,
  onThemeChange: vi.fn(),
  selectedModel: "gpt-5.4",
  modelOptions: [{ id: "gpt-5.4", label: "GPT-5.4" }],
  onModelChange: vi.fn(),
  onLogout: vi.fn(),
  sendKey: "enter" as const,
  onSendKeyChange: vi.fn(),
  realtimeVoiceEnabled: true,
  onRealtimeVoiceEnabledChange: vi.fn(),
  realtimeSoundEnabled: true,
  onRealtimeSoundEnabledChange: vi.fn(),
  realtimeVoiceMode: "conversation" as const,
  onRealtimeVoiceModeChange: vi.fn(),
  voiceDotShortPressMode: "conversation" as const,
  onVoiceDotShortPressModeChange: vi.fn(),
  voiceDotLongPressMode: "whisper" as const,
  onVoiceDotLongPressModeChange: vi.fn(),
  floatingVoiceOpenOnStartup: false,
  onFloatingVoiceOpenOnStartupChange: vi.fn(),
  voiceDotMenuBarIconEnabled: true,
  onVoiceDotMenuBarIconEnabledChange: vi.fn(),
  globalCustomInstructions: "",
  onGlobalCustomInstructionsChange: vi.fn(),
  maxRequests: 10,
  onMaxRequestsChange: vi.fn(),
};

describe("SettingsPage realtime voice mode", () => {
  it("renders realtime voice mode aliases and emits mode changes", () => {
    const onRealtimeVoiceModeChange = vi.fn();
    render(
      <SettingsPage
        {...baseProps}
        onRealtimeVoiceModeChange={onRealtimeVoiceModeChange}
        showMcpSettings={false}
      />,
    );

    const select = screen.getByLabelText("マイクボタン");
    expect(select).toHaveValue("conversation");
    expect(screen.getAllByText("GPT-Realtime-2").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("GPT-Realtime-Translate").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("GPT-Realtime-Whisper").length).toBeGreaterThan(
      0,
    );

    fireEvent.change(select, { target: { value: "whisper" } });

    expect(onRealtimeVoiceModeChange).toHaveBeenCalledWith("whisper");
  });

  it("renders independent Fn short and long press API selectors", () => {
    const onVoiceDotShortPressModeChange = vi.fn();
    const onVoiceDotLongPressModeChange = vi.fn();
    render(
      <SettingsPage
        {...baseProps}
        onVoiceDotShortPressModeChange={onVoiceDotShortPressModeChange}
        onVoiceDotLongPressModeChange={onVoiceDotLongPressModeChange}
        showMcpSettings={false}
      />,
    );

    const shortPress = screen.getByLabelText("Fn 短押し");
    const longPress = screen.getByLabelText("Fn 長押し");
    expect(shortPress).toHaveValue("conversation");
    expect(longPress).toHaveValue("whisper");

    fireEvent.change(shortPress, { target: { value: "translate" } });
    fireEvent.change(longPress, { target: { value: "conversation" } });

    expect(onVoiceDotShortPressModeChange).toHaveBeenCalledWith("translate");
    expect(onVoiceDotLongPressModeChange).toHaveBeenCalledWith("conversation");
  });
});
