//! Read-only UIAutomation tree probe for spec 18 (W0).
//!
//! This example is intentionally not used by the application. It locates an
//! Amazon Music top-level window and dumps a bounded, sanitized UIA tree so the
//! fallback discovery heuristics can be designed from real fixtures instead of
//! assumptions. Run with:
//!
//!   cargo run --example uia_probe -- --out test-results/uia/capture.json
//!   cargo run --example uia_probe -- --pid 17240 --out test-results/uia/paused.json
//!
//! Only metadata needed to design the reader is captured: parent links,
//! control/automation/class names, visible text and bounding rectangles. The
//! process path is reduced to its file name and no pixels are read.

#[cfg(target_os = "windows")]
mod windows_impl {
    use std::collections::HashSet;
    use std::env;
    use std::error::Error;
    use std::ffi::c_void;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use serde::Serialize;
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, RECT};
    use windows::Win32::System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
        QueryFullProcessImageNameW,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTextPattern,
        IUIAutomationTreeWalker, IUIAutomationValuePattern, TreeScope_Descendants,
        UIA_TextPatternId, UIA_ValuePatternId,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };
    use windows::core::{BOOL, BSTR, Interface, PWSTR};

    type AnyResult<T> = Result<T, Box<dyn Error>>;

    #[derive(Debug)]
    struct Options {
        out: PathBuf,
        pid: Option<u32>,
        title: String,
        max_elements: usize,
        max_depth: usize,
        find_all: bool,
    }

    fn usage() {
        eprintln!(
            "Usage: cargo run --example uia_probe -- [--pid <pid>] [--title <substring>] [--out <path>] [--mode walk|find-all] [--max-elements <n>] [--max-depth <n>]\n\
         Defaults: --title 'Amazon Music' --out test-results/uia/capture.json --mode walk --max-elements 2500 --max-depth 64"
        );
    }

    fn parse_options() -> AnyResult<Options> {
        let mut options = Options {
            out: PathBuf::from("test-results/uia/capture.json"),
            pid: None,
            title: "Amazon Music".to_string(),
            max_elements: 2500,
            max_depth: 64,
            find_all: false,
        };

        let mut args = env::args().skip(1);
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--help" | "-h" => {
                    usage();
                    std::process::exit(0);
                }
                "--out" => options.out = PathBuf::from(required_value(&mut args, "--out")?),
                "--pid" => options.pid = Some(required_value(&mut args, "--pid")?.parse::<u32>()?),
                "--title" => options.title = required_value(&mut args, "--title")?,
                "--max-elements" => {
                    options.max_elements =
                        required_value(&mut args, "--max-elements")?.parse::<usize>()?
                }
                "--max-depth" => {
                    options.max_depth =
                        required_value(&mut args, "--max-depth")?.parse::<usize>()?
                }
                "--mode" => {
                    let mode = required_value(&mut args, "--mode")?;
                    options.find_all = match mode.as_str() {
                        "walk" => false,
                        "find-all" => true,
                        other => {
                            return Err(format!(
                                "unknown mode {other:?} (expected walk or find-all)"
                            )
                            .into());
                        }
                    };
                }
                other => return Err(format!("unknown argument: {other}").into()),
            }
        }

        if options.max_elements == 0 {
            return Err("--max-elements must be greater than zero".into());
        }
        if options.max_depth == 0 {
            return Err("--max-depth must be greater than zero".into());
        }
        Ok(options)
    }

    fn required_value(args: &mut impl Iterator<Item = String>, name: &str) -> AnyResult<String> {
        args.next()
            .ok_or_else(|| format!("missing value for {name}").into())
    }

    #[derive(Clone, Debug)]
    struct WindowInfo {
        hwnd: isize,
        pid: u32,
        title: String,
        process_name: String,
        visible: bool,
    }

    struct WindowSearch {
        pid_filter: Option<u32>,
        title_filter: String,
        candidates: Vec<WindowInfo>,
    }

    fn window_title(hwnd: HWND) -> String {
        let mut buffer = [0u16; 512];
        let length = unsafe { GetWindowTextW(hwnd, &mut buffer) } as usize;
        String::from_utf16_lossy(&buffer[..length.min(buffer.len())])
    }

    fn process_name(pid: u32) -> String {
        unsafe {
            let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
                return String::new();
            };
            let mut buffer = vec![0u16; 512];
            let mut size = buffer.len() as u32;
            let result = QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_WIN32,
                PWSTR(buffer.as_mut_ptr()),
                &mut size,
            );
            let _ = CloseHandle(handle);
            if result.is_err() {
                return String::new();
            }
            let path = String::from_utf16_lossy(&buffer[..(size as usize).min(buffer.len())]);
            path.rsplit(['/', '\\']).next().unwrap_or(&path).to_string()
        }
    }

    fn is_amazon_music_process(name: &str) -> bool {
        name.trim().eq_ignore_ascii_case("Amazon Music.exe")
    }

    unsafe extern "system" fn enum_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let search = unsafe { &mut *(lparam.0 as *mut WindowSearch) };
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
        if pid == 0 {
            return BOOL(1);
        }
        if search.pid_filter.is_some_and(|wanted| wanted != pid) {
            return BOOL(1);
        }

        let process = process_name(pid);
        if !is_amazon_music_process(&process) {
            return BOOL(1);
        }

        let title = window_title(hwnd);
        let visible = unsafe { IsWindowVisible(hwnd) }.0 != 0;
        let matches_title = title
            .to_lowercase()
            .contains(&search.title_filter.to_lowercase());
        if matches_title {
            search.candidates.push(WindowInfo {
                hwnd: hwnd.0 as isize,
                pid,
                title,
                process_name: process,
                visible,
            });
        }
        BOOL(1)
    }

    fn find_window(options: &Options) -> AnyResult<WindowInfo> {
        let mut search = WindowSearch {
            pid_filter: options.pid,
            title_filter: options.title.clone(),
            candidates: Vec::new(),
        };
        unsafe {
            EnumWindows(
                Some(enum_window),
                LPARAM(&mut search as *mut WindowSearch as isize),
            )?;
        }

        if search.candidates.is_empty() {
            return Err(format!(
            "no Amazon Music window found (pid filter: {:?}, title filter: {:?}). Start Amazon Music and try again.",
            options.pid, options.title
        )
        .into());
        }

        // Prefer the visible main Amazon Music window; otherwise use the first
        // matching top-level window (useful for minimized-window captures).
        let selected = search
            .candidates
            .iter()
            .find(|window| {
                window.visible && window.title.trim().eq_ignore_ascii_case("Amazon Music")
            })
            .or_else(|| search.candidates.iter().find(|window| window.visible))
            .unwrap_or(&search.candidates[0])
            .clone();
        eprintln!(
            "Selected Amazon Music window: pid={} title={:?} visible={} ({} candidate(s))",
            selected.pid,
            selected.title,
            selected.visible,
            search.candidates.len()
        );
        Ok(selected)
    }

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Bounds {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }

    impl From<RECT> for Bounds {
        fn from(rect: RECT) -> Self {
            Self {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
            }
        }
    }

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct UiaNode {
        id: usize,
        parent: Option<usize>,
        depth: usize,
        #[serde(skip_serializing_if = "Option::is_none")]
        name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        help_text: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        localized_control_type: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        framework_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        item_status: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        text: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        control_type: Option<i32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        automation_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        class_name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        bounds: Option<Bounds>,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_content_element: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_control_element: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_offscreen: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        has_keyboard_focus: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_enabled: Option<bool>,
    }

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Capture {
        captured_at_unix_ms: u128,
        window: WindowCapture,
        mode: String,
        max_elements: usize,
        max_depth: usize,
        element_count: usize,
        truncated: bool,
        property_errors: usize,
        nodes: Vec<UiaNode>,
    }

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct WindowCapture {
        pid: u32,
        title: String,
        process_name: String,
        visible: bool,
    }

    fn non_empty(value: String) -> Option<String> {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    }

    fn optional_bstr(result: windows::core::Result<BSTR>) -> Option<String> {
        result.ok().and_then(|value| non_empty(value.to_string()))
    }

    fn value_pattern(element: &IUIAutomationElement) -> Option<String> {
        unsafe {
            element
                .GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
                .ok()?
                .CurrentValue()
                .ok()
                .and_then(|value| non_empty(value.to_string()))
        }
    }

    fn text_pattern(element: &IUIAutomationElement) -> Option<String> {
        unsafe {
            let pattern = element
                .GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId)
                .ok()?;
            let range = pattern.DocumentRange().ok()?;
            let text = range.GetText(-1).ok()?.to_string();
            let trimmed = text.trim();
            (!trimmed.is_empty()).then(|| trimmed.chars().take(500).collect())
        }
    }

    fn read_node(
        element: &IUIAutomationElement,
        id: usize,
        parent: Option<usize>,
        depth: usize,
    ) -> (UiaNode, usize) {
        let mut property_errors = 0;
        let name = match unsafe { element.CurrentName() } {
            Ok(value) => non_empty(value.to_string()),
            Err(_) => {
                property_errors += 1;
                None
            }
        };
        let control_type = unsafe { element.CurrentControlType() }
            .ok()
            .map(|value| value.0);
        let automation_id = match unsafe { element.CurrentAutomationId() } {
            Ok(value) => non_empty(value.to_string()),
            Err(_) => {
                property_errors += 1;
                None
            }
        };
        let class_name = match unsafe { element.CurrentClassName() } {
            Ok(value) => non_empty(value.to_string()),
            Err(_) => {
                property_errors += 1;
                None
            }
        };
        let bounds = unsafe { element.CurrentBoundingRectangle() }
            .ok()
            .map(Bounds::from);
        let localized_control_type =
            optional_bstr(unsafe { element.CurrentLocalizedControlType() });
        let is_content_element = unsafe { element.CurrentIsContentElement() }
            .ok()
            .map(|value| value.0 != 0);
        let is_control_element = unsafe { element.CurrentIsControlElement() }
            .ok()
            .map(|value| value.0 != 0);
        let is_offscreen = unsafe { element.CurrentIsOffscreen() }
            .ok()
            .map(|value| value.0 != 0);
        let has_keyboard_focus = unsafe { element.CurrentHasKeyboardFocus() }
            .ok()
            .map(|value| value.0 != 0);
        let is_enabled = unsafe { element.CurrentIsEnabled() }
            .ok()
            .map(|value| value.0 != 0);

        // A CEF text leaf can expose its content through TextPattern or
        // ValuePattern while CurrentName is empty. Query those only for small
        // unnamed elements to keep the capture bounded and avoid pulling a whole
        // document's text from container nodes.
        let small_unnamed = name.is_none()
            && bounds.as_ref().is_some_and(|bounds| {
                let width = bounds.right - bounds.left;
                let height = bounds.bottom - bounds.top;
                width > 0 && height > 0 && width <= 800 && height <= 120
            });
        let help_text = if name.is_none() {
            optional_bstr(unsafe { element.CurrentHelpText() })
        } else {
            None
        };
        let framework_id = if name.is_none() {
            optional_bstr(unsafe { element.CurrentFrameworkId() })
        } else {
            None
        };
        let item_status = if name.is_none() {
            optional_bstr(unsafe { element.CurrentItemStatus() })
        } else {
            None
        };
        let value = if small_unnamed {
            value_pattern(element)
        } else {
            None
        };
        let text = if small_unnamed {
            text_pattern(element)
        } else {
            None
        };

        (
            UiaNode {
                id,
                parent,
                depth,
                name,
                help_text,
                localized_control_type,
                framework_id,
                item_status,
                value,
                text,
                control_type,
                automation_id,
                class_name,
                bounds,
                is_content_element,
                is_control_element,
                is_offscreen,
                has_keyboard_focus,
                is_enabled,
            },
            property_errors,
        )
    }

    struct Walker<'a> {
        automation: &'a IUIAutomationTreeWalker,
        seen: HashSet<usize>,
        nodes: Vec<UiaNode>,
        property_errors: usize,
        truncated: bool,
        max_elements: usize,
        max_depth: usize,
    }

    impl<'a> Walker<'a> {
        fn new(
            automation: &'a IUIAutomationTreeWalker,
            max_elements: usize,
            max_depth: usize,
        ) -> Self {
            Self {
                automation,
                seen: HashSet::new(),
                nodes: Vec::new(),
                property_errors: 0,
                truncated: false,
                max_elements,
                max_depth,
            }
        }

        fn walk(&mut self, element: &IUIAutomationElement, parent: Option<usize>, depth: usize) {
            if self.nodes.len() >= self.max_elements {
                self.truncated = true;
                return;
            }
            if depth > self.max_depth {
                self.truncated = true;
                return;
            }

            let identity = element.as_raw() as usize;
            if !self.seen.insert(identity) {
                return;
            }

            let id = self.nodes.len();
            let (node, errors) = read_node(element, id, parent, depth);
            self.property_errors += errors;
            self.nodes.push(node);

            let Ok(child) = (unsafe { self.automation.GetFirstChildElement(element) }) else {
                return;
            };
            self.walk(&child, Some(id), depth + 1);

            let mut sibling = child;
            loop {
                let Ok(next) = (unsafe { self.automation.GetNextSiblingElement(&sibling) }) else {
                    break;
                };
                self.walk(&next, parent, depth);
                sibling = next;
            }
        }
    }

    fn find_all_nodes(
        automation: &IUIAutomation,
        root: &IUIAutomationElement,
        max_elements: usize,
    ) -> AnyResult<(Vec<UiaNode>, bool, usize)> {
        let condition = unsafe { automation.CreateTrueCondition() }?;
        let array = unsafe { root.FindAll(TreeScope_Descendants, &condition) }?;
        let length = unsafe { array.Length() }? as usize;
        let mut nodes = Vec::with_capacity(length.min(max_elements));
        let mut property_errors = 0;
        let mut truncated = false;

        for index in 0..length {
            if nodes.len() >= max_elements {
                truncated = true;
                break;
            }
            let Ok(element) = (unsafe { array.GetElement(index as i32) }) else {
                property_errors += 1;
                continue;
            };
            let (node, errors) = read_node(&element, nodes.len(), None, 0);
            property_errors += errors;
            nodes.push(node);
        }

        Ok((nodes, truncated, property_errors))
    }

    fn capture(window: &WindowInfo, options: &Options) -> AnyResult<Capture> {
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
            let automation: IUIAutomation =
                CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
            let root = automation.ElementFromHandle(HWND(window.hwnd as *mut c_void))?;

            let (nodes, truncated, property_errors) = if options.find_all {
                find_all_nodes(&automation, &root, options.max_elements)?
            } else {
                let walker = automation.RawViewWalker()?;
                let mut capture = Walker::new(&walker, options.max_elements, options.max_depth);
                capture.walk(&root, None, 0);
                (capture.nodes, capture.truncated, capture.property_errors)
            };

            Ok(Capture {
                captured_at_unix_ms: SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis(),
                window: WindowCapture {
                    pid: window.pid,
                    title: window.title.clone(),
                    process_name: window.process_name.clone(),
                    visible: window.visible,
                },
                mode: if options.find_all {
                    "find-all".to_string()
                } else {
                    "walk".to_string()
                },
                max_elements: options.max_elements,
                max_depth: options.max_depth,
                element_count: nodes.len(),
                truncated,
                property_errors,
                nodes,
            })
        }
    }

    fn write_capture(capture: &Capture, out: &Path) -> AnyResult<()> {
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(capture)?;
        fs::write(out, json)?;
        Ok(())
    }

    fn run() -> AnyResult<()> {
        let options = parse_options()?;
        let window = find_window(&options)?;
        let capture = capture(&window, &options)?;
        write_capture(&capture, &options.out)?;
        println!(
            "Captured {} UIA elements (truncated: {}, property errors: {}) to {}",
            capture.element_count,
            capture.truncated,
            capture.property_errors,
            options.out.display()
        );
        Ok(())
    }

    pub(super) fn main() {
        if let Err(error) = run() {
            eprintln!("uia_probe: {error}");
            std::process::exit(1);
        }
    }
}

#[cfg(target_os = "windows")]
fn main() {
    windows_impl::main();
}

#[cfg(not(target_os = "windows"))]
fn main() {
    eprintln!("uia_probe is Windows-only");
}
