import { useState, useCallback } from "react";
import { FileSpreadsheet } from "lucide-react";
import type { ExcelData, CellValue } from "../../lib/types";

const INITIAL_ROW_LIMIT = 100;
const LOAD_MORE_STEP = 100;

type Props = {
  data: ExcelData;
};

export function ExcelPreview({ data }: Props) {
  const [activeSheet, setActiveSheet] = useState(0);
  const [rowLimit, setRowLimit] = useState(INITIAL_ROW_LIMIT);

  const sheet = data.sheets[activeSheet];

  const handleLoadMore = useCallback(() => {
    setRowLimit((prev) => prev + LOAD_MORE_STEP);
  }, []);

  const handleSheetChange = useCallback((index: number) => {
    setActiveSheet(index);
    setRowLimit(INITIAL_ROW_LIMIT);
  }, []);

  if (!sheet) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        データがありません
      </div>
    );
  }

  const visibleRows = sheet.rows.slice(0, rowLimit);
  const hasMore = sheet.rows.length > rowLimit;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <FileSpreadsheet size={16} className="text-emerald-600" />
        <span className="text-sm font-medium text-gray-700">
          Excel ({sheet.row_count} 行 x {sheet.col_count} 列)
        </span>
      </div>

      {/* Sheet tabs */}
      {data.sheets.length > 1 && (
        <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
          {data.sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => handleSheetChange(i)}
              className={`px-3 py-1.5 text-xs border-r border-gray-200 whitespace-nowrap transition-colors ${
                i === activeSheet
                  ? "bg-white text-emerald-700 font-medium"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable table */}
      <div className="overflow-auto max-h-[400px]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100">
              <th className="px-2 py-1.5 text-center text-gray-400 font-normal border-r border-b border-gray-200 w-10">
                #
              </th>
              {Array.from({ length: sheet.col_count }, (_, i) => (
                <th
                  key={i}
                  className="px-2 py-1.5 text-left font-medium text-gray-600 border-r border-b border-gray-200 min-w-[80px]"
                >
                  {columnLabel(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
              >
                <td className="px-2 py-1 text-center text-gray-400 border-r border-b border-gray-100 tabular-nums">
                  {rowIdx + 1}
                </td>
                {Array.from({ length: sheet.col_count }, (_, colIdx) => {
                  const cell = row[colIdx];
                  return (
                    <td
                      key={colIdx}
                      className={`px-2 py-1 border-r border-b border-gray-100 ${cellAlignment(cell)}`}
                    >
                      {renderCell(cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center py-2 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleLoadMore}
            className="px-4 py-1.5 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
          >
            さらに読み込む ({sheet.rows.length - rowLimit} 行)
          </button>
        </div>
      )}
    </div>
  );
}

function columnLabel(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

function cellAlignment(cell: CellValue | undefined): string {
  if (!cell || cell.type === "Empty") return "text-left";
  if (cell.type === "Number") return "text-right tabular-nums";
  if (cell.type === "Bool") return "text-center";
  return "text-left";
}

function renderCell(cell: CellValue | undefined): string {
  if (!cell || cell.type === "Empty") return "";
  switch (cell.type) {
    case "String":
      return cell.value;
    case "Number":
      return formatNumber(cell.value);
    case "Bool":
      return cell.value ? "\u2713" : "\u2717";
    case "Error":
      return `#${cell.value}`;
    default:
      return "";
  }
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
