import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  User,
  ChevronDown,
  ChevronRight,
  Wrench,
  CheckCircle,
  Loader2,
  Coins,
  Code,
} from "lucide-react";
import type { AgentChunk, Artifact } from "../../lib/types";

type Props = {
  chunk: AgentChunk;
  onOpenArtifact?: (artifact: Artifact) => void;
};

export function MessageBubble({ chunk, onOpenArtifact }: Props) {
  switch (chunk.type) {
    case "user":
      return <UserMessage text={chunk.text ?? ""} />;
    case "say":
    case "assistant":
    case "attempt_completion":
      return (
        <AssistantMessage
          text={chunk.text || chunk.content || ""}
          onOpenArtifact={onOpenArtifact}
        />
      );
    case "thinking":
      return (
        <ThinkingMessage
          text={chunk.thinking || chunk.text}
          isFinished={chunk.is_finished}
        />
      );
    case "tool_call":
    case "tool_call_args":
    case "tool_call_pending":
      return <ToolCallMessage chunk={chunk} />;
    case "tool_result":
      return <ToolResultMessage chunk={chunk} />;
    case "usage":
      return <UsageMessage chunk={chunk} />;
    case "tool_job_started":
      return (
        <div className="flex justify-start mb-2">
          <div className="text-xs px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            Tool Job: {chunk.provider || "unknown"} (
            {chunk.job_id?.slice(0, 8)}...)
          </div>
        </div>
      );
    case "ask":
      return (
        <div className="flex justify-start mb-3">
          <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-3 bg-yellow-50 border border-yellow-200 text-sm">
            <p className="font-medium mb-2">{chunk.text}</p>
            {chunk.options && (
              <div className="flex flex-wrap gap-2">
                {chunk.options.map((opt) => (
                  <span
                    key={opt}
                    className="px-2 py-1 text-xs rounded-lg bg-yellow-100"
                  >
                    {opt}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    default:
      return null;
  }
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end mb-4 gap-2">
      <div className="max-w-[75%] rounded-2xl rounded-br-sm px-4 py-3 bg-indigo-600 text-white text-sm whitespace-pre-wrap leading-relaxed">
        {text}
      </div>
      <div className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
        <User size={16} className="text-indigo-600" />
      </div>
    </div>
  );
}

/** Parse code blocks from markdown text */
type CodeBlockInfo = {
  language: string;
  code: string;
};

function extractCodeBlocks(text: string): CodeBlockInfo[] {
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  const blocks: CodeBlockInfo[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || "plaintext",
      code: match[2].trimEnd(),
    });
  }
  return blocks;
}

function AssistantMessage({
  text,
  onOpenArtifact,
}: {
  text: string;
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  const codeBlocks = extractCodeBlocks(text);

  const handleOpenCodeBlock = useCallback(
    (block: CodeBlockInfo, index: number) => {
      if (!onOpenArtifact) return;
      const artifact: Artifact = {
        id: crypto.randomUUID(),
        type: "code",
        title: `コードブロック ${index + 1}`,
        content: block.code,
        language: block.language,
        createdAt: new Date().toISOString(),
      };
      onOpenArtifact(artifact);
    },
    [onOpenArtifact],
  );

  return (
    <div className="flex justify-start mb-4 gap-2">
      <div className="shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
        <Bot size={16} className="text-gray-600" />
      </div>
      <div className="max-w-[75%] rounded-2xl rounded-bl-sm px-4 py-3 bg-gray-100 text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-pre:bg-gray-800 prose-pre:text-gray-100 prose-code:text-indigo-600 prose-code:before:content-[''] prose-code:after:content-['']">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>

        {/* Artifact buttons for code blocks */}
        {codeBlocks.length > 0 && onOpenArtifact && (
          <div className="mt-2 flex flex-wrap gap-2 not-prose">
            {codeBlocks.map((block, i) => (
              <button
                key={i}
                onClick={() => handleOpenCodeBlock(block, i)}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
              >
                <Code size={12} />
                Artifactで開く
                {codeBlocks.length > 1 && (
                  <span className="text-indigo-400">
                    ({block.language})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingMessage({
  text,
  isFinished,
}: {
  text?: string;
  isFinished?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex justify-start mb-3 gap-2">
      <div className="w-8" />
      <div className="max-w-[75%]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 transition-colors"
        >
          {isFinished ? (
            <CheckCircle size={12} />
          ) : (
            <Loader2 size={12} className="animate-spin" />
          )}
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Thinking...
        </button>
        {expanded && text && (
          <div className="mt-1 px-3 py-2 rounded-lg bg-purple-50 border border-purple-100 text-xs text-purple-800 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {text}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallMessage({ chunk }: { chunk: AgentChunk }) {
  const [expanded, setExpanded] = useState(false);
  const isPending = chunk.type === "tool_call_pending";

  return (
    <div className="flex justify-start mb-2 gap-2">
      <div className="w-8" />
      <div className="max-w-[75%]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          {isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Wrench size={12} />
          )}
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {chunk.tool_name || "tool_call"}
        </button>
        {expanded && chunk.tool_arguments && (
          <pre className="mt-1 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100 text-xs overflow-x-auto max-h-48 overflow-y-auto">
            {chunk.tool_arguments}
          </pre>
        )}
      </div>
    </div>
  );
}

function ToolResultMessage({ chunk }: { chunk: AgentChunk }) {
  const [expanded, setExpanded] = useState(false);
  const text = chunk.tool_result || chunk.result || chunk.text || "";

  return (
    <div className="flex justify-start mb-2 gap-2">
      <div className="w-8" />
      <div className="max-w-[75%]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-600 transition-colors"
        >
          <CheckCircle size={12} />
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Tool Result
        </button>
        {expanded && text && (
          <pre className="mt-1 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs overflow-x-auto max-h-48 overflow-y-auto">
            {text}
          </pre>
        )}
      </div>
    </div>
  );
}

function UsageMessage({ chunk }: { chunk: AgentChunk }) {
  return (
    <div className="flex justify-center mb-3">
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-50 border border-gray-200 text-[10px] text-gray-400">
        <Coins size={10} />
        {chunk.total_tokens?.toLocaleString()} tokens
        {chunk.total_cost != null && (
          <span className="ml-1">${chunk.total_cost.toFixed(4)}</span>
        )}
      </div>
    </div>
  );
}
