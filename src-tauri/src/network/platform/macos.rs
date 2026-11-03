use std::{collections::HashSet, net::IpAddr, process::Command};

use super::PlatformError;
use crate::network::models::{ConnectionScope, NetworkConnection, Protocol};

#[derive(Default)]
struct ProcessRecord { pid: u32, name: String }

#[derive(Default)]
struct SocketRecord {
    protocol: Option<Protocol>,
    endpoint: Option<String>,
    state: Option<String>,
}

pub fn scan() -> Result<Vec<NetworkConnection>, PlatformError> {
    let output = Command::new("/usr/sbin/lsof")
        .args(["-nP", "-iTCP", "-iUDP", "-a", "-FpcfPnT"])
        .output()?;
    if !output.status.success() {
        return Err(PlatformError::CollectorOutput(String::from_utf8_lossy(&output.stderr).trim().to_owned()));
    }
    Ok(parse_lsof(&String::from_utf8_lossy(&output.stdout)))
}

fn parse_lsof(input: &str) -> Vec<NetworkConnection> {
    let mut process = ProcessRecord::default();
    let mut socket = SocketRecord::default();
    let mut rows = Vec::new();

    for line in input.lines() {
        if line.len() < 2 { continue; }
        let (field, value) = line.split_at(1);
        if field == "p" || field == "f" { finish_socket(&process, &mut socket, &mut rows); }
        match field {
            "p" => process = ProcessRecord { pid: value.parse().unwrap_or_default(), name: String::new() },
            "c" => process.name = value.to_owned(),
            "P" => socket.protocol = Some(if value == "UDP" { Protocol::Udp } else { Protocol::Tcp }),
            "n" => socket.endpoint = Some(value.to_owned()),
            "T" if value.starts_with("ST=") => socket.state = Some(value[3..].to_owned()),
            _ => {}
        }
    }
    finish_socket(&process, &mut socket, &mut rows);

    let mut seen = HashSet::new();
    rows.retain(|row| seen.insert(row.id.clone()));
    rows.sort_by_key(|row| (row.process_name.to_lowercase(), row.pid, row.local_port));
    rows
}

fn finish_socket(process: &ProcessRecord, socket: &mut SocketRecord, rows: &mut Vec<NetworkConnection>) {
    let Some(endpoint) = socket.endpoint.take() else {
        *socket = SocketRecord::default();
        return;
    };
    let protocol = socket.protocol.unwrap_or(Protocol::Tcp);
    let state = socket.state.take().unwrap_or_else(|| match protocol { Protocol::Udp => "OPEN".into(), Protocol::Tcp => "UNKNOWN".into() });
    let (local, remote) = endpoint.split_once("->").map_or((endpoint.as_str(), None), |(local, remote)| (local, Some(remote)));
    let (local_address, local_port) = parse_endpoint(local);
    let (remote_address, remote_port) = remote.map(parse_endpoint).unwrap_or_default();
    let scope = classify(&remote_address, &state);
    let id = format!("{}-{:?}-{local_address}:{local_port}-{remote_address}:{remote_port}", process.pid, protocol);
    rows.push(NetworkConnection {
        id, pid: process.pid, process_name: fallback_name(&process.name), local_address,
        local_port, remote_address, remote_port, protocol, state, scope,
    });
    *socket = SocketRecord::default();
}

fn classify(remote: &str, state: &str) -> ConnectionScope {
    if state == "LISTEN" || remote.is_empty() { return ConnectionScope::Listening; }
    let normalized = remote.split('%').next().unwrap_or(remote);
    let Ok(ip) = normalized.parse::<IpAddr>() else { return ConnectionScope::Internet; };
    if ip.is_loopback() { return ConnectionScope::Local; }
    match ip {
        IpAddr::V4(ip) if ip.is_private() || ip.is_link_local() => ConnectionScope::Lan,
        IpAddr::V6(ip) if ip.is_unique_local() || ip.is_unicast_link_local() => ConnectionScope::Lan,
        _ => ConnectionScope::Internet,
    }
}

fn parse_endpoint(raw: &str) -> (String, u16) {
    let raw = raw.trim();
    if raw == "*:*" { return ("*".into(), 0); }
    if raw.starts_with('[') {
        if let Some(close) = raw.rfind(']') {
            let address = raw.get(1..close).unwrap_or_default().to_owned();
            let port = raw.get(close + 2..).and_then(|p| p.parse().ok()).unwrap_or_default();
            return (address, port);
        }
    }
    raw.rsplit_once(':').map(|(address, port)| (address.to_owned(), port.parse().unwrap_or_default())).unwrap_or((raw.to_owned(), 0))
}

fn fallback_name(name: &str) -> String { if name.is_empty() { "Unknown".into() } else { name.into() } }

#[cfg(test)]
mod tests {
    use super::{classify, parse_endpoint, parse_lsof};
    use crate::network::models::ConnectionScope;

    #[test] fn parses_ipv4() { assert_eq!(parse_endpoint("10.0.0.1:5353"), ("10.0.0.1".into(), 5353)); }
    #[test] fn parses_ipv6() { assert_eq!(parse_endpoint("[fe80::1]:443"), ("fe80::1".into(), 443)); }
    #[test] fn classifies_destinations() {
        assert_eq!(classify("127.0.0.1", "ESTABLISHED"), ConnectionScope::Local);
        assert_eq!(classify("192.168.1.1", "ESTABLISHED"), ConnectionScope::Lan);
        assert_eq!(classify("104.18.32.47", "ESTABLISHED"), ConnectionScope::Internet);
        assert_eq!(classify("", "LISTEN"), ConnectionScope::Listening);
    }
    #[test] fn waits_for_state_and_deduplicates_shared_socket() {
        let input = "p42\ncExample\nf7\nPTCP\nn127.0.0.1:5000\nTST=LISTEN\nf8\nPTCP\nn127.0.0.1:5000\nTST=LISTEN\nf9\nPTCP\nn192.168.1.2:51000->8.8.8.8:443\nTST=ESTABLISHED";
        let rows = parse_lsof(input);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].state, "LISTEN");
        assert_eq!(rows[0].scope, ConnectionScope::Listening);
        assert_eq!(rows[1].state, "ESTABLISHED");
        assert_eq!(rows[1].remote_address, "8.8.8.8");
    }
}
