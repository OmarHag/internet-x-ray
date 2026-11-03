use thiserror::Error;

#[cfg(target_os = "macos")]
mod macos;

#[derive(Debug, Error)]
pub enum PlatformError {
    #[error("failed to start the macOS socket collector: {0}")]
    Collector(#[from] std::io::Error),
    #[error("the socket collector returned an error: {0}")]
    CollectorOutput(String),
    #[cfg(not(target_os = "macos"))]
    #[error("active connection monitoring is currently supported only on macOS")]
    Unsupported,
}

#[cfg(target_os = "macos")]
pub fn scan_connections() -> Result<Vec<super::models::NetworkConnection>, PlatformError> {
    macos::scan()
}

#[cfg(not(target_os = "macos"))]
pub fn scan_connections() -> Result<Vec<super::models::NetworkConnection>, PlatformError> {
    Err(PlatformError::Unsupported)
}
