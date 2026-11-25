// Desktop shell (docs/plans/desktop-app.md): the live site in one always-on-top window, a global
// hotkey to toggle it, and a tray icon instead of a taskbar button. Close and minimize hide to the
// tray; only the tray's Quit exits, so the hotkey keeps working.
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::PageLoadEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

// Passed by the launch-at-login entry: start in the tray, window hidden.
const HIDDEN_ARG: &str = "--hidden";
static FIRST_LOAD_DONE: AtomicBool = AtomicBool::new(false);

// The global hotkey: user-set from the gear menu (app/src/desktop/hotkey-dialog.tsx), kept in a file
// here, not in the page, so it works even when the page cannot load.
const DEFAULT_HOTKEY: &str = "control+alt+KeyJ";
struct Hotkey(Mutex<Shortcut>);

fn hotkey_file(app: &AppHandle) -> tauri::Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join("hotkey.txt"))
}

#[tauri::command]
fn get_hotkey(state: tauri::State<Hotkey>) -> String {
    state.0.lock().unwrap().into_string()
}

// Registers the new one before dropping the old, so a combo another app owns ("taken") leaves the
// current hotkey working.
#[tauri::command]
fn set_hotkey(
    app: AppHandle,
    state: tauri::State<Hotkey>,
    hotkey: String,
) -> Result<String, String> {
    let new: Shortcut = hotkey.parse().map_err(|_| "invalid".to_string())?;
    let mut current = state.0.lock().unwrap();
    if new != *current {
        let shortcuts = app.global_shortcut();
        shortcuts.register(new).map_err(|_| "taken".to_string())?;
        let _ = shortcuts.unregister(*current);
        *current = new;
        let path = hotkey_file(&app).map_err(|e| e.to_string())?;
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(path, new.into_string()).map_err(|e| e.to_string())?;
    }
    Ok(current.into_string())
}

fn window_state_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION
}

// Shell updates come from GitHub Releases (latest.json, signed with the key in the
// TAURI_SIGNING_PRIVATE_KEY secret; .github/workflows/desktop-release.yml). The web part updates
// itself with each deploy. Checks at start and every 6 hours; downloads in the background, but
// installing closes the app (the installer then starts the new version), so it waits until the
// window is hidden: never in the middle of a note.
const UPDATE_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

async fn download_update(app: &AppHandle) -> Option<(Update, Vec<u8>)> {
    let update = app.updater().ok()?.check().await.ok()??;
    let bytes = update.download(|_, _| {}, || {}).await.ok()?;
    Some((update, bytes))
}

fn start_updater(app: AppHandle) {
    std::thread::spawn(move || {
        loop {
            if let Some((update, bytes)) = tauri::async_runtime::block_on(download_update(&app)) {
                while app
                    .get_webview_window("main")
                    .is_some_and(|w| w.is_visible().unwrap_or(false))
                {
                    std::thread::sleep(Duration::from_secs(60));
                }
                let _ = app.save_window_state(window_state_flags());
                let _ = update.install(bytes);
            }
            std::thread::sleep(UPDATE_EVERY);
        }
    });
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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_hotkey, set_hotkey])
        // First, so a second launch only brings up the running app.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show(app)
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
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
                // Only one shortcut is ever registered: the hotkey.
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle(app, true);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            // Debug builds load `pnpm dev`, so React changes show up without a deploy. Release builds
            // load the live site: same origin as the web app (cookies, sockets, service worker).
            let url = if cfg!(debug_assertions) {
                "http://localhost:5173"
            } else {
                "https://jot.deathstalker.dev"
            };
            // Frameless: the React title bar (app/src/desktop/title-bar.tsx) drags, minimizes, closes.
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse()?))
                .title("Jot")
                .inner_size(480.0, 600.0)
                .center()
                .always_on_top(true)
                .skip_taskbar(true)
                .decorations(false)
                .visible(false)
                .build()?;

            // Debug builds are not installed: nothing to update.
            if !cfg!(debug_assertions) {
                start_updater(app.handle().clone());
            }

            // The saved hotkey, else the default. If another app holds it, start anyway (the tray
            // still works) and let the user pick another.
            let saved = hotkey_file(app.handle())
                .ok()
                .and_then(|path| std::fs::read_to_string(path).ok())
                .and_then(|text| text.trim().parse::<Shortcut>().ok());
            let hotkey = saved.unwrap_or_else(|| DEFAULT_HOTKEY.parse().expect("valid default"));
            let _ = app.global_shortcut().register(hotkey);
            app.manage(Hotkey(Mutex::new(hotkey)));

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
                    &MenuItem::with_id(app, "new-note", "New note", true, None::<&str>)?,
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
                    "new-note" => {
                        show(app);
                        // app/src/desktop/events.ts makes the note.
                        let _ = app.emit_to("main", "new-note", ());
                    }
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
