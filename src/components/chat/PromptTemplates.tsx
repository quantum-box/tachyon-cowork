import { useState } from "react";
import { Lightbulb, Mail, Languages, FileText, Code, ChevronDown, ChevronUp } from "lucide-react";

export type PromptTemplate = {
  icon: typeof Lightbulb;
  label: string;
  prompt: string;
  category: string;
};

const TEMPLATES: PromptTemplate[] = [
  {
    icon: FileText,
    label: "日報作成",
    prompt:
      "以下の作業ログから、そのまま提出できる日報を日本語で作成してください。\n出力形式:\n- 本日の実績\n- 完了した作業\n- 課題/懸念\n- 明日の予定\n- 関係者への共有事項\n\n作業ログ:\n",
    category: "業務",
  },
  {
    icon: FileText,
    label: "議事録整形",
    prompt:
      "以下の会議メモを実務で使える議事録に整形してください。\n出力形式:\n- 会議名\n- 日時\n- 参加者\n- 議題\n- 決定事項\n- 保留事項\n- アクションアイテム（担当者・期限つき）\n- 次回までの宿題\n\n会議メモ:\n",
    category: "業務",
  },
  {
    icon: Code,
    label: "コード相談",
    prompt:
      "添付したローカルコードを前提に相談します。\n以下の形式で回答してください。\n1. 結論\n2. 根拠（ファイル名・該当箇所）\n3. 修正案\n4. 追加で確認すべき点\n\n相談内容:\n",
    category: "業務",
  },
  {
    icon: FileText,
    label: "要約して",
    prompt: "以下の内容を簡潔に要約してください:\n\n",
    category: "文書",
  },
  {
    icon: Mail,
    label: "メール作成",
    prompt: "以下の内容でビジネスメールを作成してください。件名も含めてください。\n\n目的: ",
    category: "文書",
  },
  {
    icon: Languages,
    label: "英語に翻訳",
    prompt: "以下の日本語を自然な英語に翻訳してください:\n\n",
    category: "翻訳",
  },
  {
    icon: Languages,
    label: "日本語に翻訳",
    prompt: "以下の英語を自然な日本語に翻訳してください:\n\n",
    category: "翻訳",
  },
  {
    icon: Code,
    label: "コードレビュー",
    prompt:
      "以下のコードをレビューしてください。バグ、改善点、セキュリティの問題があれば指摘してください:\n\n```\n",
    category: "開発",
  },
  {
    icon: Code,
    label: "コード説明",
    prompt: "以下のコードが何をしているか、わかりやすく説明してください:\n\n```\n",
    category: "開発",
  },
  {
    icon: Lightbulb,
    label: "ブレスト",
    prompt:
      "以下のテーマについてブレインストーミングしてください。多角的な視点でアイデアを出してください:\n\nテーマ: ",
    category: "アイデア",
  },
  {
    icon: FileText,
    label: "議事録作成",
    prompt:
      "以下のミーティングメモを議事録形式に整形してください。決定事項とアクションアイテムを明確にしてください:\n\n",
    category: "文書",
  },
];

type Props = {
  onSelect: (prompt: string) => void;
  visible: boolean;
};

export function PromptTemplates({ onSelect, visible }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!visible) return null;

  const displayed = expanded ? TEMPLATES : TEMPLATES.slice(0, 6);

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2">
      {displayed.map((t) => (
        <button
          key={t.label}
          type="button"
          onClick={() => onSelect(t.prompt)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all duration-150"
        >
          <t.icon size={12} />
          {t.label}
        </button>
      ))}
      {TEMPLATES.length > 6 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp size={12} />
              閉じる
            </>
          ) : (
            <>
              <ChevronDown size={12} />
              もっと見る
            </>
          )}
        </button>
      )}
    </div>
  );
}
