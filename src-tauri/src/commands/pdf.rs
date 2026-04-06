use lopdf::Document;
use serde::Serialize;

use crate::{project::ProjectManager, tools::path_validator};

#[derive(Serialize)]
pub struct PdfData {
    pub page_count: usize,
    pub pages: Vec<PdfPageData>,
    pub metadata: PdfMetadata,
}

#[derive(Serialize)]
pub struct PdfPageData {
    pub page_number: usize,
    pub text: String,
}

#[derive(Serialize)]
pub struct PdfMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub creator: Option<String>,
}

pub async fn read_pdf_impl(path: String) -> Result<PdfData, String> {
    let doc = Document::load(&path).map_err(|e| format!("Failed to open PDF: {}", e))?;

    let metadata = extract_metadata(&doc);

    let page_count = doc.get_pages().len();
    let mut pages = Vec::new();

    for page_num in 1..=page_count as u32 {
        let text = doc.extract_text(&[page_num]).unwrap_or_default();
        pages.push(PdfPageData {
            page_number: page_num as usize,
            text,
        });
    }

    Ok(PdfData {
        page_count,
        pages,
        metadata,
    })
}

#[tauri::command]
pub async fn read_pdf(
    project_manager: tauri::State<'_, ProjectManager>,
    path: String,
) -> Result<PdfData, String> {
    let project_root = project_manager
        .active_project_root()
        .await
        .ok_or("No active project selected")?;
    let path = path_validator::resolve_project_path(&project_root, &path, true)?
        .to_string_lossy()
        .to_string();
    read_pdf_impl(path).await
}

fn extract_metadata(doc: &Document) -> PdfMetadata {
    let get_info = |key: &[u8]| -> Option<String> {
        doc.trailer
            .get(b"Info")
            .ok()
            .and_then(|info| doc.dereference(info).ok())
            .and_then(|(_, obj)| obj.as_dict().ok())
            .and_then(|dict| dict.get(key).ok())
            .and_then(|obj| {
                if let Ok(cow) = obj.as_string() {
                    Some(cow.to_string())
                } else if let Ok(bytes) = obj.as_str() {
                    Some(String::from_utf8_lossy(bytes).to_string())
                } else {
                    None
                }
            })
    };

    PdfMetadata {
        title: get_info(b"Title"),
        author: get_info(b"Author"),
        subject: get_info(b"Subject"),
        creator: get_info(b"Creator"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires fixture file at /tmp/tachyon-test/test.pdf
    async fn test_read_pdf() {
        let result = read_pdf_impl("/tmp/tachyon-test/test.pdf".to_string()).await;
        assert!(result.is_ok(), "Failed to read PDF: {:?}", result.err());
        let data = result.unwrap();
        assert_eq!(data.page_count, 2);
        assert!(!data.pages[0].text.is_empty(), "Page 1 should have text");
        println!("PDF page_count: {}", data.page_count);
        println!(
            "Page 1 text: {:?}",
            &data.pages[0].text[..50.min(data.pages[0].text.len())]
        );
        println!(
            "Page 2 text: {:?}",
            &data.pages[1].text[..50.min(data.pages[1].text.len())]
        );
    }
}
