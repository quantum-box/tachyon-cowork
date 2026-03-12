use calamine::{open_workbook, Data, Reader, Xlsx};
use rust_xlsxwriter::Workbook;
use serde::{Deserialize, Serialize};
use std::io::BufReader;

#[derive(Serialize)]
pub struct ExcelData {
    pub sheets: Vec<SheetData>,
}

#[derive(Serialize)]
pub struct SheetData {
    pub name: String,
    pub rows: Vec<Vec<CellValue>>,
    pub row_count: usize,
    pub col_count: usize,
}

#[derive(Serialize)]
#[serde(tag = "type", content = "value")]
pub enum CellValue {
    Empty,
    String(String),
    Number(f64),
    Bool(bool),
    Error(String),
}

#[tauri::command]
pub async fn read_excel(path: String) -> Result<ExcelData, String> {
    let mut workbook: Xlsx<BufReader<std::fs::File>> =
        open_workbook(&path).map_err(|e: calamine::XlsxError| e.to_string())?;
    let sheet_names = workbook.sheet_names().to_vec();
    let mut sheets = Vec::new();

    for name in sheet_names {
        if let Ok(range) = workbook.worksheet_range(&name) {
            let mut rows = Vec::new();
            let mut max_col = 0usize;
            for row in range.rows() {
                let cells: Vec<CellValue> = row
                    .iter()
                    .map(|cell: &Data| match cell {
                        Data::Empty => CellValue::Empty,
                        Data::String(s) => CellValue::String(s.clone()),
                        Data::Float(f) => CellValue::Number(*f),
                        Data::Int(i) => CellValue::Number(*i as f64),
                        Data::Bool(b) => CellValue::Bool(*b),
                        Data::Error(e) => CellValue::Error(format!("{:?}", e)),
                        Data::DateTime(dt) => CellValue::String(format!("{}", dt)),
                        Data::DateTimeIso(s) => CellValue::String(s.clone()),
                        Data::DurationIso(s) => CellValue::String(s.clone()),
                    })
                    .collect();
                if cells.len() > max_col {
                    max_col = cells.len();
                }
                rows.push(cells);
            }
            sheets.push(SheetData {
                name,
                row_count: rows.len(),
                col_count: max_col,
                rows,
            });
        }
    }

    Ok(ExcelData { sheets })
}

#[derive(Deserialize)]
pub struct WriteExcelRequest {
    pub sheets: Vec<WriteSheetData>,
}

#[derive(Deserialize)]
pub struct WriteSheetData {
    pub name: String,
    pub headers: Option<Vec<String>>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub column_widths: Option<Vec<f64>>,
}

#[tauri::command]
pub async fn write_excel(data: WriteExcelRequest) -> Result<Vec<u8>, String> {
    let mut workbook = Workbook::new();
    let header_format = rust_xlsxwriter::Format::new()
        .set_bold()
        .set_background_color(rust_xlsxwriter::Color::RGB(0xD9E1F2));

    for sheet_data in &data.sheets {
        let worksheet = workbook.add_worksheet();
        worksheet
            .set_name(&sheet_data.name)
            .map_err(|e| e.to_string())?;

        let mut start_row = 0u32;

        if let Some(headers) = &sheet_data.headers {
            for (col, header) in headers.iter().enumerate() {
                worksheet
                    .write_string_with_format(0, col as u16, header, &header_format)
                    .map_err(|e| e.to_string())?;
            }
            start_row = 1;
        }

        if let Some(widths) = &sheet_data.column_widths {
            for (col, width) in widths.iter().enumerate() {
                worksheet
                    .set_column_width(col as u16, *width)
                    .map_err(|e| e.to_string())?;
            }
        }

        for (row_idx, row) in sheet_data.rows.iter().enumerate() {
            for (col_idx, cell) in row.iter().enumerate() {
                let r = start_row + row_idx as u32;
                let c = col_idx as u16;
                match cell {
                    serde_json::Value::String(s) => {
                        worksheet.write_string(r, c, s).map_err(|e| e.to_string())?;
                    }
                    serde_json::Value::Number(n) => {
                        if let Some(f) = n.as_f64() {
                            worksheet.write_number(r, c, f).map_err(|e| e.to_string())?;
                        }
                    }
                    serde_json::Value::Bool(b) => {
                        worksheet
                            .write_boolean(r, c, *b)
                            .map_err(|e| e.to_string())?;
                    }
                    serde_json::Value::Null => {}
                    _ => {
                        worksheet
                            .write_string(r, c, cell.to_string())
                            .map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }

    let buf = workbook.save_to_buffer().map_err(|e| e.to_string())?;
    Ok(buf)
}

#[tauri::command]
pub async fn save_excel_to_file(path: String, data: WriteExcelRequest) -> Result<String, String> {
    let buf = write_excel(data).await?;
    std::fs::write(&path, &buf).map_err(|e| e.to_string())?;
    Ok(path)
}
