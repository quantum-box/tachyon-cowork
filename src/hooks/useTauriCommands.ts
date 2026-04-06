import { invoke } from "@tauri-apps/api/core";
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
} from "../lib/types";

const isTauri = () => "__TAURI__" in window;

export function useTauriCommands() {
  const readExcel = async (path: string): Promise<ExcelData | null> => {
    if (!isTauri()) return null;
    return invoke<ExcelData>("read_excel", { path });
  };

  const writeExcel = async (
    data: WriteExcelRequest,
  ): Promise<number[] | null> => {
    if (!isTauri()) return null;
    return invoke<number[]>("write_excel", { data });
  };

  const saveExcelToFile = async (
    path: string,
    data: WriteExcelRequest,
  ): Promise<string | null> => {
    if (!isTauri()) return null;
    return invoke<string>("save_excel_to_file", { path, data });
  };

  const readPptxMetadata = async (
    path: string,
  ): Promise<PptxMetadata | null> => {
    if (!isTauri()) return null;
    return invoke<PptxMetadata>("read_pptx_metadata", { path });
  };

  const readPdf = async (path: string): Promise<PdfData | null> => {
    if (!isTauri()) return null;
    return invoke<PdfData>("read_pdf", { path });
  };

  const readDocx = async (path: string): Promise<DocxData | null> => {
    if (!isTauri()) return null;
    return invoke<DocxData>("read_docx", { path });
  };

  const executeCode = async (
    request: ExecuteCodeRequest,
  ): Promise<ExecuteCodeResult | null> => {
    if (!isTauri()) return null;
    return invoke<ExecuteCodeResult>("execute_code", { request });
  };

  const generateFile = async (
    request: GenerateFileRequest,
  ): Promise<GenerateFileResult | null> => {
    if (!isTauri()) return null;
    return invoke<GenerateFileResult>("generate_file", { request });
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
  };
}
