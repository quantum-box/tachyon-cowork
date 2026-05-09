import {
  ArrowLeft,
  BookOpen,
  FileText,
  FolderOpen,
  Keyboard,
  MessageSquare,
  Mic,
  Search,
  Settings,
  Wrench,
} from "lucide-react";

type Props = {
  onBack: () => void;
  onOpenTools?: () => void;
  onOpenWorkFolders?: () => void;
};

const guideSections = [
  {
    icon: MessageSquare,
    title: "チャット",
    items: [
      "質問、調査、文章作成、コード相談をそのまま送信できます。",
      "添付ファイルは入力欄にドロップすると会話の文脈に入ります。",
      "直近の回答はコピー横の再生成アイコンからやり直せます。",
    ],
  },
  {
    icon: FolderOpen,
    title: "Workspace",
    items: [
      "作業ディレクトリを選ぶと、そのフォルダを前提に会話できます。",
      "`AGENTS.md` を保存すると Workspace 固有の指示として使われます。",
      "作業ディレクトリ一覧から、過去に使ったフォルダへ切り替えられます。",
    ],
  },
  {
    icon: Wrench,
    title: "ローカルツール",
    items: [
      "ファイル検索、整理、重複検出、容量分析をアプリ内で実行できます。",
      "MCP ツールが有効な場合、会話中からローカル操作を呼び出せます。",
      "オフライン時もローカルファイルツールは使えます。",
    ],
  },
  {
    icon: FileText,
    title: "Artifact と Canvas",
    items: [
      "生成されたコードやドキュメントは右側の Artifact で確認できます。",
      "HTML や JSX は Canvas でプレビューしながら調整できます。",
      "コードブロックは回答下のボタンから Artifact として開けます。",
    ],
  },
];

const quickTips = [
  { icon: Search, text: "会話検索はヘッダーの検索から開けます。" },
  { icon: Keyboard, text: "送信キーや表示テーマは設定で変更できます。" },
  { icon: Mic, text: "Realtime Voice を有効にすると音声入力を使えます。" },
  { icon: Settings, text: "MCP やモデル設定は設定パネルにまとまっています。" },
];

export function HelpPanel({ onBack, onOpenTools, onOpenWorkFolders }: Props) {
  return (
    <div className="flex h-full flex-col bg-transparent transition-colors duration-150">
      <div className="border-b border-stone-200/80 bg-white/55 px-4 py-3 backdrop-blur-md dark:border-stone-800/80 dark:bg-stone-950/25">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="notion-icon-button relative z-10 p-2"
            title="チャットに戻る"
          >
            <ArrowLeft size={18} />
          </button>
          <div
            className="titlebar-safe-header min-w-0 flex-1"
            data-tauri-drag-region
          >
            <div className="notion-label mb-1">Help</div>
            <h2 className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
              使い方
            </h2>
            <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
              Tachyon Cowork の基本操作と Workspace の考え方
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-5">
          <div className="mb-5 flex flex-col gap-3 border-b border-stone-200/70 pb-5 dark:border-stone-800/80 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-medium text-stone-500 dark:text-stone-400">
                <BookOpen size={14} />
                Product guide
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">
                会話から作業までを一つの流れで進める
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600 dark:text-stone-300">
                Workspace を選び、チャットで意図を伝え、必要に応じてローカルツールや
                Artifact を使って結果を確認します。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {onOpenWorkFolders && (
                <button
                  type="button"
                  onClick={onOpenWorkFolders}
                  className="notion-button px-3 py-2 text-xs font-medium"
                >
                  <FolderOpen size={14} />
                  Workspace
                </button>
              )}
              {onOpenTools && (
                <button
                  type="button"
                  onClick={onOpenTools}
                  className="notion-button notion-button-primary px-3 py-2 text-xs font-medium"
                >
                  <Wrench size={14} />
                  ツールを開く
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {guideSections.map((section) => {
              const Icon = section.icon;
              return (
                <section
                  key={section.title}
                  className="rounded-[18px] border border-stone-200/80 bg-white/72 p-4 dark:border-stone-800 dark:bg-stone-900/40"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300">
                      <Icon size={16} />
                    </div>
                    <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      {section.title}
                    </h3>
                  </div>
                  <ul className="space-y-2 text-xs leading-5 text-stone-600 dark:text-stone-300">
                    {section.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-stone-400 dark:bg-stone-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <section className="mt-5">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              便利な入口
            </h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {quickTips.map((tip) => {
                const Icon = tip.icon;
                return (
                  <div
                    key={tip.text}
                    className="flex items-center gap-2 rounded-xl border border-stone-200/70 bg-white/60 px-3 py-2 text-xs text-stone-600 dark:border-stone-800 dark:bg-stone-950/30 dark:text-stone-300"
                  >
                    <Icon size={14} className="shrink-0 text-stone-400" />
                    <span>{tip.text}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
