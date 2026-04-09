# Plan: Federación de instancias KumaMap

## Objetivo

Permitir que una instancia KumaMap (el **consumidor**) pueda importar sensores/monitores de otra instancia KumaMap remota (el **proveedor**), de modo que un mapa local muestre nodos con status en tiempo real provenientes de un Uptime Kuma ajeno.

Ejemplo real: la instancia de IES puede tener un mapa que muestre sensores de la instancia de Favaro, y viceversa.

---

## Arquitectura actual (referencia)

```
┌──────────────┐    Socket.IO     ┌──────────────────┐    Socket.IO/ws    ┌─────────────┐
│  Uptime Kuma │ ◄──────────────► │  KumaMap Server  │ ◄────────────────► │   Browser    │
│  (sensores)  │   kuma.ts        │  server.ts        │   /ws path         │  React app   │
└──────────────┘                  └──────────────────┘                    └─────────────┘
                                         │
                                    kumamap.db (SQLite)
                                    - network_maps
                                    - network_map_nodes (kuma_monitor_id → Kuma local)
                                    - network_map_edges
```

Hoy cada instancia es isla: un solo `KUMA_URL` configurado en `.env`, un solo `KumaClient` singleton, y los `kuma_monitor_id` de los nodos refieren exclusivamente a monitores de ese Kuma.

---

## Diseño propuesto

### Concepto: "Remote Sources"

Cada instancia KumaMap puede registrar N **fuentes remotas** (remote sources), donde cada fuente es otra instancia KumaMap que expone sus monitores vía un endpoint REST autenticado.

```
┌────────────────────┐          HTTPS/REST           ┌────────────────────┐
│  KumaMap FAVARO    │ ◄───────────────────────────► │  KumaMap IES       │
│  (consumidor)      │   GET /api/federation/monitors │  (proveedor)       │
│                    │   + API Key auth               │                    │
│  remote_sources:   │                                │  federation key:   │
│  - ies (url+key)   │                                │  - abc123...       │
└────────────────────┘                                └────────────────────┘
```

### ¿Por qué REST y no Socket.IO directo al Kuma remoto?

1. **Seguridad**: No exponemos credenciales de Uptime Kuma entre instancias. La autenticación es por API key de KumaMap.
2. **Firewall friendly**: Solo necesitamos que el puerto de KumaMap esté expuesto (ya lo está para el browser), no el de Uptime Kuma.
3. **Desacoplamiento**: Si la instancia remota cambia de Kuma, cambia DB, o evoluciona, el contrato REST se mantiene.
4. **Simplicidad**: Evitamos gestionar múltiples conexiones Socket.IO persistentes entre servidores.

---

## Componentes del plan

### FASE 1 — API de Federación (servidor proveedor)

**Archivos nuevos:**

#### 1.1 `src/app/api/federation/monitors/route.ts`

Endpoint que expone los monitores de esta instancia a consumidores autorizados.

```
GET /api/federation/monitors
Headers: X-Federation-Key: <api_key>
Response: {
  instance_id: string,        // UUID único de esta instancia
  instance_name: string,      // nombre amigable (ej: "IES")
  connected: boolean,
  monitors: KumaMonitor[]     // misma estructura que /api/kuma
}
```

- Verifica el `X-Federation-Key` contra la lista de keys autorizados.
- Retorna los monitores actuales del `KumaClient` singleton (datos ya en memoria, costo cero).
- Rate limit: 1 req/seg por IP.

#### 1.2 `src/app/api/federation/heartbeat/route.ts`

Endpoint ligero de health check + metadata.

```
GET /api/federation/heartbeat
Headers: X-Federation-Key: <api_key>
Response: {
  instance_id: string,
  instance_name: string,
  version: string,
  monitor_count: number,
  uptime: number
}
```

#### 1.3 Tabla `federation_keys` en kumamap.db

```sql
CREATE TABLE IF NOT EXISTS federation_keys (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,              -- "Llave para Favaro"
  key_hash TEXT NOT NULL UNIQUE,    -- SHA-256 del API key
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT,
  active INTEGER DEFAULT 1
);
```

- Las keys se generan desde el UI de admin del proveedor.
- Se almacena solo el hash (la key completa se muestra una vez al crearla).

---

### FASE 2 — Gestión de Remote Sources (servidor consumidor)

#### 2.1 Tabla `remote_sources` en kumamap.db

```sql
CREATE TABLE IF NOT EXISTS remote_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                -- "IES", "Favaro"
  url TEXT NOT NULL,                 -- "https://kumamap.ies.com.uy"
  api_key TEXT NOT NULL,             -- key en claro (la necesitamos para hacer requests)
  instance_id TEXT,                  -- UUID del remoto (se auto-descubre)
  poll_interval INTEGER DEFAULT 15,  -- segundos entre polls
  active INTEGER DEFAULT 1,
  last_seen_at TEXT,
  last_error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

#### 2.2 `src/lib/remote-sources.ts` — Poller de fuentes remotas

Clase `RemoteSourceManager`:

```typescript
class RemoteSourceManager {
  private sources: Map<string, RemoteSource>;      // id → config
  private monitors: Map<string, KumaMonitor[]>;    // source_id → monitors
  private intervals: Map<string, NodeJS.Timeout>;

  // Inicia polling periódico para cada source activo
  startAll(): void;

  // Agrega/quita sources en caliente
  addSource(source: RemoteSource): void;
  removeSource(id: string): void;

  // Retorna monitores remotos con prefijo de source
  getRemoteMonitors(): RemoteMonitor[];
}

interface RemoteMonitor extends KumaMonitor {
  _source_id: string;        // de qué remote source viene
  _source_name: string;      // "IES"
  _remote_monitor_id: number; // ID original en el Kuma remoto
  _is_remote: true;
}
```

**Lógica de polling:**
- Cada source se pollerea independientemente con `fetch()` a su `/api/federation/monitors`.
- Intervalo configurable (default 15s — no necesitamos 2s como local porque es cross-WAN).
- En caso de error, backoff exponencial (15s → 30s → 60s → 120s max).
- Los monitores remotos se almacenan en memoria igual que los locales.

#### 2.3 Integración en `server.ts`

```typescript
// server.ts — agregar después de inicializar KumaClient
const remoteMgr = getRemoteSourceManager();

setInterval(() => {
  const localMonitors = kuma.getMonitors();
  const remoteMonitors = remoteMgr.getRemoteMonitors();

  // Emitir juntos al browser
  io.emit("kuma:monitors", {
    connected: kuma.isConnected,
    monitors: localMonitors,
    remoteMonitors: remoteMonitors,   // ← NUEVO campo
  });
}, 2000);
```

El frontend recibe ambos arrays separados. No se mezclan para evitar colisiones de IDs.

---

### FASE 3 — Identificación de monitores en nodos

Hoy un nodo tiene `kuma_monitor_id: number | null` que referencia al Kuma local.

**Cambio propuesto** — agregar campo de resolución:

```sql
ALTER TABLE network_map_nodes
  ADD COLUMN monitor_source TEXT DEFAULT 'local';
  -- Valores: 'local' | remote_source.id
```

Cuando `monitor_source = 'local'`, `kuma_monitor_id` refiere al Kuma local (comportamiento actual).
Cuando `monitor_source = '<remote_source_id>'`, `kuma_monitor_id` refiere al ID del monitor en esa fuente remota.

**Interfaz SavedNode actualizada:**

```typescript
interface SavedNode {
  id: string;
  kuma_monitor_id: number | null;
  monitor_source: string;          // ← NUEVO: 'local' | remote_source.id
  label: string;
  x: number;
  y: number;
  icon: string;
  // ... resto igual
}
```

**Resolución en frontend:**

```typescript
function resolveMonitor(node: SavedNode, localMonitors: KumaMonitor[], remoteMonitors: RemoteMonitor[]): KumaMonitor | null {
  if (!node.kuma_monitor_id) return null;

  if (node.monitor_source === 'local' || !node.monitor_source) {
    return localMonitors.find(m => m.id === node.kuma_monitor_id) ?? null;
  }

  return remoteMonitors.find(
    m => m._source_id === node.monitor_source && m._remote_monitor_id === node.kuma_monitor_id
  ) ?? null;
}
```

---

### FASE 4 — UI de administración

#### 4.1 Panel de Remote Sources (consumidor)

Nueva sección en la página de configuración o como modal accesible desde el sidebar.

**Lista de fuentes:**
| Nombre | URL | Estado | Sensores | Última sync | Acciones |
|--------|-----|--------|----------|-------------|----------|
| IES | https://kumamap.ies.com.uy | 🟢 Online | 47 | hace 5s | Editar / Eliminar |

**Formulario de nueva fuente:**
- Nombre (texto libre)
- URL base (con botón "Probar conexión")
- API Key (pegado desde el proveedor)
- Intervalo de polling (slider: 10s — 60s)

#### 4.2 Panel de Federation Keys (proveedor)

**Lista de keys:**
| Label | Creada | Último uso | Estado | Acciones |
|-------|--------|------------|--------|----------|
| Para Favaro | 2026-04-01 | hace 2min | Activa | Revocar |

**Botón "Generar nueva key"** → genera UUID v4, muestra una vez, almacena hash SHA-256.

#### 4.3 Selector de sensor en nodo (consumidor)

Modificar el modal de asignación de sensor para mostrar dos secciones:

```
📡 Sensores locales
  ├── Web Server (UP, 12ms)
  ├── Database (UP, 3ms)
  └── ...

🌐 IES (remoto)
  ├── Firewall IES (UP, 45ms)
  ├── Switch Core (DOWN)
  └── ...

🌐 Favaro (remoto)
  ├── ...
```

Con un badge visual (🌐 o ícono de nube) para distinguir remotos de locales.

---

### FASE 5 — Indicadores visuales en el mapa

Los nodos con monitor remoto deben distinguirse visualmente:

- **Badge de nube** (pequeño ícono ☁ en la esquina del nodo) indicando que el dato viene de otra instancia.
- **Tooltip extendido**: al pasar sobre un nodo remoto, mostrar "Fuente: IES" además del status normal.
- **Color de status**: idéntico al local (verde/rojo/amarillo/gris) — el status es status, sin importar de dónde viene.
- **Indicador de desconexión**: si la fuente remota pierde conexión, los nodos remotos de esa fuente muestran un estado "desconocido" (gris con ícono de warning) en vez del último status conocido.

---

## Orden de implementación sugerido

```
Fase 1 (Proveedor)  ─┐
                      ├── Se pueden desarrollar en paralelo
Fase 2 (Consumidor) ─┘
                      │
                      ▼
            Fase 3 (DB + resolución)
                      │
                      ▼
            Fase 4 (UI admin)
                      │
                      ▼
            Fase 5 (Visual en mapa)
```

**Estimación de complejidad:**

| Fase | Archivos nuevos | Archivos modificados | Complejidad |
|------|----------------|---------------------|-------------|
| 1 | 2 routes + 1 migration | db.ts | Baja |
| 2 | remote-sources.ts | server.ts | Media |
| 3 | — | db.ts, LeafletMapView.tsx, SavedNode | Media |
| 4 | RemoteSourcesPanel.tsx, FederationKeysPanel.tsx | Sidebar/Settings | Media-Alta |
| 5 | — | LeafletMapView.tsx, renderNodes() | Baja |

---

## Seguridad

- **API Keys** hasheadas en DB, transmitidas por HTTPS.
- **No se exponen credenciales de Kuma** entre instancias.
- **Rate limiting** en endpoints de federación.
- **Keys revocables** desde el UI del proveedor con efecto inmediato.
- **Datos de solo lectura**: el consumidor nunca escribe en el proveedor.

## Performance

- **Polling vs WebSocket**: Para comunicación inter-instancia, polling cada 15s es suficiente y mucho más simple que mantener conexiones WS persistentes entre servidores. El impacto en red es mínimo (~2KB por response con 50 monitores).
- **Memoria**: Los monitores remotos se almacenan en el mismo patrón que los locales (Map en memoria). Con 5 fuentes remotas de 100 monitores cada una = 500 objetos extra en RAM (~200KB).
- **No hay cascada**: Una instancia solo expone sus monitores locales via federación, nunca re-expone monitores remotos que ella misma consume. Esto evita loops y cascadas.

## Limitaciones y consideraciones

- **Sin history remoto** en primera versión: solo status actual. El historial de heartbeats de monitores remotos requeriría un cache local o queries directas al Kuma remoto (futura mejora).
- **IDs únicos**: Los `kuma_monitor_id` pueden colisionar entre instancias (ambos Kuma podrían tener monitor ID=1). Por eso se distinguen con `monitor_source`.
- **Latencia**: El status de monitores remotos tiene delay adicional de hasta `poll_interval` segundos vs el local que es ~2s.
- **Disponibilidad**: Si la instancia remota cae, los nodos remotos se muestran como "sin conexión" — no afectan al resto del mapa.
