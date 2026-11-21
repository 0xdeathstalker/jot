fn main() {
    // Our own commands, so capabilities/default.json can allow them for the site by name.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["get_hotkey", "set_hotkey"])),
    )
    .expect("failed to run tauri-build");
}
