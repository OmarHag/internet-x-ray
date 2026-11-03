use crate::{network::{self, models::NetworkConnection}, system::{self, device::SystemInfo}};

#[tauri::command]
pub fn get_system_info() -> Result<SystemInfo, String> {
    system::device::collect().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_connections() -> Result<Vec<NetworkConnection>, String> {
    network::scanner::scan().map_err(|error| error.to_string())
}
