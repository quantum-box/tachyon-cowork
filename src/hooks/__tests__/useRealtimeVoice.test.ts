import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  buildRealtimeAgentChatContext,
  buildRealtimeToolSessionConfig,
  buildRealtimeToolSessionUpdate,
  extractRealtimeTranscriptUpdate,
  extractRealtimeToolCall,
  useRealtimeVoice,
} from "../useRealtimeVoice";

describe("extractRealtimeTranscriptUpdate", () => {
  it("extracts user transcription deltas from realtime events", () => {
    expect(
      extractRealtimeTranscriptUpdate({
        type: "conversation.item.input_audio_transcription.delta",
        item_id: "item-1",
        content_index: 0,
        delta: "hello",
      }),
    ).toEqual({
      role: "user",
      id: "user:item-1:0",
      text: "hello",
      isFinal: false,
      mode: "append",
    });
  });

  it("extracts assistant audio transcript deltas from realtime events", () => {
    expect(
      extractRealtimeTranscriptUpdate({
        type: "response.output_audio_transcript.delta",
        response_id: "resp-1",
        output_index: 0,
        content_index: 0,
        delta: "hi",
      }),
    ).toEqual({
      role: "assistant",
      id: "assistant:resp-1:0:0",
      text: "hi",
      isFinal: false,
      mode: "append",
    });
  });

  it("extracts final assistant transcripts", () => {
    expect(
      extractRealtimeTranscriptUpdate({
        type: "response.output_audio_transcript.done",
        response_id: "resp-1",
        output_index: 0,
        content_index: 0,
        transcript: "hi there",
      }),
    ).toEqual({
      role: "assistant",
      id: "assistant:resp-1:0:0",
      text: "hi there",
      isFinal: true,
      mode: "replace",
    });
  });
});

describe("realtime agent chat tools", () => {
  it("builds session config for initial client secret requests", () => {
    const sessionConfig = buildRealtimeToolSessionConfig();
    expect(sessionConfig).toMatchObject({
      tool_choice: "auto",
      tools: [
        expect.objectContaining({ name: "read_agent_chat_context" }),
        expect.objectContaining({ name: "stop_realtime_voice" }),
        expect.objectContaining({ name: "set_agent_chat_draft" }),
        expect.objectContaining({ name: "update_agent_chat_draft" }),
        expect.objectContaining({ name: "submit_agent_chat_draft" }),
      ],
    });
    expect(sessionConfig.instructions).toContain("what tools you can use");
    expect(sessionConfig.instructions).toContain("in Japanese");
  });

  it("includes current agent chat context in realtime session config", () => {
    const sessionConfig = buildRealtimeToolSessionConfig(
      "User: 今日の天気を調べて\nAgent: 東京は晴れです",
    );

    expect(sessionConfig.instructions).toContain("Current Agent chat context");
    expect(sessionConfig.instructions).toContain("東京は晴れです");
  });

  it("builds session tools for drafting, editing, and sending agent chat input", () => {
    const sessionUpdate = buildRealtimeToolSessionUpdate();
    expect(sessionUpdate).toMatchObject({
      type: "session.update",
      session: {
        tool_choice: "auto",
        tools: [
          expect.objectContaining({ name: "read_agent_chat_context" }),
          expect.objectContaining({ name: "stop_realtime_voice" }),
          expect.objectContaining({ name: "set_agent_chat_draft" }),
          expect.objectContaining({ name: "update_agent_chat_draft" }),
          expect.objectContaining({ name: "submit_agent_chat_draft" }),
        ],
      },
    });
    expect(sessionUpdate.session.instructions).toContain(
      "text input assistant",
    );
    expect(sessionUpdate.session.instructions).toContain("brainstorming");
    expect(sessionUpdate.session.instructions).toContain("today's weather");
  });

  it("extracts realtime function calls from argument completion events", () => {
    expect(
      extractRealtimeToolCall({
        type: "response.function_call_arguments.done",
        call_id: "call-1",
        name: "set_agent_chat_draft",
        arguments: '{"text":"調査して"}',
      }),
    ).toEqual({
      callId: "call-1",
      name: "set_agent_chat_draft",
      argumentsJson: '{"text":"調査して"}',
    });
  });

  it("extracts realtime function calls from completed output items", () => {
    expect(
      extractRealtimeToolCall({
        type: "response.output_item.done",
        item: {
          type: "function_call",
          call_id: "call-2",
          name: "read_agent_chat_context",
          arguments: "{}",
        },
      }),
    ).toEqual({
      callId: "call-2",
      name: "read_agent_chat_context",
      argumentsJson: "{}",
    });
  });

  it("extracts realtime function calls from completed responses", () => {
    expect(
      extractRealtimeToolCall({
        type: "response.done",
        response: {
          output: [
            {
              type: "function_call",
              call_id: "call-3",
              name: "update_agent_chat_draft",
              arguments: '{"text":"今日の東京の天気を調べて"}',
            },
          ],
        },
      }),
    ).toEqual({
      callId: "call-3",
      name: "update_agent_chat_draft",
      argumentsJson: '{"text":"今日の東京の天気を調べて"}',
    });
  });
});

describe("buildRealtimeAgentChatContext", () => {
  it("builds compact context from recent agent chat chunks", () => {
    expect(
      buildRealtimeAgentChatContext([
        {
          type: "user",
          id: "u1",
          text: "今日の天気を調べて",
          created_at: "2026-05-09T00:00:00.000Z",
        },
        {
          type: "tool_result",
          id: "t1",
          tool_name: "web_search",
          tool_result: "東京の天気は晴れ",
          created_at: "2026-05-09T00:00:01.000Z",
        },
        {
          type: "assistant",
          id: "a1",
          text: "東京は晴れです。",
          created_at: "2026-05-09T00:00:02.000Z",
        },
      ]),
    ).toBe(
      "User: 今日の天気を調べて\nTool result (web_search): 東京の天気は晴れ\nAgent: 東京は晴れです。",
    );
  });
});

describe("useRealtimeVoice transcripts", () => {
  it("keeps realtime transcripts separate from agent chat chunks", () => {
    const { result } = renderHook(() => useRealtimeVoice(null));

    act(() => {
      result.current.appendTranscript({
        role: "user",
        id: "user:item-1",
        text: "hel",
        isFinal: false,
      });
      result.current.appendTranscript({
        role: "user",
        id: "user:item-1",
        text: "hello",
        isFinal: true,
      });
      result.current.appendTranscript({
        role: "assistant",
        id: "assistant:resp-1",
        text: "hi",
        isFinal: false,
      });
    });

    expect(result.current.transcripts).toEqual([
      {
        role: "user",
        id: "user:item-1",
        text: "hello",
        isFinal: true,
      },
      {
        role: "assistant",
        id: "assistant:resp-1",
        text: "hi",
        isFinal: false,
      },
    ]);
  });

  it("clears realtime transcripts without touching agent state", () => {
    const { result } = renderHook(() => useRealtimeVoice(null));

    act(() => {
      result.current.appendTranscript({
        role: "user",
        id: "user:item-1",
        text: "hello",
        isFinal: true,
      });
    });
    act(() => {
      result.current.clearTranscripts();
    });

    expect(result.current.transcripts).toEqual([]);
  });
});
