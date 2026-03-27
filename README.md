<p align="center">
  <img src="https://img.shields.io/badge/KumaMap-Network%20Visualization-3b82f6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTQiIGZpbGw9IiMzYjgyZjYiLz48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSI2IiBmaWxsPSIjMGEwYTBhIi8+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMyIgZmlsbD0iIzYwYTVmYSIvPjwvc3ZnPg==&logoColor=white" alt="KumaMap" />
</p>

<h1 align="center">KumaMap</h1>

<p align="center">
  <strong>Interactive Network Infrastructure Mapping with Real-Time Uptime Kuma Integration</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Socket.IO-4-010101?style=flat-square&logo=socket.io" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/Leaflet-Maps-199900?style=flat-square&logo=leaflet" alt="Leaflet" />
  <img src="https://img.shields.io/badge/SQLite-Database-003B57?style=flat-square&logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss" alt="Tailwind" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License" />
</p>

<p align="center">
  <a href="#-features">Features</a> &bull;
  <a href="#-screenshots">Screenshots</a> &bull;
  <a href="#-quick-start">Quick Start</a> &bull;
  <a href="#-installation">Installation</a> &bull;
  <a href="#-architecture">Architecture</a> &bull;
  <a href="#-api">API</a> &bull;
  <a href="#-roadmap">Roadmap</a>
</p>

---

## What is KumaMap?

**KumaMap** transforms your [Uptime Kuma](https://github.com/louislam/uptime-kuma) monitoring data into stunning, interactive network maps. Drag monitors onto satellite maps, draw fiber/copper/wireless links between them, add security cameras with field-of-view cones, and watch everything update in real-time via WebSocket.

Built for **NOC teams**, **MSPs**, and **infrastructure engineers** who need visual network topology with live status monitoring.

---

## Features

### Real-Time Network Visualization
- **Live satellite maps** (OpenStreetMap / ArcGIS) with dark mode overlay
- **Pulse-animated nodes** that change color based on monitor status (UP/DOWN/PENDING/MAINTENANCE)
- **Smart link coloring** - links trace through waypoints to find real endpoints and reflect their status
- **Bezier curved connections** between nodes for professional-looking topology
- **Camera nodes** with adjustable field-of-view cones, rotation, lens presets, and color customization

### Uptime Kuma Integration
- **Socket.IO real-time** connection to Kuma (not polling)
- **Auto-sync monitors** - new sensors appear automatically
- **Group filtering** - assign Kuma groups to maps
- **Historical data** - Time Machine reads real heartbeat history from Kuma's database
- **Login with Kuma credentials** - single sign-on, no separate user management

### Infrastructure Designer
- **Drag & drop** monitors from side panel onto the map
- **Three link types**: Fiber (blue), Copper (green), Wireless (orange dashed)
- **Interface labels** on link endpoints (e.g., `ether1`, `sfp-sfpplus1`)
- **Waypoint nodes** for routing links around obstacles
- **Text labels** for annotations and area names
- **Camera nodes** with draggable rotation/range handles and lens presets (2.8mm to 12mm)
- **Context menu** (right-click) on every element for quick actions
- **Undo/Redo** (Ctrl+Z / Ctrl+Y)
- **Auto-save** toggle

### Time Machine
- **Vertical timeline** with real historical events from Kuma's database
- **Drag scrubber** to travel back in time and see past network state
- **Play mode** - auto-advances and pauses at DOWN events
- **Event markers** with hover tooltips showing monitor name, status change, and timestamp
- **Zoom to failing node** when clicking an event
- **Visual blur effect** during time travel scrubbing
- **Configurable range**: 1h, 2h, 6h, 24h with playback speed 1x/4x/16x

### Map Management
- **Multiple maps** per instance with search, filters, and sorting
- **Map types**: Real satellite map, uploaded image (floor plans), or grid
- **Export/Import** maps as JSON for backup and migration between instances
- **Kiosk/View mode** - fullscreen readonly URL per map (for NOC screens)
- **Dark overlay** with adjustable opacity on satellite imagery
- **Map style selector**: Dark, Satellite, Streets

### Additional Features
- **Toast notifications** (Sonner) when monitors go DOWN/UP
- **Status bar** showing live node/link counts and UP/DOWN summary
- **Sparkline charts** in node tooltips showing latency history
- **SNMP traffic labels** on links
- **MAC/IP fields** per node (visible on click)
- **Keyboard shortcuts**: Ctrl+S save, Ctrl+Z undo, Escape cancel, Delete remove

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 16 (App Router) | Fullstack React with API routes |
| **Frontend** | React 19 + TypeScript | UI components |
| **Maps** | Leaflet + React Leaflet | Interactive satellite/street maps |
| **Styling** | Tailwind CSS 4 | Utility-first dark theme |
| **Real-Time** | Socket.IO 4 | Bi-directional WebSocket (Kuma ↔ Server ↔ Browser) |
| **Database** | SQLite (better-sqlite3) | Map/node/edge persistence |
| **Notifications** | Sonner | Toast notifications |
| **Icons** | Lucide React | Premium icon set |
| **Custom Server** | tsx + Socket.IO | WebSocket server alongside Next.js |

### Architecture

```
┌─────────────────┐     Socket.IO      ┌──────────────────┐     Socket.IO      ┌─────────────┐
│   Uptime Kuma    │ ◄─────────────────► │   KumaMap Server │ ◄─────────────────► │   Browser    │
│  (port 3001)     │   heartbeats,       │   (port 3000)    │   kuma:monitors,   │  React App  │
│                  │   monitorList        │                  │   kuma:heartbeat   │             │
└─────────────────┘                     ├──────────────────┤                     └─────────────┘
                                        │  SQLite DB        │
                                        │  - Maps           │
                                        │  - Nodes          │
                                        │  - Edges          │
                                        │  - View State     │
                                        └──────────────────┘
```

---

## Quick Start

```bash
# Clone
git clone https://github.com/flavioGonz/kumamap.git
cd kumamap

# Install
npm install

# Configure
cat > .env.local << 'EOF'
KUMA_URL=http://127.0.0.1:3001
KUMA_USER=admin
KUMA_PASS=your_password
NEXT_PUBLIC_BASE_PATH=
EOF

# Build & Run
npx next build
NODE_ENV=production npx tsx server.ts
```

Open `http://localhost:3000` and login with your Kuma credentials.

---

## Installation

### Prerequisites

- **Node.js 18+** (22 recommended)
- **Uptime Kuma** running and accessible
- **Git**

### Step 1: Clone Repository

```bash
cd /opt
git clone https://github.com/flavioGonz/kumamap.git
cd kumamap
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment

```bash
cat > .env.local << 'EOF'
KUMA_URL=http://127.0.0.1:3001
KUMA_USER=admin
KUMA_PASS=your_kuma_password
NEXT_PUBLIC_BASE_PATH=
EOF
```

| Variable | Description | Example |
|----------|-------------|---------|
| `KUMA_URL` | Uptime Kuma URL (internal) | `http://127.0.0.1:3001` |
| `KUMA_USER` | Kuma login username | `admin` |
| `KUMA_PASS` | Kuma login password | `secretpass` |
| `NEXT_PUBLIC_BASE_PATH` | URL prefix (empty = root `/`) | `/maps` |

### Step 4: Build

```bash
npx next build
```

### Step 5: Start

```bash
# Foreground
NODE_ENV=production npx tsx server.ts

# Background (production)
nohup NODE_ENV=production npx tsx server.ts > /var/log/kumamap.log 2>&1 &
```

### Step 6: Auto-Start on Boot

```bash
# systemd (if available)
cat > /etc/systemd/system/kumamap.service << 'EOF'
[Unit]
Description=KumaMap Network Visualization
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/kumamap
ExecStart=/usr/local/bin/npx tsx server.ts
Restart=always
Environment=NODE_ENV=production
EnvironmentFile=/opt/kumamap/.env.local

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable kumamap
systemctl start kumamap
```

```bash
# Or rc.local (LXC containers without systemd)
echo 'cd /opt/kumamap && NODE_ENV=production nohup npx tsx server.ts > /var/log/kumamap.log 2>&1 &' >> /etc/rc.local
chmod +x /etc/rc.local
```

### Using a Base Path (e.g., `/maps`)

If you want KumaMap at `http://server:3000/maps` instead of root:

1. Set in `.env.local`:
   ```
   NEXT_PUBLIC_BASE_PATH=/maps
   ```

2. Update `next.config.ts`:
   ```ts
   const nextConfig: NextConfig = {
     basePath: "/maps",
     serverExternalPackages: ["better-sqlite3"],
   };
   ```

3. Rebuild: `npx next build`

---

## Updating

```bash
cd /opt/kumamap
pkill -f 'tsx server'
git pull
rm -rf .next
npx next build
NODE_ENV=production nohup npx tsx server.ts > /var/log/kumamap.log 2>&1 &
```

---

## API Reference

All endpoints are under `/api/` (or `/maps/api/` with basePath).

### Maps

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/maps` | List all maps with node/edge counts |
| `POST` | `/api/maps` | Create a new map |
| `GET` | `/api/maps/:id` | Get map with nodes and edges |
| `PUT` | `/api/maps/:id` | Update map metadata |
| `DELETE` | `/api/maps/:id` | Delete a map |
| `PUT` | `/api/maps/:id/state` | Save nodes, edges, and view state |
| `POST` | `/api/maps/:id/background` | Upload background image |
| `GET` | `/api/maps/:id/export` | Export map as JSON |
| `POST` | `/api/maps/import` | Import map from JSON |

### Kuma Proxy

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/kuma` | Get monitors and connection status |
| `GET` | `/api/kuma/timeline?hours=24` | Get historical events from Kuma DB |
| `GET` | `/api/kuma/history/:monitorId` | Get heartbeat history for a monitor |

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth` | Login with Kuma credentials |
| `DELETE` | `/api/auth` | Logout |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `kuma:monitors` | Server → Client | Full monitor list with live status |
| `kuma:heartbeat` | Server → Client | Individual heartbeat update |

---

## Node Types

| Type | Icon | Description |
|------|------|-------------|
| **Monitor Node** | Pulse circle | Linked to a Kuma monitor, shows live status |
| **Camera Node** | Square with compass | Security camera with FOV cone, rotation, lens |
| **Waypoint** | Small gray dot | Routing point for links (transparent to status) |
| **Text Label** | Floating text | Annotation, area name, or description |

## Link Types

| Type | Style | Color |
|------|-------|-------|
| **Copper** | Solid line | Green `#22c55e` |
| **Fiber** | Solid line | Blue `#3b82f6` |
| **Wireless** | Dashed line | Orange `#f97316` |

Links automatically turn **red and pulse** when any real endpoint is DOWN, tracing through waypoint chains.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save map |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Escape` | Cancel link mode / close modal |
| `Delete` | Remove selected element |
| `Right-click` | Context menu |

---

## Deployment Examples

### Same server as Kuma (LXC container)

```bash
# Kuma on port 3001, KumaMap on port 3000
KUMA_URL=http://127.0.0.1:3001
```

### Remote Kuma server

```bash
# KumaMap connects to Kuma on another machine
KUMA_URL=http://192.168.1.50:3001
```

### Multiple instances

Each KumaMap instance is independent with its own SQLite database. Export/import JSON to share maps between instances.

---

## Changelog

### v1.0.0 (2026-03-27)

- Interactive satellite/street/dark maps (Leaflet)
- Real-time Socket.IO connection to Uptime Kuma
- Drag & drop monitor nodes with live pulse status
- Fiber/Copper/Wireless link types with Bezier curves
- Smart link status tracing through waypoint chains
- Camera nodes with adjustable FOV, rotation, and lens presets
- Time Machine with real Kuma DB history
- Text labels and annotations
- Export/Import maps as JSON
- Kiosk/View mode for NOC screens
- Login with Kuma credentials
- Dark overlay for satellite maps
- SNMP traffic labels on links
- Context menu for all elements
- Undo/Redo support
- Auto-save toggle
- Responsive toast notifications

---

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with <img src="https://img.shields.io/badge/Claude_Code-Anthropic-cc785c?style=flat-square" alt="Claude Code" /> by <a href="https://github.com/flavioGonz">@flavioGonz</a>
</p>
