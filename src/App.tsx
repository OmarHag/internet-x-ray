import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, Clock3, Copy, Cpu, Gauge, Globe2, Info, Network, Radio, Search, Settings, SlidersHorizontal, Wifi } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { getConnections, getSystemInfo } from "./api";
import { activitySeries } from "./demoActivity";
import type { ConnectionScope, NetworkConnection, Protocol, SortField, SystemInfo } from "./types";

const nav = [
  ["Overview", Gauge], ["Connections", Network], ["Processes", Cpu],
  ["Destinations", Globe2], ["Traffic", BarChart3], ["History", Clock3],
] as const;

const emptyInfo: SystemInfo = { hostname: "—", operatingSystem: "—", interfaceName: "—", localIp: "—" };

function App() {
  const [system, setSystem] = useState<SystemInfo>(emptyInfo);
  const [connections, setConnections] = useState<NetworkConnection[]>([]);
  const [selected, setSelected] = useState<NetworkConnection | null>(null);
  const [query, setQuery] = useState("");
  const [protocol, setProtocol] = useState<"ALL" | Protocol>("ALL");
  const [scope, setScope] = useState<"ALL" | ConnectionScope>("ALL");
  const [sort, setSort] = useState<SortField>("processName");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getConnections();
      setConnections(next);
      // Keep the last snapshot visible if a short-lived socket closes while being inspected.
      setSelected(current => current ? next.find(c => c.id === current.id) ?? current : null);
      setError(null);
      setUpdated(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    getSystemInfo().then(setSystem).catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const visible = useMemo(() => connections
    .filter(c => protocol === "ALL" || c.protocol === protocol)
    .filter(c => scope === "ALL" || c.scope === scope)
    .filter(c => `${c.processName} ${c.pid} ${c.remoteAddress} ${c.remotePort} ${c.state} ${c.scope}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => String(a[sort]).localeCompare(String(b[sort]), undefined, { numeric: true })), [connections, protocol, query, scope, sort]);

  const selectedPresent = selected ? connections.some(c => c.id === selected.id) : false;

  const topProcesses = useMemo(() => Object.entries(connections.reduce<Record<string, number>>((counts, c) => {
    counts[c.processName] = (counts[c.processName] ?? 0) + 1; return counts;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5), [connections]);

  const summary = useMemo(() => ({
    apps: new Set(connections.map(c => `${c.pid}-${c.processName}`)).size,
    internet: connections.filter(c => c.scope === "INTERNET").length,
    nearby: connections.filter(c => c.scope === "LAN" || c.scope === "LOCAL").length,
    listening: connections.filter(c => c.scope === "LISTENING").length,
  }), [connections]);

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="mark"><Radio size={19}/></div><div><strong>INTERNET</strong><span>X—RAY</span></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{nav.map(([label, Icon], index) => <button className={index === 0 ? "active" : ""} disabled={label === "History"} key={label}><Icon size={16}/><span>{label}</span>{label === "History" && <small>SOON</small>}</button>)}</nav>
      <div className="sidebar-bottom"><button><Settings size={16}/>Settings</button><span>LOCAL ONLY · v0.1.0</span></div>
    </aside>

    <main>
      <header className="topbar">
        <div><span className="eyebrow">INTERNET X—RAY / OVERVIEW</span><h1>Network overview</h1></div>
        <div className="telemetry">
          <Metric label="MONITORING" value="Active" live />
          <Metric label="DEVICE" value={system.hostname} />
          <Metric label="INTERFACE" value={system.interfaceName} />
          <Metric label="LOCAL IP" value={system.localIp} mono />
          <Metric label="CONNECTIONS" value={String(connections.length)} mono />
        </div>
      </header>

      <div className="content">
        {error && <div className="error"><Activity size={16}/><div><b>COLLECTOR OFFLINE</b><span>{error}</span></div><button onClick={() => void refresh()}>Retry</button></div>}
        <section className="activity-panel">
          <div className="section-head"><div><span className="kicker">LIVE SIGNAL</span><h2>Network Activity</h2></div><div className="legend"><span className="down">DOWNLOAD <b>DEMO</b></span><span className="up">UPLOAD <b>DEMO</b></span></div></div>
          <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={activitySeries}><defs><linearGradient id="down" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#19d3c5" stopOpacity={0.25}/><stop offset="100%" stopColor="#19d3c5" stopOpacity={0}/></linearGradient></defs><Tooltip contentStyle={{background:"#11191d",border:"1px solid #26343a",fontSize:11}}/><Area type="monotone" dataKey="download" stroke="#19d3c5" fill="url(#down)" strokeWidth={2} dot={false}/><Area type="monotone" dataKey="upload" stroke="#70858d" fill="transparent" strokeWidth={1.5} dot={false}/></AreaChart></ResponsiveContainer></div>
        </section>

        <section className="glance" aria-label="Connection summary">
          <div className="glance-intro"><Info size={16}/><div><b>WHAT'S HAPPENING NOW</b><span>A plain-language summary of this scan</span></div></div>
          <GlanceStat value={summary.apps} label="Apps using the network" hint="Running programs with open sockets" />
          <GlanceStat value={summary.internet} label="Internet connections" hint="Talking outside your local network" accent />
          <GlanceStat value={summary.nearby} label="Local activity" hint="This Mac or nearby devices" />
          <GlanceStat value={summary.listening} label="Waiting for connections" hint="Services ready to receive traffic" />
        </section>

        <div className="lower-grid">
          <section className="connections-panel">
            <div className="section-head table-title"><div><span className="kicker">SOCKET INVENTORY</span><h2>Active Connections <em>{visible.length}</em></h2></div><span className="updated">{updated ? `UPDATED ${updated.toLocaleTimeString()}` : "WAITING FOR COLLECTOR"}</span></div>
            <div className="toolbar"><label><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an app, address, or port…"/></label><div className="protocols" title="Connection type">{(["ALL","TCP","UDP"] as const).map(p => <button className={protocol === p ? "selected" : ""} onClick={() => setProtocol(p)} key={p}>{p}</button>)}</div><label className="sort scope-filter"><select aria-label="Where the connection goes" value={scope} onChange={e => setScope(e.target.value as "ALL" | ConnectionScope)}><option value="ALL">Everywhere</option><option value="INTERNET">Internet</option><option value="LAN">Nearby network</option><option value="LOCAL">This Mac</option><option value="LISTENING">Waiting</option></select></label><label className="sort"><SlidersHorizontal size={14}/><select aria-label="Sort connections" value={sort} onChange={e => setSort(e.target.value as SortField)}><option value="processName">Sort: App</option><option value="remoteAddress">Sort: Address</option><option value="remotePort">Sort: Port</option></select></label></div>
            <div className="table-wrap"><table><thead><tr><th title="The application that opened this connection">App</th><th title="The operating system identifier for this running app">Process ID</th><th title="The address at the other end of the connection">Talking to</th><th title="The destination service number; 443 commonly means secure web traffic">Service port</th><th title="Whether traffic stays on this Mac, your local network, or reaches the internet">Where</th><th title="TCP is reliable and connected; UDP is lightweight and connectionless">Type</th><th title="What the socket is doing right now">Status</th></tr></thead><tbody>{visible.map(c => <tr key={c.id} className={selected?.id === c.id ? "selected-row" : ""} onClick={() => setSelected(c)}><td><span className="process-icon">{c.processName[0]?.toUpperCase() ?? "?"}</span>{c.processName}</td><td className="mono muted">{c.pid || "—"}</td><td className="mono address">{c.remoteAddress || "No remote device"}</td><td className="mono">{friendlyPort(c.remotePort)}</td><td><span className={`scope-tag ${c.scope.toLowerCase()}`}>{scopeLabel(c.scope)}</span></td><td><span className={`tag ${c.protocol.toLowerCase()}`}>{c.protocol}</span></td><td><span className={`state ${c.state === "ESTABLISHED" ? "ok" : ""}`} title={c.state}>{stateLabel(c.state)}</span></td></tr>)}</tbody></table>{loading && <Empty title="CHECKING NETWORK ACTIVITY" subtitle="Looking for apps that are communicating…"/>}{!loading && !visible.length && <Empty title="NOTHING MATCHES THESE FILTERS" subtitle="Try choosing Everywhere or clearing your search."/>}</div>
          </section>

          <aside className="details"><div className="section-head"><div><span className="kicker">INSPECTOR</span><h2>What this connection means</h2></div>{selected && !selectedPresent && <span className="ended">ENDED</span>}</div>{selected ? <ConnectionDetails connection={selected}/> : <div className="empty-details"><Wifi size={25}/><b>CHOOSE ANY ROW</b><span>We'll explain which app opened it, where it goes, and what the technical details mean.</span></div>}<div className="top-processes"><span className="kicker">APPS WITH THE MOST CONNECTIONS</span>{topProcesses.length ? topProcesses.map(([name, count], i) => <div key={name}><span className="rank">0{i+1}</span><b>{name}</b><em>{count}</em></div>) : <p>No process data available</p>}</div></aside>
        </div>
      </div>
    </main>
  </div>;
}

function Metric({label,value,live,mono}:{label:string;value:string;live?:boolean;mono?:boolean}) { return <div className="metric"><span>{label}</span><b className={mono ? "mono" : ""}>{live && <i/>}{value}</b></div>; }
function GlanceStat({value,label,hint,accent}:{value:number;label:string;hint:string;accent?:boolean}) { return <div className={`glance-stat ${accent ? "accent" : ""}`}><strong>{value}</strong><div><b>{label}</b><span>{hint}</span></div></div>; }
function Empty({title,subtitle}:{title:string;subtitle:string}) { return <div className="empty"><Activity size={24}/><b>{title}</b><span>{subtitle}</span></div>; }
function ConnectionDetails({connection:c}:{connection:NetworkConnection}) { const copy = () => void navigator.clipboard.writeText(c.remoteAddress); return <div className="detail-body"><p className="plain-explanation">{connectionExplanation(c)}</p><div className="process-detail"><span className="process-icon large">{c.processName[0]?.toUpperCase()}</span><div><b>{c.processName}</b><span>Process ID {c.pid || "Unavailable"}</span></div></div><dl><Detail label="WHERE IT GOES" value={scopeLabel(c.scope)}/><Detail label="FROM THIS ADDRESS" value={c.localAddress}/><Detail label="FROM PORT" value={c.localPort ? String(c.localPort) : "Unavailable"}/><Detail label="TO THIS ADDRESS" value={c.remoteAddress || "No remote device"}/><Detail label="SERVICE PORT" value={c.remotePort ? `${c.remotePort}${portMeaning(c.remotePort)}` : "Unavailable"}/><Detail label="CONNECTION TYPE" value={`${c.protocol}${c.protocol === "TCP" ? " · reliable connection" : " · lightweight traffic"}`}/><Detail label="CURRENT STATUS" value={`${stateLabel(c.state)} · ${c.state}`}/><Detail label="WHEN IT STARTED" value="Not available yet"/><Detail label="WHO OWNS THE ADDRESS" value="Coming in a later milestone"/><Detail label="TRAFFIC USED" value="Coming in Milestone 2"/></dl>{c.remoteAddress && <button className="copy" onClick={copy}><Copy size={14}/>Copy destination address</button>}</div>; }
function scopeLabel(scope: ConnectionScope) { return { INTERNET: "Internet", LAN: "Nearby network", LOCAL: "This Mac", LISTENING: "Waiting for connections" }[scope]; }
function stateLabel(state: string) { return ({ ESTABLISHED: "Connected", LISTEN: "Waiting", OPEN: "Open", UNKNOWN: "Checking" } as Record<string,string>)[state] ?? state.toLowerCase().replace(/_/g, " ").replace(/^./, (value: string) => value.toUpperCase()); }
function friendlyPort(port: number) { return port ? `${port}${portMeaning(port)}` : "—"; }
function portMeaning(port: number) { return ({ 53: " · DNS", 80: " · Web", 443: " · Secure web", 5228: " · Messaging" } as Record<number,string>)[port] ?? ""; }
function connectionExplanation(c: NetworkConnection) { if (c.scope === "LISTENING") return `${c.processName} is ready to receive a connection on this Mac. It is not currently talking to a remote device.`; if (c.scope === "LOCAL") return `${c.processName} is communicating with another service on this same Mac. This traffic does not leave your computer.`; if (c.scope === "LAN") return `${c.processName} is communicating with a device on your nearby local network.`; return `${c.processName} has an ${stateLabel(c.state).toLowerCase()} connection to an address on the internet${c.remotePort ? ` using service port ${c.remotePort}` : ""}.`; }
function Detail({label,value}:{label:string;value:string}) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
export default App;
