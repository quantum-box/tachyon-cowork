use serde::{Deserialize, Serialize};
use serde_json::json;

use super::{BuiltinAppInfo, BuiltinToolDef};

pub fn app_info() -> BuiltinAppInfo {
    BuiltinAppInfo {
        id: "web_search".to_string(),
        name: "Web Search".to_string(),
        description: "Web検索とWebページ取得ツール".to_string(),
        tools: vec![
            BuiltinToolDef {
                name: "web_search".to_string(),
                description: "DuckDuckGoでWeb検索を行い、結果を返す".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "検索クエリ" },
                        "max_results": {
                            "type": "integer",
                            "description": "最大結果数（デフォルト: 10）"
                        }
                    },
                    "required": ["query"]
                }),
            },
            BuiltinToolDef {
                name: "fetch_webpage".to_string(),
                description: "URLからWebページのテキストコンテンツを取得する".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "取得するURL" },
                        "max_length": {
                            "type": "integer",
                            "description": "最大文字数（デフォルト: 50000）"
                        }
                    },
                    "required": ["url"]
                }),
            },
        ],
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}

pub async fn call_tool(name: &str, args: serde_json::Value) -> Result<serde_json::Value, String> {
    match name {
        "web_search" => {
            let query = get_str(&args, "query")?;
            let max_results = args
                .get("max_results")
                .and_then(|v| v.as_u64())
                .unwrap_or(10) as usize;
            let results = search_ddg(&query, max_results).await?;
            serde_json::to_value(&results).map_err(|e| e.to_string())
        }
        "fetch_webpage" => {
            let url = get_str(&args, "url")?;
            let max_length = args
                .get("max_length")
                .and_then(|v| v.as_u64())
                .unwrap_or(50_000) as usize;
            let text = fetch_page(&url, max_length).await?;
            Ok(json!({ "url": url, "content": text }))
        }
        _ => Err(format!("Unknown web_search tool: {}", name)),
    }
}

async fn search_ddg(query: &str, max_results: usize) -> Result<Vec<SearchResult>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post("https://html.duckduckgo.com/html/")
        .form(&[("q", query)])
        .send()
        .await
        .map_err(|e| format!("Search request failed: {}", e))?;

    let html = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let mut results = Vec::new();
    let mut remaining = html.as_str();

    // Parse DuckDuckGo HTML results
    while let Some(pos) = remaining.find("class=\"result__a\"") {
        let block = &remaining[pos..];

        // Extract href
        let href = extract_attr(block, "href");

        // Extract title text between > and </a>
        let title = if let Some(tag_close) = block.find('>') {
            let after = &block[tag_close + 1..];
            if let Some(end) = after.find("</a>") {
                Some(strip_html(&after[..end]))
            } else {
                None
            }
        } else {
            None
        };

        // Extract snippet
        let snippet = if let Some(sp) = block.find("class=\"result__snippet\"") {
            let sp_block = &block[sp..];
            if let Some(tag_close) = sp_block.find('>') {
                let after = &sp_block[tag_close + 1..];
                // End at </a> or </td> or next result
                let end_pos = after
                    .find("</a>")
                    .or_else(|| after.find("</td>"))
                    .unwrap_or(after.len().min(500));
                Some(strip_html(&after[..end_pos]))
            } else {
                None
            }
        } else {
            None
        };

        if let (Some(url), Some(title)) = (href, title) {
            if !title.is_empty() && !url.is_empty() {
                // DuckDuckGo wraps URLs in a redirect; extract the actual URL
                let actual_url = extract_ddg_url(&url);
                results.push(SearchResult {
                    title,
                    url: actual_url,
                    snippet: snippet.unwrap_or_default(),
                });
            }
        }

        remaining = &remaining[pos + 17..]; // advance past "class=\"result__a\""
        if results.len() >= max_results {
            break;
        }
    }

    Ok(results)
}

/// DuckDuckGo HTML wraps URLs like //duckduckgo.com/l/?uddg=ACTUAL_URL&...
fn extract_ddg_url(url: &str) -> String {
    if let Some(start) = url.find("uddg=") {
        let after = &url[start + 5..];
        let end = after.find('&').unwrap_or(after.len());
        let encoded = &after[..end];
        urlencoding::decode(encoded)
            .map(|s| s.into_owned())
            .unwrap_or_else(|_| encoded.to_string())
    } else if url.starts_with("//") {
        format!("https:{}", url)
    } else {
        url.to_string()
    }
}

fn extract_attr(html: &str, attr: &str) -> Option<String> {
    let pattern = format!("{}=\"", attr);
    if let Some(start) = html.find(&pattern) {
        let after = &html[start + pattern.len()..];
        if let Some(end) = after.find('"') {
            return Some(after[..end].to_string());
        }
    }
    None
}

async fn fetch_page(url: &str, max_length: usize) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let text = if content_type.contains("text/html") || content_type.contains("application/xhtml") {
        strip_html(&body)
    } else {
        body
    };

    if text.len() > max_length {
        Ok(format!("{}...(truncated)", &text[..max_length]))
    } else {
        Ok(text)
    }
}

/// Strip HTML tags and extract text content
fn strip_html(html: &str) -> String {
    let mut s = html.to_string();

    // Remove script blocks
    while let Some(start) = s.to_lowercase().find("<script") {
        let lower = s.to_lowercase();
        if let Some(end) = lower[start..].find("</script>") {
            let remove_end = start + end + 9;
            s = format!("{} {}", &s[..start], &s[remove_end..]);
        } else {
            break;
        }
    }

    // Remove style blocks
    while let Some(start) = s.to_lowercase().find("<style") {
        let lower = s.to_lowercase();
        if let Some(end) = lower[start..].find("</style>") {
            let remove_end = start + end + 8;
            s = format!("{} {}", &s[..start], &s[remove_end..]);
        } else {
            break;
        }
    }

    // Strip remaining tags
    let mut result = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                result.push(' ');
            }
            _ if !in_tag => result.push(c),
            _ => {}
        }
    }

    // Decode common HTML entities
    let result = result
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");

    // Collapse whitespace
    result.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn get_str(args: &serde_json::Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| format!("Missing '{}' argument", key))
}
