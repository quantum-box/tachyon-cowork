use quick_xml::events::Event;
use quick_xml::reader::Reader;
use serde::Serialize;
use std::io::Read;

#[derive(Serialize)]
pub struct DocxData {
    pub paragraphs: Vec<DocxParagraph>,
    pub tables: Vec<DocxTable>,
    pub metadata: DocxMetadata,
}

#[derive(Serialize)]
pub struct DocxParagraph {
    pub text: String,
    pub style: Option<String>,
}

#[derive(Serialize)]
pub struct DocxTable {
    pub rows: Vec<Vec<String>>,
}

#[derive(Serialize)]
pub struct DocxMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub description: Option<String>,
}

#[tauri::command]
pub async fn read_docx(path: String) -> Result<DocxData, String> {
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    // Read document.xml
    let document_xml = read_zip_entry(&mut archive, "word/document.xml")?;
    let (paragraphs, tables) = parse_document_xml(&document_xml);

    // Read core.xml for metadata
    let metadata = match read_zip_entry(&mut archive, "docProps/core.xml") {
        Ok(core_xml) => parse_core_xml(&core_xml),
        Err(_) => DocxMetadata {
            title: None,
            author: None,
            description: None,
        },
    };

    Ok(DocxData {
        paragraphs,
        tables,
        metadata,
    })
}

fn read_zip_entry(
    archive: &mut zip::ZipArchive<std::fs::File>,
    name: &str,
) -> Result<String, String> {
    let mut entry = archive.by_name(name).map_err(|e| e.to_string())?;
    let mut content = String::new();
    entry
        .read_to_string(&mut content)
        .map_err(|e| e.to_string())?;
    Ok(content)
}

fn parse_document_xml(xml: &str) -> (Vec<DocxParagraph>, Vec<DocxTable>) {
    let mut paragraphs = Vec::new();
    let mut tables = Vec::new();
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();

    let mut in_paragraph = false;
    let mut in_table = false;
    let mut in_table_row = false;
    let mut in_table_cell = false;
    let mut in_text = false;
    let _in_style = false;

    let mut current_text = String::new();
    let mut current_style: Option<String> = None;
    let mut current_row: Vec<String> = Vec::new();
    let mut current_cell_text = String::new();
    let mut current_table_rows: Vec<Vec<String>> = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                let local_name = e.local_name();
                let name_bytes = local_name.as_ref();
                match name_bytes {
                    b"p" if !in_table => {
                        in_paragraph = true;
                        current_text.clear();
                        current_style = None;
                    }
                    b"t" => {
                        in_text = true;
                    }
                    b"pStyle" => {
                        // Extract style value from val attribute
                        for attr in e.attributes().flatten() {
                            if attr.key.local_name().as_ref() == b"val" {
                                current_style = String::from_utf8(attr.value.to_vec()).ok();
                            }
                        }
                    }
                    b"tbl" => {
                        in_table = true;
                        current_table_rows.clear();
                    }
                    b"tr" if in_table => {
                        in_table_row = true;
                        current_row.clear();
                    }
                    b"tc" if in_table_row => {
                        in_table_cell = true;
                        current_cell_text.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_text {
                    let text = e.unescape().unwrap_or_default().to_string();
                    if in_table_cell {
                        current_cell_text.push_str(&text);
                    } else if in_paragraph {
                        current_text.push_str(&text);
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let local_name = e.local_name();
                let name_bytes = local_name.as_ref();
                match name_bytes {
                    b"p" if in_paragraph && !in_table => {
                        in_paragraph = false;
                        if !current_text.is_empty() {
                            paragraphs.push(DocxParagraph {
                                text: current_text.clone(),
                                style: current_style.clone(),
                            });
                        }
                    }
                    b"t" => {
                        in_text = false;
                    }
                    b"tc" if in_table_cell => {
                        in_table_cell = false;
                        current_row.push(current_cell_text.clone());
                    }
                    b"tr" if in_table_row => {
                        in_table_row = false;
                        current_table_rows.push(current_row.clone());
                    }
                    b"tbl" if in_table => {
                        in_table = false;
                        if !current_table_rows.is_empty() {
                            tables.push(DocxTable {
                                rows: current_table_rows.clone(),
                            });
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    (paragraphs, tables)
}

fn parse_core_xml(xml: &str) -> DocxMetadata {
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();

    let mut title = None;
    let mut author = None;
    let mut description = None;
    let mut current_tag = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                current_tag = name;
            }
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().unwrap_or_default().to_string();
                match current_tag.as_str() {
                    "title" => title = Some(text),
                    "creator" => author = Some(text),
                    "description" => description = Some(text),
                    _ => {}
                }
            }
            Ok(Event::End(_)) => {
                current_tag.clear();
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    DocxMetadata {
        title,
        author,
        description,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_read_docx() {
        let result = read_docx("/tmp/tachyon-test/test.docx".to_string()).await;
        assert!(result.is_ok(), "Failed to read DOCX: {:?}", result.err());
        let data = result.unwrap();
        assert!(!data.paragraphs.is_empty(), "Should have paragraphs");
        assert!(!data.tables.is_empty(), "Should have tables");
        println!("Paragraphs count: {}", data.paragraphs.len());
        for (i, p) in data.paragraphs.iter().enumerate() {
            println!(
                "  P{}: style={:?} text={:?}",
                i,
                p.style,
                &p.text[..50.min(p.text.len())]
            );
        }
        println!("Tables count: {}", data.tables.len());
        for (i, t) in data.tables.iter().enumerate() {
            println!("  T{}: {} rows", i, t.rows.len());
            for row in &t.rows {
                println!("    {:?}", row);
            }
        }
    }
}
