import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
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
        expect.objectContaining({ name: "set_agent_chat_draft" }),
        expect.objectContaining({ name: "update_agent_chat_draft" }),
        expect.objectContaining({ name: "submit_agent_chat_draft" }),
      ],
    });
    expect(sessionConfig.instructions).toContain("what tools you can use");
    expect(sessionConfig.instructions).toContain("preserve the language");
  });

  it("builds session tools for drafting, editing, and sending agent chat input", () => {
    const sessionUpdate = buildRealtimeToolSessionUpdate();
    expect(sessionUpdate).toMatchObject({
      type: "session.update",
      session: {
        tool_choice: "auto",
        tools: [
          expect.objectContaining({ name: "set_agent_chat_draft" }),
          expect.objectContaining({ name: "update_agent_chat_draft" }),
          expect.objectContaining({ name: "submit_agent_chat_draft" }),
        ],
      },
    });
    expect(sessionUpdate.session.instructions).toContain("text input assistant");
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
          name: "submit_agent_chat_draft",
          arguments: "{}",
        },
      }),
    ).toEqual({
      callId: "call-2",
      name: "submit_agent_chat_draft",
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
