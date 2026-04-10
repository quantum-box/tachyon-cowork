import type {
  ExcelData,
  WriteExcelRequest,
  PptxMetadata,
  PdfData,
  DocxData,
  ExecuteCodeRequest,
  ExecuteCodeResult,
  GenerateFileRequest,
  GenerateFileResult,
  WorkspaceFile,
} from "../lib/types";

const isTauri = () => "__TAURI__" in window;

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export function useTauriCommands() {
  const readExcel = async (path: string): Promise<ExcelData | null> => {
    if (!isTauri()) return null;
    return tauriInvoke<ExcelData>("read_excel", { path });
  };

  const writeExcel = async (
    data: WriteExcelRequest,
  ): Promise<number[] | null> => {
    if (!isTauri()) return null;
    return tauriInvoke<number[]>("write_excel", { data });
  };

  const saveExcelToFile = async (
    path: string,
    data: WriteExcelRequest,
  ): Promise<string | null> => {
    if (!isTauri()) return null;
    return tauriInvoke<string>("save_excel_to_file", { path, data });
  };

  const readPptxMetadata = async (
    path: string,
  ): Promise<PptxMetadata | null> => {
    if (!isTauri()) return null;
    return tauriInvoke<PptxMetadata>("read_pptx_metadata", { path });
  };

  const readPdf = async (path: string): Promise<PdfData | null> => {
    if (!isTauri()) return null;
    return tauriInvoke<PdfData>("read_pdf", { path });
  };

  const readDocx = async (path: string): Promise<DocxData | null> => {
    if (!isTauri()) return null;
    return tauriInvoke<DocxData>("read_docx", { path });
  };

  const executeCode = async (
    request: ExecuteCodeRequest,
  ): Promise<ExecuteCodeResult | null> => {
    if (!isTauri()) return null;
    return tauriInvoke<ExecuteCodeResult>("execute_code", { request });
  };

  const generateFile = async (
    request: GenerateFileRequest,
  ): Promise<GenerateFileResult | null> => {
    if (!isTauri()) return null;
    return tauriInvoke<GenerateFileResult>("generate_file", { request });
  };

  const listWorkspaceFiles = async (
    workspaceId: string,
  ): Promise<WorkspaceFile[] | null> => {
    if (!isTauri()) return null;
    return tauriInvoke<WorkspaceFile[]>("list_workspace_files", { workspaceId });
  };

  const readWorkspaceFile = async (
    workspaceId: string,
    filename: string,
  ): Promise<number[] | null> => {
    if (!isTauri()) return null;
    return tauriInvoke<number[]>("read_workspace_file", { workspaceId, filename });
  };

  const cleanupWorkspace = async (workspaceId: string): Promise<void> => {
    if (!isTauri()) return;
    await tauriInvoke("cleanup_workspace", { workspaceId });
  };

  const cleanupStaleWorkspaces = async (): Promise<number | null> => {
    if (!isTauri()) return null;
    return tauriInvoke<number>("cleanup_stale_workspaces");
  };

  return {
    readExcel,
    writeExcel,
    saveExcelToFile,
    readPptxMetadata,
    readPdf,
    readDocx,
    executeCode,
    generateFile,
    listWorkspaceFiles,
    readWorkspaceFile,
    cleanupWorkspace,
    cleanupStaleWorkspaces,
  };
}
