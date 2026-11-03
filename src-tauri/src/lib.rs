mod commands;
mod network;
mod system;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::get_system_info, commands::get_connections])
        .run(tauri::generate_context!())
        .expect("failed to run Internet X-Ray");
}
