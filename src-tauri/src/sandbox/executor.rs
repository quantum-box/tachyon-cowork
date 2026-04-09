use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

use super::workspace::{self, WorkspaceFile};
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
    /// ID of the workspace directory (use to list/download files later)
    pub workspace_id: String,
    /// Files created in the workspace during execution
    pub workspace_files: Vec<WorkspaceFile>,
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
    /// ID of the workspace directory
    pub workspace_id: String,
    /// Files in the workspace
    pub workspace_files: Vec<WorkspaceFile>,
}

/// Execute code in a sandboxed environment with a persistent workspace volume
pub async fn run_code(request: &ExecuteCodeRequest) -> Result<ExecuteCodeResult, String> {
    let timeout_secs = request
        .timeout_secs
        .unwrap_or(DEFAULT_TIMEOUT_SECS)
        .min(MAX_TIMEOUT_SECS);
    let timeout = Duration::from_secs(timeout_secs);

    let sandbox_name = format!("tachyon-exec-{}", uuid_simple());
    let workspace_dir = workspace::create_workspace(&sandbox_name)?;

    let manager = SandboxManager::new();
    let sb = manager
        .create_code_sandbox(&sandbox_name, &request.language, &workspace_dir)
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

            // List files created in the workspace
            let workspace_files = workspace::list_files(&sandbox_name).unwrap_or_default();

            ExecuteCodeResult {
                stdout,
                stderr,
                exit_code: output.status().code,
                timed_out: false,
                duration_ms,
                workspace_id: sandbox_name.clone(),
                workspace_files,
            }
        }
        Ok(Err(e)) => ExecuteCodeResult {
            stdout: String::new(),
            stderr: format!("Execution error: {}", e),
            exit_code: -1,
            timed_out: false,
            duration_ms,
            workspace_id: sandbox_name.clone(),
            workspace_files: vec![],
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
                workspace_id: sandbox_name.clone(),
                workspace_files: vec![],
            }
        }
    };

    // Clean up sandbox (but keep the workspace directory for file access)
    let _ = sb.stop().await;
    let _ = microsandbox::Sandbox::remove(&sandbox_name).await;

    Ok(result)
}

/// Generate a file (PDF/DOCX/PPTX) using Python libraries in sandbox
pub async fn generate_file(request: &GenerateFileRequest) -> Result<GenerateFileResult, String> {
    let sandbox_name = format!("tachyon-gen-{}", uuid_simple());
    let workspace_dir = workspace::create_workspace(&sandbox_name)?;

    let sb = SandboxManager::create_file_sandbox(&sandbox_name, &workspace_dir).await?;

    let data_json = serde_json::to_string(&request.data).map_err(|e| e.to_string())?;
    let embedded_data_json = serde_json::to_string(&data_json).map_err(|e| e.to_string())?;

    // Generate the appropriate Python script
    let (script, output_filename) =
        generate_python_script(&request.file_type, &request.data, &embedded_data_json)?;

    // Install required packages if not using custom image (fallback mode)
    let pip_packages = match request.file_type.as_str() {
        "pdf" => "reportlab",
        "docx" => "python-docx",
        "pptx" => "python-pptx",
        _ => "",
    };
    if !pip_packages.is_empty() {
        let check_cmd = format!(
            "cd /tmp && (python3 -c \"import {}\" 2>/dev/null || pip install --quiet {})",
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
    let command = format!("cd /tmp && python3 -c {}", shell_escape(&script));
    let exec_result = tokio::time::timeout(timeout, sb.shell(&command))
        .await
        .map_err(|_| "File generation timed out".to_string())?
        .map_err(|e| format!("Generation failed: {}", e))?;

    if exec_result.status().code != 0 {
        let stderr = exec_result.stderr().unwrap_or_default();
        let _ = sb.stop().await;
        let _ = microsandbox::Sandbox::remove(&sandbox_name).await;
        return Err(format!("Generation script failed: {}", stderr));
    }

    // Stop sandbox before reading files from host
    let _ = sb.stop().await;
    let _ = microsandbox::Sandbox::remove(&sandbox_name).await;

    // Read the generated file directly from the host workspace directory
    let output_host_path = std::path::Path::new(&workspace_dir).join(&output_filename);
    let file_bytes = std::fs::read(&output_host_path)
        .map_err(|e| format!("Failed to read generated file from workspace: {}", e))?;

    // Save to user-specified path if requested
    let saved_path = if let Some(ref path) = request.output_path {
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create output directory: {}", e))?;
        }
        std::fs::write(path, &file_bytes).map_err(|e| e.to_string())?;
        Some(path.clone())
    } else {
        None
    };

    // List workspace files (excluding temp scripts)
    let workspace_files = workspace::list_files(&sandbox_name).unwrap_or_default();

    // Clean up temp files from workspace (keep the output)
    Ok(GenerateFileResult {
        file_bytes,
        file_name: output_filename,
        saved_path,
        workspace_id: sandbox_name,
        workspace_files,
    })
}

fn generate_python_script(
    file_type: &str,
    data: &serde_json::Value,
    embedded_data_json: &str,
) -> Result<(String, String), String> {
    match file_type {
        "pdf" => Ok((
            generate_pdf_script(data, embedded_data_json),
            "output.pdf".to_string(),
        )),
        "docx" => Ok((
            generate_docx_script(data, embedded_data_json),
            "output.docx".to_string(),
        )),
        "pptx" => Ok((
            generate_pptx_script(data, embedded_data_json),
            "output.pptx".to_string(),
        )),
        _ => Err(format!("Unsupported file type: {}", file_type)),
    }
}

fn generate_pdf_script(_data: &serde_json::Value, embedded_data_json: &str) -> String {
    format!(
        r#"
import json
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch

data = json.loads({embedded_data_json})

doc = SimpleDocTemplate('/workspace/output.pdf', pagesize=A4)
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
    )
}

fn generate_docx_script(_data: &serde_json::Value, embedded_data_json: &str) -> String {
    format!(
        r#"
import json
from docx import Document
from docx.shared import Pt, Inches

data = json.loads({embedded_data_json})

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

doc.save('/workspace/output.docx')
print('DOCX generated successfully')
"#
    )
}

fn generate_pptx_script(_data: &serde_json::Value, embedded_data_json: &str) -> String {
    format!(
        r#"
import json
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN

data = json.loads({embedded_data_json})

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

prs.save('/workspace/output.pptx')
print('PPTX generated successfully')
"#
    )
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
        let workspace_dir = workspace::create_workspace(&name).unwrap();

        eprintln!("[test] Creating sandbox {}...", name);
        let _ = Sandbox::remove(&name).await;
        let sb = Sandbox::builder(&name)
            .image("python:3.12-slim")
            .memory(512_u32)
            .cpus(1_u8)
            .volume("/workspace", |m| m.bind(&workspace_dir))
            .workdir("/workspace")
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

        // Test shell and file creation in workspace
        eprintln!("[test] Running shell...");
        let exec_result = sb
            .shell("python3 -c \"print('hello from sandbox'); open('/workspace/test.txt','w').write('persisted!')\"")
            .await;

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

        // Verify file persists on host after sandbox is gone
        let files = workspace::list_files(&name).unwrap();
        assert!(
            files.iter().any(|f| f.name == "test.txt"),
            "test.txt should persist in workspace: {:?}",
            files
        );
        let content = workspace::read_file(&name, "test.txt").unwrap();
        assert_eq!(String::from_utf8_lossy(&content), "persisted!");

        // Cleanup
        workspace::cleanup(&name).unwrap();
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
        std::fs::create_dir_all("/tmp/tachyon-test").ok();
        let result = generate_file(&request).await;
        match &result {
            Ok(r) => {
                eprintln!("[test-gen-pdf] file_name: {}", r.file_name);
                eprintln!("[test-gen-pdf] file_bytes len: {}", r.file_bytes.len());
                eprintln!("[test-gen-pdf] saved_path: {:?}", r.saved_path);
                eprintln!("[test-gen-pdf] workspace_id: {}", r.workspace_id);
                eprintln!("[test-gen-pdf] workspace_files: {:?}", r.workspace_files);
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
        assert!(std::path::Path::new("/tmp/tachyon-test/generated.pdf").exists());
        assert!(!r.workspace_id.is_empty());

        // Cleanup
        workspace::cleanup(&r.workspace_id).ok();
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
                eprintln!("[test-js] workspace_id: {}", r.workspace_id);
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

        // Cleanup
        workspace::cleanup(&r.workspace_id).ok();
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

        // Cleanup
        workspace::cleanup(&r.workspace_id).ok();
    }

    #[tokio::test]
    #[ignore] // Requires microsandbox (msb) runtime
    async fn test_workspace_file_persistence() {
        // Run code that creates a file
        let request = ExecuteCodeRequest {
            language: "python".to_string(),
            code: r#"
with open('/workspace/report.csv', 'w') as f:
    f.write('name,value\n')
    f.write('alpha,100\n')
    f.write('beta,200\n')
print('done')
"#
            .to_string(),
            timeout_secs: Some(60),
        };
        let result = run_code(&request).await;
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r.exit_code, 0);
        assert!(!r.workspace_files.is_empty(), "Should have workspace files");

        // Verify we can read the file after sandbox is gone
        let csv_file = r.workspace_files.iter().find(|f| f.name == "report.csv");
        assert!(
            csv_file.is_some(),
            "report.csv should be in workspace files"
        );

        let content = workspace::read_file(&r.workspace_id, "report.csv").unwrap();
        let text = String::from_utf8_lossy(&content);
        assert!(text.contains("alpha,100"));

        // Cleanup
        workspace::cleanup(&r.workspace_id).ok();
    }
}
