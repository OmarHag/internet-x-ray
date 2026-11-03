export type Protocol = "TCP" | "UDP";

export interface NetworkConnection {
  id: string;
  pid: number;
  processName: string;
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  protocol: Protocol;
  state: string;
  scope: ConnectionScope;
}

export type ConnectionScope = "INTERNET" | "LAN" | "LOCAL" | "LISTENING";

export interface SystemInfo {
  hostname: string;
  operatingSystem: string;
  interfaceName: string;
  localIp: string;
}

export type SortField = "processName" | "remoteAddress" | "remotePort";
