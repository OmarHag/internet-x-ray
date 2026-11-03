use network_interface::{Addr, NetworkInterface, NetworkInterfaceConfig};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo { hostname: String, operating_system: String, interface_name: String, local_ip: String }

#[derive(Debug, Error)]
pub enum SystemInfoError {
    #[error("could not read hostname: {0}")] Hostname(#[from] std::io::Error),
    #[error("could not enumerate network interfaces: {0}")] Interfaces(String),
}

pub fn collect() -> Result<SystemInfo, SystemInfoError> {
    let hostname = hostname::get()?.to_string_lossy().into_owned();
    let interfaces = NetworkInterface::show().map_err(|error| SystemInfoError::Interfaces(error.to_string()))?;
    let candidate = interfaces.iter().find_map(|interface| interface.addr.iter().find_map(|addr| match addr {
        Addr::V4(v4) if !v4.ip.is_loopback() && !v4.ip.is_link_local() => Some((interface.name.clone(), v4.ip.to_string())),
        _ => None,
    }));
    let (interface_name, local_ip) = candidate.unwrap_or_else(|| ("Unavailable".into(), "Unavailable".into()));
    Ok(SystemInfo { hostname, operating_system: std::env::consts::OS.into(), interface_name, local_ip })
}
