use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
};
use tauri::{
    menu::{MenuBuilder, MenuEvent},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};
use tauri_plugin_window_state::{AppHandleExt as WindowStateAppHandleExt, StateFlags};

const AUTOSTART_ARG: &str = "--autostart";
const DEFAULT_GLOBAL_SHORTCUT: &str = "Ctrl+Alt+M";
const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_EXIT_ID: &str = "tray.exit";
const TRAY_ID: &str = "main-tray";
const TRAY_TOGGLE_ID: &str = "tray.toggle-window";
const VAULT_DIR_NAME: &str = "Pega e Ignora";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct RuntimeSettings {
    global_shortcut: String,
    close_to_tray: bool,
    restore_last_session: bool,
    launch_on_startup: bool,
}

impl Default for RuntimeSettings {
    fn default() -> Self {
        Self {
            global_shortcut: DEFAULT_GLOBAL_SHORTCUT.to_string(),
            close_to_tray: true,
            restore_last_session: true,
            launch_on_startup: true,
        }
    }
}

impl RuntimeSettings {
    fn sanitized(mut self) -> Self {
        let shortcut = self.global_shortcut.trim();
        self.global_shortcut = if shortcut.is_empty() {
            DEFAULT_GLOBAL_SHORTCUT.to_string()
        } else {
            shortcut.to_string()
        };
        self
    }
}

struct RuntimeSettingsState(Mutex<RuntimeSettings>);
struct RegisteredShortcutState(Mutex<Option<String>>);

fn runtime_settings_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let document_dir = app
        .path()
        .document_dir()
        .map_err(|error| format!("No pude ubicar Documentos: {error}"))?;
    Ok(document_dir.join(VAULT_DIR_NAME).join("runtime.json"))
}

fn load_runtime_settings<R: Runtime>(app: &AppHandle<R>) -> Result<RuntimeSettings, String> {
    let path = runtime_settings_path(app)?;
    if !path.exists() {
        return Ok(RuntimeSettings::default());
    }

    let raw = fs::read_to_string(&path).map_err(|error| format!("No pude leer runtime.json: {error}"))?;
    let parsed = serde_json::from_str::<RuntimeSettings>(&raw).unwrap_or_default();
    Ok(parsed.sanitized())
}

fn save_runtime_settings<R: Runtime>(app: &AppHandle<R>, settings: &RuntimeSettings) -> Result<(), String> {
    let path = runtime_settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("No pude crear la carpeta del runtime: {error}"))?;
    }

    let payload =
        serde_json::to_vec_pretty(settings).map_err(|error| format!("No pude serializar runtime.json: {error}"))?;
    fs::write(path, payload).map_err(|error| format!("No pude escribir runtime.json: {error}"))
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::WebviewWindow<R>, String> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "No encontré la ventana principal.".to_string())
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = main_window(app)?;
    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }
    window
        .show()
        .map_err(|error| format!("No pude mostrar la app: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("No pude enfocar la app: {error}"))?;
    Ok(())
}

fn hide_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = main_window(app)?;
    window
        .hide()
        .map_err(|error| format!("No pude ocultar la app: {error}"))
}

fn toggle_main_window_visibility<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = main_window(app)?;
    let is_visible = window.is_visible().unwrap_or(true);
    let is_minimized = window.is_minimized().unwrap_or(false);

    if !is_visible || is_minimized {
        show_main_window(app)
    } else {
        hide_main_window(app)
    }
}

fn handle_shortcut_event<R: Runtime>(app: &AppHandle<R>, _shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }
    let _ = toggle_main_window_visibility(app);
}

fn register_global_shortcut<R: Runtime>(app: &AppHandle<R>, shortcut: &str) -> Result<(), String> {
    app.global_shortcut()
        .on_shortcut(shortcut, handle_shortcut_event)
        .map_err(|error| format!("No pude registrar el atajo global \"{shortcut}\": {error}"))
}

fn apply_global_shortcut<R: Runtime>(app: &AppHandle<R>, next_shortcut: &str) -> Result<(), String> {
    let state = app.state::<RegisteredShortcutState>();
    let mut registered_shortcut = state.0.lock().unwrap();

    if registered_shortcut.as_deref() == Some(next_shortcut) {
        return Ok(());
    }

    register_global_shortcut(app, next_shortcut)?;

    if let Some(previous_shortcut) = registered_shortcut.clone() {
        if let Err(error) = app.global_shortcut().unregister(previous_shortcut.as_str()) {
            let _ = app.global_shortcut().unregister(next_shortcut);
            return Err(format!(
                "No pude reemplazar el atajo global anterior \"{previous_shortcut}\": {error}"
            ));
        }
    }

    *registered_shortcut = Some(next_shortcut.to_string());
    Ok(())
}

fn sync_launch_on_startup<R: Runtime>(app: &AppHandle<R>, enabled: bool) -> Result<(), String> {
    let autostart = app.autolaunch();
    let currently_enabled = autostart
        .is_enabled()
        .map_err(|error| format!("No pude consultar el inicio con Windows: {error}"))?;

    if enabled == currently_enabled {
        return Ok(());
    }

    if enabled {
        autostart
            .enable()
            .map_err(|error| format!("No pude activar el inicio con Windows: {error}"))
    } else {
        autostart
            .disable()
            .map_err(|error| format!("No pude desactivar el inicio con Windows: {error}"))
    }
}

fn build_tray<R: Runtime, M: Manager<R>>(manager: &M) -> Result<(), Box<dyn std::error::Error>> {
    let app = manager.app_handle();
    let menu = MenuBuilder::new(manager)
        .text(TRAY_TOGGLE_ID, "Mostrar / ocultar")
        .separator()
        .text(TRAY_EXIT_ID, "Salir completamente")
        .build()?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Pega e Ignora")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event: MenuEvent| match event.id().as_ref() {
            TRAY_TOGGLE_ID => {
                let _ = toggle_main_window_visibility(app);
            }
            TRAY_EXIT_ID => {
                let _ = app.save_window_state(StateFlags::all() & !StateFlags::VISIBLE);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray: &TrayIcon<R>, event: TrayIconEvent| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = toggle_main_window_visibility(&tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(manager)?;
    Ok(())
}

fn is_autostart_launch() -> bool {
    std::env::args().any(|arg| arg == AUTOSTART_ARG)
}

#[tauri::command]
fn get_runtime_settings<R: Runtime>(app: AppHandle<R>) -> Result<RuntimeSettings, String> {
    let state = app.state::<RuntimeSettingsState>();
    let settings = state.0.lock().unwrap().clone();
    Ok(settings)
}

#[tauri::command]
fn update_runtime_settings<R: Runtime>(
    app: AppHandle<R>,
    settings: RuntimeSettings,
) -> Result<RuntimeSettings, String> {
    let next_settings = settings.sanitized();
    let current_settings = {
        let state = app.state::<RuntimeSettingsState>();
        let settings = state.0.lock().unwrap().clone();
        settings
    };

    if next_settings.global_shortcut != current_settings.global_shortcut {
        apply_global_shortcut(&app, &next_settings.global_shortcut)?;
    }

    if next_settings.launch_on_startup != current_settings.launch_on_startup {
        sync_launch_on_startup(&app, next_settings.launch_on_startup)?;
    }

    save_runtime_settings(&app, &next_settings)?;

    let state = app.state::<RuntimeSettingsState>();
    *state.0.lock().unwrap() = next_settings.clone();
    Ok(next_settings)
}

#[tauri::command]
fn toggle_main_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    toggle_main_window_visibility(&app)
}

#[tauri::command]
fn exit_application<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let _ = app.save_window_state(StateFlags::all() & !StateFlags::VISIBLE);
    app.exit(0);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            Default::default(),
            Some(vec![AUTOSTART_ARG]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = show_main_window(app);
        }))
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .setup(|app| {
            let app_handle = app.handle().clone();
            let runtime_settings = load_runtime_settings(&app_handle)
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;

            app.manage(RuntimeSettingsState(Mutex::new(runtime_settings.clone())));
            app.manage(RegisteredShortcutState(Mutex::new(None)));

            if let Err(error) = apply_global_shortcut(&app_handle, &runtime_settings.global_shortcut) {
                eprintln!("{error}");
            }

            if let Err(error) = sync_launch_on_startup(&app_handle, runtime_settings.launch_on_startup) {
                eprintln!("{error}");
            }

            if let Err(error) = save_runtime_settings(&app_handle, &runtime_settings) {
                eprintln!("{error}");
            }

            build_tray(app)?;

            if is_autostart_launch() {
                let _ = hide_main_window(&app_handle);
            } else {
                let _ = show_main_window(&app_handle);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_settings,
            update_runtime_settings,
            toggle_main_window,
            exit_application
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
