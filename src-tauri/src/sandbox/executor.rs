use base64::Engine;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

use super::SandboxManager;

const DEFAULT_TIMEOUT_SECS: u64 = 30;
const MAX_TIMEOUT_SECS: u64 = 300;
const MAX_OUTPUT_BYTES: usize = 10 * 1024 * 1024; // 10MB

#[derive(Deserialize)]
pub struct ExecuteCodeRequest {
    pub language: String,
    pub code: String,
    pub timeout_secs: Option<u64>,
}

#[derive(Serialize)]
pub struct ExecuteCodeResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub timed_out: bool,
    pub duration_ms: u64,
}

#[derive(Deserialize)]
pub struct GenerateFileRequest {
    pub file_type: String,
    pub data: serde_json::Value,
    pub output_path: Option<String>,
}

#[derive(Serialize)]
pub struct GenerateFileResult {
    pub file_bytes: Vec<u8>,
    pub file_name: String,
    pub saved_path: Option<String>,
}

/// Execute code in a sandboxed environment
pub async fn run_code(request: &ExecuteCodeRequest) -> Result<ExecuteCodeResult, String> {
    let timeout_secs = request
        .timeout_secs
        .unwrap_or(DEFAULT_TIMEOUT_SECS)
        .min(MAX_TIMEOUT_SECS);
    let timeout = Duration::from_secs(timeout_secs);

    let sandbox_name = format!("tachyon-exec-{}", uuid_simple());
    let manager = SandboxManager::new();
    let sb = manager
        .create_code_sandbox(&sandbox_name, &request.language)
        .await?;

    let start = Instant::now();

    // Build shell command based on language
    let shell_cmd = match request.language.as_str() {
        "python" => format!("python3 -c {}", shell_escape(&request.code)),
        "javascript" | "js" => format!("node -e {}", shell_escape(&request.code)),
        "shell" | "sh" | "bash" => request.code.clone(),
        _ => return Err(format!("Unsupported language: {}", request.language)),
    };

    // Execute with timeout using shell() which properly captures output
    let exec_result = tokio::time::timeout(timeout, sb.shell(&shell_cmd)).await;

    let duration_ms = start.elapsed().as_millis() as u64;

    let result = match exec_result {
        Ok(Ok(output)) => {
            let stdout = output
                .stdout()
                .map(|s| truncate_output(&s, MAX_OUTPUT_BYTES))
                .unwrap_or_default();
            let stderr = output
                .stderr()
                .map(|s| truncate_output(&s, MAX_OUTPUT_BYTES))
                .unwrap_or_default();
            ExecuteCodeResult {
                stdout,
                stderr,
                exit_code: output.status().code,
                timed_out: false,
                duration_ms,
            }
        }
        Ok(Err(e)) => ExecuteCodeResult {
            stdout: String::new(),
            stderr: format!("Execution error: {}", e),
            exit_code: -1,
            timed_out: false,
            duration_ms,
        },
        Err(_) => {
            // Timeout - try to stop the sandbox
            let _ = sb.stop().await;
            ExecuteCodeResult {
                stdout: String::new(),
                stderr: format!("Execution timed out after {}s", timeout_secs),
                exit_code: -1,
                timed_out: true,
                duration_ms,
            }
        }
    };

    // Clean up sandbox
    let _ = sb.stop().await;
    let _ = microsandbox::Sandbox::remove(&sandbox_name).await;

    Ok(result)
}

/// Generate a file (PDF/DOCX/PPTX) using Python libraries in sandbox
pub async fn generate_file(request: &GenerateFileRequest) -> Result<GenerateFileResult, String> {
    let sandbox_name = format!("tachyon-gen-{}", uuid_simple());
    let sb = SandboxManager::create_file_sandbox(&sandbox_name).await?;

    let _start = Instant::now();

    // Write the data as JSON for the Python script to consume
    let data_json = serde_json::to_string(&request.data).map_err(|e| e.to_string())?;
    sb.fs()
        .write("/tmp/data.json", &data_json)
        .await
        .map_err(|e| format!("Failed to write data: {}", e))?;

    // Generate the appropriate Python script
    let (script, output_filename) = generate_python_script(&request.file_type, &request.data)?;
    let output_path_in_sandbox = format!("/tmp/{}", output_filename);

    sb.fs()
        .write("/tmp/generate.py", &script)
        .await
        .map_err(|e| format!("Failed to write script: {}", e))?;

    // Install required packages if not using custom image (fallback mode)
    let pip_packages = match request.file_type.as_str() {
        "pdf" => "reportlab",
        "docx" => "python-docx",
        "pptx" => "python-pptx",
        _ => "",
    };
    if !pip_packages.is_empty() {
        // Try importing first; if it fails, pip install
        let check_cmd = format!(
            "python3 -c \"import {}\" 2>/dev/null || pip install --quiet {}",
            match request.file_type.as_str() {
                "pdf" => "reportlab",
                "docx" => "docx",
                "pptx" => "pptx",
                _ => "",
            },
            pip_packages,
        );
        let _ = sb.shell(&check_cmd).await;
    }

    // Execute the generation script
    let timeout = Duration::from_secs(120);
    let exec_result = tokio::time::timeout(timeout, sb.shell("python3 /tmp/generate.py"))
        .await
        .map_err(|_| "File generation timed out".to_string())?
        .map_err(|e| format!("Generation failed: {}", e))?;

    if exec_result.status().code != 0 {
        let stderr = exec_result.stderr().unwrap_or_default();
        let _ = sb.stop().await;
        let _ = microsandbox::Sandbox::remove(&sandbox_name).await;
        return Err(format!("Generation script failed: {}", stderr));
    }

    // Read the generated file as base64 (binary files can't be read as string)
    let b64_result = sb
        .shell(&format!(
            "python3 -c \"import base64; data=open('{}','rb').read(); print(base64.b64encode(data).decode())\"",
            output_path_in_sandbox
        ))
        .await
        .map_err(|e| format!("Failed to read generated file: {}", e))?;

    let b64_str = b64_result.stdout().unwrap_or_default().trim().to_string();

    let _ = sb.stop().await;
    let _ = microsandbox::Sandbox::remove(&sandbox_name).await;

    let file_bytes = base64::engine::general_purpose::STANDARD
        .decode(&b64_str)
        .map_err(|e| format!("Failed to decode file: {}", e))?;

    // Save to host filesystem if output_path is specified
    let saved_path = if let Some(ref path) = request.output_path {
        std::fs::write(path, &file_bytes).map_err(|e| e.to_string())?;
        Some(path.clone())
    } else {
        None
    };

    Ok(GenerateFileResult {
        file_bytes,
        file_name: output_filename,
        saved_path,
    })
}

fn generate_python_script(
    file_type: &str,
    data: &serde_json::Value,
) -> Result<(String, String), String> {
    match file_type {
        "pdf" => Ok((generate_pdf_script(data), "output.pdf".to_string())),
        "docx" => Ok((generate_docx_script(data), "output.docx".to_string())),
        "pptx" => Ok((generate_pptx_script(data), "output.pptx".to_string())),
        _ => Err(format!("Unsupported file type: {}", file_type)),
    }
}

fn generate_pdf_script(_data: &serde_json::Value) -> String {
    r#"
import json
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch

with open('/tmp/data.json', 'r') as f:
    data = json.load(f)

doc = SimpleDocTemplate('/tmp/output.pdf', pagesize=A4)
styles = getSampleStyleSheet()
story = []

title = data.get('title', 'Document')
story.append(Paragraph(title, styles['Title']))
story.append(Spacer(1, 0.5 * inch))

content = data.get('content', '')
for paragraph in content.split('\n'):
    if paragraph.strip():
        story.append(Paragraph(paragraph, styles['Normal']))
        story.append(Spacer(1, 0.2 * inch))

if 'sections' in data:
    for section in data['sections']:
        heading = section.get('heading', '')
        body = section.get('body', '')
        story.append(Paragraph(heading, styles['Heading2']))
        story.append(Spacer(1, 0.2 * inch))
        for para in body.split('\n'):
            if para.strip():
                story.append(Paragraph(para, styles['Normal']))
                story.append(Spacer(1, 0.1 * inch))

doc.build(story)
print('PDF generated successfully')
"#
    .to_string()
}

fn generate_docx_script(_data: &serde_json::Value) -> String {
    r#"
import json
from docx import Document
from docx.shared import Pt, Inches

with open('/tmp/data.json', 'r') as f:
    data = json.load(f)

doc = Document()

title = data.get('title', 'Document')
doc.add_heading(title, level=0)

content = data.get('content', '')
for paragraph in content.split('\n'):
    if paragraph.strip():
        doc.add_paragraph(paragraph)

if 'sections' in data:
    for section in data['sections']:
        heading = section.get('heading', '')
        body = section.get('body', '')
        level = section.get('level', 1)
        doc.add_heading(heading, level=level)
        for para in body.split('\n'):
            if para.strip():
                doc.add_paragraph(para)

if 'tables' in data:
    for table_data in data['tables']:
        headers = table_data.get('headers', [])
        rows = table_data.get('rows', [])
        if headers:
            table = doc.add_table(rows=1, cols=len(headers))
            table.style = 'Light Grid Accent 1'
            for i, header in enumerate(headers):
                table.rows[0].cells[i].text = str(header)
            for row_data in rows:
                row = table.add_row()
                for i, cell_data in enumerate(row_data):
                    if i < len(row.cells):
                        row.cells[i].text = str(cell_data)

doc.save('/tmp/output.docx')
print('DOCX generated successfully')
"#
    .to_string()
}

fn generate_pptx_script(_data: &serde_json::Value) -> String {
    r#"
import json
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN

with open('/tmp/data.json', 'r') as f:
    data = json.load(f)

prs = Presentation()

title = data.get('title', 'Presentation')
subtitle = data.get('subtitle', '')

# Title slide
slide_layout = prs.slide_layouts[0]
slide = prs.slides.add_slide(slide_layout)
slide.shapes.title.text = title
if subtitle and slide.placeholders[1]:
    slide.placeholders[1].text = subtitle

# Content slides
if 'slides' in data:
    for slide_data in data['slides']:
        slide_title = slide_data.get('title', '')
        content = slide_data.get('content', '')
        layout_idx = slide_data.get('layout', 1)

        if layout_idx < len(prs.slide_layouts):
            slide_layout = prs.slide_layouts[layout_idx]
        else:
            slide_layout = prs.slide_layouts[1]

        slide = prs.slides.add_slide(slide_layout)

        if slide.shapes.title:
            slide.shapes.title.text = slide_title

        if content and len(slide.placeholders) > 1:
            body = slide.placeholders[1]
            tf = body.text_frame
            tf.text = ''
            for i, line in enumerate(content.split('\n')):
                if i == 0:
                    tf.text = line
                else:
                    p = tf.add_paragraph()
                    p.text = line

        if 'bullets' in slide_data and len(slide.placeholders) > 1:
            body = slide.placeholders[1]
            tf = body.text_frame
            tf.text = ''
            for i, bullet in enumerate(slide_data['bullets']):
                if i == 0:
                    tf.text = bullet
                else:
                    p = tf.add_paragraph()
                    p.text = bullet
                    p.level = 0

prs.save('/tmp/output.pptx')
print('PPTX generated successfully')
"#
    .to_string()
}

fn shell_escape(s: &str) -> String {
    // Single-quote escape for shell: replace ' with '\''
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn truncate_output(s: &str, max_bytes: usize) -> String {
    if s.len() > max_bytes {
        format!(
            "{}... [truncated, {} bytes total]",
            &s[..max_bytes],
            s.len()
        )
    } else {
        s.to_string()
    }
}

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{:x}{:x}", ts.as_secs(), ts.subsec_nanos())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires microsandbox (msb) runtime
    async fn test_execute_python() {
        use microsandbox::Sandbox;

        let name = format!("test-py-{}", uuid_simple());

        // Test sandbox creation directly
        eprintln!("[test] Creating sandbox {}...", name);
        let _ = Sandbox::remove(&name).await;
        let sb = Sandbox::builder(&name)
            .image("python:3.12-slim")
            .memory(512_u32)
            .cpus(1_u8)
            .create()
            .await;

        match &sb {
            Ok(_) => eprintln!("[test] Sandbox created successfully"),
            Err(e) => {
                eprintln!("[test] Sandbox creation FAILED: {:?}", e);
                panic!("Sandbox creation failed: {:?}", e);
            }
        }
        let sb = sb.unwrap();

        // Test shell directly
        eprintln!("[test] Running shell...");
        let exec_result = sb.shell("python3 -c \"print('hello from sandbox')\"").await;

        match &exec_result {
            Ok(output) => {
                let stdout = output.stdout().unwrap_or_default();
                let stderr = output.stderr().unwrap_or_default();
                eprintln!("[test] stdout: {:?}", stdout);
                eprintln!("[test] stderr: {:?}", stderr);
                eprintln!("[test] exit_code: {}", output.status().code);
                assert_eq!(output.status().code, 0, "stderr: {}", stderr);
                assert!(stdout.contains("hello from sandbox"), "stdout: {}", stdout);
            }
            Err(e) => {
                eprintln!("[test] Exec FAILED: {:?}", e);
                panic!("Exec failed: {:?}", e);
            }
        }

        let _ = sb.stop().await;
        let _ = Sandbox::remove(&name).await;
    }

    #[tokio::test]
    #[ignore] // Requires microsandbox (msb) runtime
    async fn test_generate_pdf() {
        let request = GenerateFileRequest {
            file_type: "pdf".to_string(),
            data: serde_json::json!({
                "title": "Test PDF",
                "content": "This is a test paragraph.\nSecond paragraph here.",
                "sections": [
                    {"heading": "Section 1", "body": "Section 1 content."},
                ]
            }),
            output_path: Some("/tmp/tachyon-test/generated.pdf".to_string()),
        };
        let result = generate_file(&request).await;
        match &result {
            Ok(r) => {
                eprintln!("[test-gen-pdf] file_name: {}", r.file_name);
                eprintln!("[test-gen-pdf] file_bytes len: {}", r.file_bytes.len());
                eprintln!("[test-gen-pdf] saved_path: {:?}", r.saved_path);
            }
            Err(e) => eprintln!("[test-gen-pdf] Error: {}", e),
        }
        assert!(result.is_ok(), "Generate PDF failed: {:?}", result.err());
        let r = result.unwrap();
        assert!(
            !r.file_bytes.is_empty(),
            "Generated PDF should not be empty"
        );
        assert_eq!(r.file_name, "output.pdf");
        // Check saved file exists
        assert!(std::path::Path::new("/tmp/tachyon-test/generated.pdf").exists());
    }

    #[tokio::test]
    #[ignore] // Requires microsandbox (msb) runtime
    async fn test_execute_javascript() {
        let request = ExecuteCodeRequest {
            language: "javascript".to_string(),
            code: "console.log('hello from node'); console.log(1 + 2);".to_string(),
            timeout_secs: Some(60),
        };
        let result = run_code(&request).await;
        match &result {
            Ok(r) => {
                eprintln!("[test-js] stdout: {:?}", r.stdout);
                eprintln!("[test-js] stderr: {:?}", r.stderr);
                eprintln!("[test-js] exit_code: {}", r.exit_code);
                eprintln!("[test-js] duration_ms: {}", r.duration_ms);
            }
            Err(e) => eprintln!("[test-js] Error: {}", e),
        }
        assert!(result.is_ok(), "JS execute failed: {:?}", result.err());
        let r = result.unwrap();
        assert_eq!(
            r.exit_code, 0,
            "JS exit code should be 0, stderr: {}",
            r.stderr
        );
        assert!(r.stdout.contains("hello from node"), "stdout: {}", r.stdout);
        assert!(
            r.stdout.contains("3"),
            "stdout should contain 3: {}",
            r.stdout
        );
    }

    #[tokio::test]
    #[ignore] // Requires microsandbox (msb) runtime
    async fn test_execute_shell() {
        let request = ExecuteCodeRequest {
            language: "shell".to_string(),
            code: "echo hello_shell && uname -s".to_string(),
            timeout_secs: Some(30),
        };
        let result = run_code(&request).await;
        match &result {
            Ok(r) => {
                println!("stdout: {:?}", r.stdout);
                println!("stderr: {:?}", r.stderr);
                println!("exit_code: {}", r.exit_code);
            }
            Err(e) => println!("Error: {}", e),
        }
        assert!(result.is_ok());
        let r = result.unwrap();
        assert!(r.stdout.contains("hello_shell"));
    }
}
