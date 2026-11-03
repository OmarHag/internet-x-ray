import { invoke } from "@tauri-apps/api/core";
import type { NetworkConnection, SystemInfo } from "./types";

const inTauri = () => "__TAURI_INTERNALS__" in window;

export async function getSystemInfo(): Promise<SystemInfo> {
  if (!inTauri()) throw new Error("System inspection is available in the desktop app. Run npm run tauri dev.");
  return invoke<SystemInfo>("get_system_info");
}

export async function getConnections(): Promise<NetworkConnection[]> {
  if (!inTauri()) throw new Error("Live connections require the Internet X-Ray desktop runtime.");
  return invoke<NetworkConnection[]>("get_connections");
}
