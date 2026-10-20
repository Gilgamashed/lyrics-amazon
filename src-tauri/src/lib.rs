mod bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;

    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_focus();
                }
            }))
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_state_flags(
                        tauri_plugin_window_state::StateFlags::SIZE
                            | tauri_plugin_window_state::StateFlags::POSITION,
                    )
                    .build(),
            );
    }
    builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                // A saved position may fall outside every attached monitor
                // (unplugged display / resolution change): re-center it.
                if let Some(window) = app.get_webview_window("main") {
                    recenter_if_offscreen(&window);
                }
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let bridge_handle = app.handle().clone();
            tauri::async_runtime::spawn(bridge::run(move |error| {
                use tauri_plugin_dialog::DialogExt;
                log::error!(
                    "[bridge] failed to bind 127.0.0.1:{}: {error}",
                    bridge::PORT
                );
                bridge_handle
                    .dialog()
                    .message(format!(
                        "Track detection could not start because port {} is already in use. \
                         The app will continue without native detection (browser fallback).",
                        bridge::PORT
                    ))
                    .title("Native detection unavailable")
                    .show(|_| {});
            }));
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                check_for_updates(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

/// Minimum overlap (in physical pixels) between the window rect and a monitor
/// for the window to count as on-screen.
const MIN_VISIBLE_PX: i64 = 100;

/// Whether two `(x, y, width, height)` rects overlap enough to stay usable.
fn overlaps(a: (i64, i64, i64, i64), b: (i64, i64, i64, i64)) -> bool {
    let overlap_w = (a.0 + a.2).min(b.0 + b.2) - a.0.max(b.0);
    let overlap_h = (a.1 + a.3).min(b.1 + b.3) - a.1.max(b.1);
    overlap_w >= MIN_VISIBLE_PX && overlap_h >= MIN_VISIBLE_PX
}

/// Re-centers the main window when its restored geometry is not visible on any
/// attached monitor (spec 16 §3.4). First runs keep the configured default.
#[cfg(desktop)]
fn recenter_if_offscreen(window: &tauri::WebviewWindow) {
    let (Ok(position), Ok(size), Ok(monitors)) = (
        window.outer_position(),
        window.outer_size(),
        window.available_monitors(),
    ) else {
        return;
    };
    if monitors.is_empty() {
        return;
    }
    let rect = (
        position.x as i64,
        position.y as i64,
        size.width as i64,
        size.height as i64,
    );
    let visible = monitors.iter().any(|monitor| {
        let m_pos = monitor.position();
        let m_size = monitor.size();
        overlaps(
            rect,
            (
                m_pos.x as i64,
                m_pos.y as i64,
                m_size.width as i64,
                m_size.height as i64,
            ),
        )
    });
    if !visible {
        let _ = window.center();
    }
}

async fn check_for_updates(app: tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    use tauri_plugin_updater::UpdaterExt;

    if cfg!(debug_assertions) {
        return;
    }

    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(err) => {
            log::warn!("updater unavailable: {err}");
            return;
        }
    };

    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => return,
        Err(err) => {
            log::warn!("update check failed: {err}");
            return;
        }
    };

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .message(format!(
            "A new version ({}) is available. Download and install it now?",
            update.version
        ))
        .title("Update available")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Update".into(),
            "Later".into(),
        ))
        .show(move |confirmed| {
            let _ = tx.send(confirmed);
        });

    let confirmed = rx.await.unwrap_or(false);
    if !confirmed {
        return;
    }

    if let Err(err) = update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
    {
        log::warn!("update install failed: {err}");
        return;
    }

    app.restart();
}

#[cfg(test)]
mod geometry_tests {
    use super::*;

    #[test]
    fn overlap_requires_visible_area_on_both_axes() {
        let monitor = (0, 0, 1920, 1080);
        assert!(overlaps((100, 100, 800, 600), monitor));
        assert!(overlaps((-700, 100, 800, 600), monitor));
        // Fully off-screen (e.g. a monitor that is no longer attached).
        assert!(!overlaps((3000, 100, 800, 600), monitor));
        // A sliver of a few pixels does not count as on-screen.
        assert!(!overlaps((-790, 100, 800, 600), monitor));
    }
}
