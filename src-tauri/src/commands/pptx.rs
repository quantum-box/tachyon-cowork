use serde::Serialize;
use std::io::Read;

#[derive(Serialize)]
pub struct PptxMetadata {
    pub slide_count: usize,
    pub title: Option<String>,
    pub slides: Vec<SlideInfo>,
}

#[derive(Serialize)]
pub struct SlideInfo {
    pub index: usize,
    pub title: Option<String>,
    pub text_content: String,
}

#[tauri::command]
pub async fn read_pptx_metadata(path: String) -> Result<PptxMetadata, String> {
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut slides = Vec::new();
    let mut slide_index = 1;

    loop {
        let slide_path = format!("ppt/slides/slide{}.xml", slide_index);
        match archive.by_name(&slide_path) {
            Ok(mut entry) => {
                let mut content = String::new();
                entry
                    .read_to_string(&mut content)
                    .map_err(|e| e.to_string())?;
                let text = extract_text_from_slide_xml(&content);
                let title = extract_title_from_slide_xml(&content);
                slides.push(SlideInfo {
                    index: slide_index,
                    title,
                    text_content: text,
                });
                slide_index += 1;
            }
            Err(_) => break,
        }
    }

    Ok(PptxMetadata {
        slide_count: slides.len(),
        title: slides.first().and_then(|s| s.title.clone()),
        slides,
    })
}

fn extract_text_from_slide_xml(xml: &str) -> String {
    let mut text_parts = Vec::new();

    // Find text between <a:t> tags (no attributes)
    let mut remaining = xml;
    while let Some(start) = remaining.find("<a:t>") {
        let after_tag = &remaining[start + 5..];
        if let Some(end) = after_tag.find("</a:t>") {
            text_parts.push(after_tag[..end].to_string());
            remaining = &after_tag[end + 6..];
        } else {
            break;
        }
    }

    // Also handle <a:t ...> with attributes
    remaining = xml;
    while let Some(start) = remaining.find("<a:t ") {
        let after_tag_start = &remaining[start..];
        if let Some(close_bracket) = after_tag_start.find('>') {
            let after_tag = &after_tag_start[close_bracket + 1..];
            if let Some(end) = after_tag.find("</a:t>") {
                text_parts.push(after_tag[..end].to_string());
                remaining = &after_tag[end + 6..];
            } else {
                break;
            }
        } else {
            break;
        }
    }

    text_parts.join(" ")
}

fn extract_title_from_slide_xml(xml: &str) -> Option<String> {
    // Look for title shape (ph type="title" or ph type="ctrTitle")
    if xml.contains("type=\"title\"") || xml.contains("type=\"ctrTitle\"") {
        let text = extract_text_from_slide_xml(xml);
        if !text.is_empty() {
            return Some(
                text.split_whitespace()
                    .take(20)
                    .collect::<Vec<_>>()
                    .join(" "),
            );
        }
    }
    None
}
