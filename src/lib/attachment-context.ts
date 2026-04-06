import { invoke } from "@tauri-apps/api/core";
import type {
  DocxData,
  ExcelData,
  FileAttachment,
  InlineAttachment,
  PdfData,
  PptxMetadata,
} from "./types";
import { isTauri } from "./tauri-bridge";

const MAX_TEXT_CHARS_PER_FILE = 12_000;
const MAX_TOTAL_CONTEXT_CHARS = 36_000;

const CODE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "html",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "mjs",
  "md",
  "php",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
]);

const OFFICE_EXTENSIONS = new Set(["csv", "docx", "pdf", "pptx", "xlsx"]);

function getExtension(name: string): string {
  const ext = name.split(".").pop();
  return ext ? ext.toLowerCase() : "";
}

function decodeText(data?: Uint8Array): string | null {
  if (!data) return null;
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(data);
  } catch {
    return null;
  }
}

function truncate(text: string, maxChars = MAX_TEXT_CHARS_PER_FILE): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...(truncated)` : text;
}

function looksLikeText(file: FileAttachment): boolean {
  if (file.type.startsWith("text/")) return true;
  const ext = getExtension(file.name);
  return CODE_EXTENSIONS.has(ext);
}

function isCodeFile(file: FileAttachment): boolean {
  return CODE_EXTENSIONS.has(getExtension(file.name));
}

function isOfficeFile(file: FileAttachment): boolean {
  return OFFICE_EXTENSIONS.has(getExtension(file.name));
}

function formatExcel(data: ExcelData): string {
  return data.sheets
    .map((sheet) => {
      const rows = sheet.rows
        .slice(0, 30)
        .map((row) =>
          row
            .map((cell) => {
              if (cell.type === "String" || cell.type === "Error") return cell.value;
              if (cell.type === "Number") return String(cell.value);
              if (cell.type === "Bool") return cell.value ? "true" : "false";
              return "";
            })
            .join(" | "),
        )
        .join("\n");
      return `Sheet: ${sheet.name}\nRows: ${sheet.row_count}, Cols: ${sheet.col_count}\n${rows}`;
    })
    .join("\n\n");
}

function formatPdf(data: PdfData): string {
  return data.pages
    .slice(0, 20)
    .map((page) => `Page ${page.page_number}\n${page.text}`)
    .join("\n\n");
}

function formatDocx(data: DocxData): string {
  const paragraphs = data.paragraphs
    .slice(0, 120)
    .map((p) => (p.style ? `[${p.style}] ${p.text}` : p.text))
    .join("\n");
  const tables = data.tables
    .slice(0, 5)
    .map((table, index) =>
      [`Table ${index + 1}`, ...table.rows.slice(0, 20).map((row) => row.join(" | "))].join("\n"),
    )
    .join("\n\n");
  return [paragraphs, tables].filter(Boolean).join("\n\n");
}

function formatPptx(data: PptxMetadata): string {
  return data.slides
    .slice(0, 30)
    .map(
      (slide) =>
        `Slide ${slide.index}${slide.title ? `: ${slide.title}` : ""}\n${slide.text_content}`,
    )
    .join("\n\n");
}

type PreparedMessage = {
  task: string;
  attachments?: InlineAttachment[];
  warnings: string[];
};

export async function buildAttachmentAwareMessage(
  message: string,
  files: FileAttachment[],
  attachments: InlineAttachment[],
): Promise<PreparedMessage> {
  if (files.length === 0) {
    return { task: message.trim() || "添付ファイルを確認してください", attachments, warnings: [] };
  }

  const warnings: string[] = [];
  const extractedSections: string[] = [];
  const passthroughAttachments: InlineAttachment[] = [];
  let consumedChars = 0;
  let hasCodeContext = false;

  for (const [index, file] of files.entries()) {
    const ext = getExtension(file.name);
    const heading = `添付ファイル ${index + 1}: ${file.name}${file.path ? `\nPath: ${file.path}` : ""}`;

    if (file.isVision) {
      passthroughAttachments.push(attachments[index]);
      continue;
    }

    if (looksLikeText(file)) {
      const text = decodeText(file.data);
      if (text) {
        const snippet = truncate(text);
        consumedChars += snippet.length;
        extractedSections.push(`${heading}\n\`\`\`${ext || "text"}\n${snippet}\n\`\`\``);
        hasCodeContext ||= isCodeFile(file);
        if (consumedChars >= MAX_TOTAL_CONTEXT_CHARS) {
          warnings.push("添付ファイルのテキスト量が多いため、一部を省略しました。");
          break;
        }
        continue;
      }
    }

    if (isTauri() && file.path && isOfficeFile(file)) {
      try {
        let extracted = "";
        switch (ext) {
          case "csv":
            extracted = truncate(decodeText(file.data) ?? "");
            break;
          case "pdf":
            extracted = truncate(formatPdf(await invoke<PdfData>("read_pdf", { path: file.path })));
            break;
          case "docx":
            extracted = truncate(
              formatDocx(await invoke<DocxData>("read_docx", { path: file.path })),
            );
            break;
          case "xlsx":
            extracted = truncate(
              formatExcel(await invoke<ExcelData>("read_excel", { path: file.path })),
            );
            break;
          case "pptx":
            extracted = truncate(
              formatPptx(await invoke<PptxMetadata>("read_pptx_metadata", { path: file.path })),
            );
            break;
          default:
            break;
        }
        if (extracted) {
          consumedChars += extracted.length;
          extractedSections.push(`${heading}\n${extracted}`);
          if (consumedChars >= MAX_TOTAL_CONTEXT_CHARS) {
            warnings.push("添付ファイルの抽出結果が長いため、一部を省略しました。");
            break;
          }
          continue;
        }
      } catch (error) {
        console.error(`Failed to extract local file context for ${file.name}:`, error);
        warnings.push(
          `「${file.name}」のローカル解析に失敗したため、元ファイルを添付したまま送信します。`,
        );
      }
    }

    passthroughAttachments.push(attachments[index]);
  }

  if (extractedSections.length === 0) {
    return {
      task: message.trim() || "添付ファイルを確認してください",
      attachments: passthroughAttachments.length > 0 ? passthroughAttachments : undefined,
      warnings,
    };
  }

  const guidance = hasCodeContext
    ? [
        "以下はローカル添付ファイルから抽出したコード/文書です。",
        "コード相談として扱い、結論・根拠・修正案・追加確認点の順で回答してください。",
        "必要なら記載した Path を使ってローカルツールで追加確認してください。",
      ].join("\n")
    : [
        "以下はローカル添付ファイルから抽出した内容です。",
        "添付内容を優先して読み取り、情報が不足する場合は不足点を明示してください。",
      ].join("\n");

  const task = [
    guidance,
    "",
    ...extractedSections,
    "",
    "ユーザー依頼:",
    message.trim() || "添付内容を整理してください。",
  ].join("\n");
  const warningSection = warnings.length > 0 ? `\n\n注意:\n- ${warnings.join("\n- ")}` : "";

  return {
    task: `${task}${warningSection}`,
    attachments: passthroughAttachments.length > 0 ? passthroughAttachments : undefined,
    warnings,
  };
}
