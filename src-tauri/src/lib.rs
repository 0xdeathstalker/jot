// Desktop shell (docs/plans/desktop-app.md): the live site in one always-on-top window, a global
// hotkey to toggle it, and a tray icon instead of a taskbar button. Close and minimize hide to the
// tray; only the tray's Quit exits, so the hotkey keeps working.
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    AppHandle, Manager, WindowEvent,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::PageLoadEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

// Passed by the launch-at-login entry: start in the tray, window hidden.
const HIDDEN_ARG: &str = "--hidden";
static FIRST_LOAD_DONE: AtomicBool = AtomicBool::new(false);

fn window_state_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION
}

fn show(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

// Every hide saves size and position, so a kill, crash or shutdown does not lose them (the plugin
// alone saves only on a clean exit).
fn hide(app: &AppHandle) {
    let _ = app.save_window_state(window_state_flags());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

// Hotkey, like Raycast: hide if it is up and focused, otherwise bring it up. The tray passes
// `needs_focus = false`: clicking the tray icon takes focus away from the window first.
fn toggle(app: &AppHandle, needs_focus: bool) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let up = window.is_visible().unwrap_or(false)
        && (!needs_focus || window.is_focused().unwrap_or(false));
    if up {
        hide(app);
    } else {
        show(app);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ponytail: fixed hotkey for now; phase 3.6 makes it user-set.
    let hotkey = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyJ);

    tauri::Builder::default()
        // First, so a second launch only brings up the running app.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show(app)
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_ARG]),
        ))
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_state_flags())
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &hotkey && event.state() == ShortcutState::Pressed {
                        toggle(app, true);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            app.global_shortcut().register(hotkey)?;

            // Launch at login is on by default: enable it once, on the first run of an installed
            // build. After that the tray checkbox owns it. Never in debug, which would register the
            // dev binary.
            if !cfg!(debug_assertions) {
                let dir = app.path().app_config_dir()?;
                let marker = dir.join("autostart-initialised");
                if !marker.exists() {
                    let _ = app.autolaunch().enable();
                    std::fs::create_dir_all(&dir)?;
                    std::fs::write(&marker, "")?;
                }
            }

            let autostart = CheckMenuItem::with_id(
                app,
                "autostart",
                "Launch at login",
                true,
                app.autolaunch().is_enabled().unwrap_or(false),
                None::<&str>,
            )?;
            let menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "show", "Show Jot", true, None::<&str>)?,
                    &autostart,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "quit", "Quit Jot", true, None::<&str>)?,
                ],
            )?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().ok_or("no app icon")?)
                .tooltip("Jot")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => show(app),
                    "autostart" => {
                        let launcher = app.autolaunch();
                        let _ = if launcher.is_enabled().unwrap_or(false) {
                            launcher.disable()
                        } else {
                            launcher.enable()
                        };
                        // Show the real state, also if enabling or disabling failed.
                        let _ = autostart.set_checked(launcher.is_enabled().unwrap_or(false));
                    }
                    "quit" => {
                        let _ = app.save_window_state(window_state_flags());
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle(tray.app_handle(), false);
                    }
                })
                .build(app)?;
            Ok(())
        })
        // The window starts hidden and appears once the page has loaded (no blank flash), unless
        // launched at login.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished
                && !FIRST_LOAD_DONE.swap(true, Ordering::SeqCst)
                && !std::env::args().any(|arg| arg == HIDDEN_ARG)
            {
                show(webview.app_handle());
            }
        })
        .on_window_event(|window, event| match event {
            // Close hides: the page stays loaded, so the hotkey brings it back instantly.
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                hide(window.app_handle());
            }
            // With no taskbar button, a minimized window would sit as a stub above the taskbar.
            WindowEvent::Resized(_) if window.is_minimized().unwrap_or(false) => {
                hide(window.app_handle());
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
