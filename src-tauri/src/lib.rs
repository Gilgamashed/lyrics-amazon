mod bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;

    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));
    }
    builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
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
