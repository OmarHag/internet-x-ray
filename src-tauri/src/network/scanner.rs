use super::models::NetworkConnection;

pub fn scan() -> Result<Vec<NetworkConnection>, super::platform::PlatformError> {
    super::platform::scan_connections()
}
