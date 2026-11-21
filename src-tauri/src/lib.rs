// Spike (docs/plans/desktop-app.md phase 1): the live site in a window, Ctrl+Alt+J toggles it,
// close hides it. Timings are printed so 1.5 can be measured.
use std::time::Instant;

use tauri::{Manager, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let toggle = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyJ);

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut != &toggle || event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let Some(window) = app.get_webview_window("main") else { return };
                    let start = Instant::now();
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                        println!("[spike] hide in {:?}", start.elapsed());
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                        println!("[spike] show + focus in {:?}", start.elapsed());
                    }
                })
                .build(),
        )
        .setup(move |app| {
            app.global_shortcut().register(toggle)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close hides, so the hotkey can bring it back with the page still loaded.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
