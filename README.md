
<!-- screenshot: vista principal del mapa con nodos y links -->

<p align="center">
  <img src="https://img.shields.io/badge/KumaMap-Visualizaci%C3%B3n%20de%20Red-3b82f6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTQiIGZpbGw9IiMzYjgyZjYiLz48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSI2IiBmaWxsPSIjMGEwYTBhIi8+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMyIgZmlsbD0iIzYwYTVmYSIvPjwvc3ZnPg==&logoColor=white" alt="KumaMap" />
</p>

<h1 align="center">KumaMap</h1>

<p align="center">
  <strong>Mapeo interactivo de infraestructura de red con monitoreo en tiempo real via Uptime Kuma</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Socket.IO-4-010101?style=flat-square&logo=socket.io" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/Leaflet-Mapas-199900?style=flat-square&logo=leaflet" alt="Leaflet" />
  <img src="https://img.shields.io/badge/ReactFlow-Diagramas-ff0072?style=flat-square" alt="ReactFlow" />
  <img src="https://img.shields.io/badge/SQLite-Base%20de%20Datos-003B57?style=flat-square&logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/Zod-4-3E67B1?style=flat-square&logo=zod" alt="Zod" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Licencia-MIT-green?style=flat-square" alt="MIT License" />
</p>

<p align="center">
  <a href="#-que-es-kumamap">Que es</a> &bull;
  <a href="#-funcionalidades">Funcionalidades</a> &bull;
  <a href="#-inicio-rapido">Inicio Rapido</a> &bull;
  <a href="#-instalacion-completa">Instalacion</a> &bull;
  <a href="#-actualizacion">Actualizacion</a> &bull;
  <a href="#-arquitectura">Arquitectura</a> &bull;
  <a href="#-api">API</a> &bull;
  <a href="#-hoja-de-ruta">Hoja de Ruta</a>
</p>

---

## Que es KumaMap?

**KumaMap** transforma los datos de monitoreo de [Uptime Kuma](https://github.com/louislam/uptime-kuma) en mapas de red interactivos y visualmente impactantes. Arrastra monitores sobre mapas satelitales, dibuja enlaces de fibra/cobre/wireless/VPN entre ellos, agrega camaras de seguridad con conos de vision, y observa todo actualizandose en tiempo real via WebSocket.

Construido para **equipos NOC**, **MSPs**, **ISPs** e **ingenieros de infraestructura** que necesitan topologia visual de red con monitoreo de estado en vivo.

<!-- screenshot: lista de mapas con estado UP/DOWN en tiempo real -->

KumaMap ofrece mapas geolocalizados interactivos con soporte de **jerarquia de mapas** (mapa principal con submapas por sitio):

- **Mapa Dinamico (Leaflet)** — Nodos geolocalizados sobre mapas satelitales/oscuros/calles reales. Ideal para despliegues geograficos, tendidos de fibra, y cobertura de camaras.
- **Submapas por sitio** — Cada nodo del mapa principal puede tener uno o varios mapas vinculados. Doble clic sobre el nodo abre el mapa del sitio directamente.
- **Vista Kiosco** — URL de solo lectura para pantallas NOC, con navegacion entre submapas integrada.

---

## Funcionalidades

<!-- screenshot: mapa con nodos UP/DOWN pulsando, links de colores -->

### Visualizacion de Red en Tiempo Real
- **Mapas satelitales en vivo** (OpenStreetMap / ArcGIS / CartoDB Dark) con superposicion oscura ajustable
- **Nodos con pulso animado** que cambian de color segun estado del monitor (UP/DOWN/PENDING/MANTENIMIENTO)
- **Coloreo inteligente de enlaces** — los links rastrean waypoints para encontrar endpoints reales y reflejar su estado
- **Conexiones con curvas Bezier** entre nodos para topologia de aspecto profesional
- **Nodos de camara** con conos de campo de vision ajustables, rotacion, presets de lente, y personalizacion de color
- **Indicador LIVE/OFF** en la barra superior con estado de conexion a Kuma en tiempo real
- **Tooltip de downtime animado** — burbuja anclada sobre nodos caídos con contador `hh:mm:ss` en tiempo real y fecha/hora de inicio de la caída; resplandor rojo pulsante

### Integracion con Uptime Kuma
- **Conexion Socket.IO en tiempo real** (no polling)
- **Auto-sincronizacion de monitores** — nuevos sensores aparecen automaticamente
- **Filtrado por grupo** — asigna grupos de Kuma a mapas especificos
- **Datos historicos** — Time Machine lee el historial real de heartbeats de la base de datos de Kuma
- **Login con credenciales Kuma** — inicio de sesion unico, sin gestion de usuarios separada

### Disenador de Infraestructura
- **Drag & drop** de monitores desde el panel lateral al mapa
- **Cuatro tipos de enlace**: Fibra (azul), Cobre (verde), Wireless (naranja punteado), VPN (azul con circulos animados)
- **Etiquetas de interfaz** en endpoints de enlace (ej: `ether1`, `sfp-sfpplus1`)
- **Nodos waypoint** para enrutar enlaces alrededor de obstaculos
- **Etiquetas de texto** para anotaciones y nombres de areas
- **Nodos de camara** con handles arrastrables de rotacion/rango y presets de lente (2.8mm a 12mm)
- **Transmision de camaras** — configuracion de stream MJPEG, Snapshot, o Web/iframe con visor integrado
- **Menu contextual** (clic derecho) en cada elemento para acciones rapidas
- **Cambio de iconos** — mas de 40 iconos organizados por categoria (red, seguridad, dispositivos, infra, compute)
- **Tamano personalizable** por nodo — 6 presets + slider libre (0.4x a 3.0x)
- **Deshacer/Rehacer** (Ctrl+Z / Ctrl+Y)
- **Auto-guardado** con toggle en la barra superior
- **Modo edicion** — toggle para ocultar/mostrar herramientas de edicion

### Diseñador de Racks (v1.7.0+)
- **Gestión de inventario de racks** — visualización interactiva de dispositivos de red en formato U estándar
- **Nodo rack en el mapa** — el icono del rack muestra el peor estado del grupo: si algún dispositivo tiene monitor DOWN/PENDING, el rack pulsa en rojo/amarillo igual que un nodo individual
- **Tabla de puertos con editor inline** — al seleccionar un puerto en la tabla, el editor de propiedades se expande como acordeón debajo de la fila (no al final)
- **Tabbed interface** para organización de datos (Puertos / General)
- **Selector de puerto al crear links** — al conectar un rack con otro nodo, aparece un picker para elegir a qué dispositivo del rack vincular el link
- **Tipos de dispositivos** — Servidores, Switches, Patch Panels, Routers, UPS, PDU, bandejas de fibra, y más
- **Integración con Uptime Kuma** — asignar monitores a dispositivos para estado en vivo con colores y tooltips
- **Exportación múltiple** con modal rediseñado (tarjetas con color por formato):
  - **Word (.docx)** — Reportes profesionales formateados con tablas
  - **Excel (.xlsx)** — Libros de múltiples hojas con inventario y detalles de puertos
  - **PDF** — Abre el reporte en una nueva pestaña y lanza el diálogo de impresión del navegador
  - **Markdown (.md)** — Formato texto compatible con control de versiones
  - **PNG** — Imagen visual del rack para presentaciones
- **Configuración de puertos**:
  - Patch Panel: destino, dispositivo conectado, color y longitud de cable, tipo PoE
  - Switch: velocidad, VLAN, watts PoE, estado uplink
  - Router: tipo de interfaz (WAN/LAN/MGMT), dirección IP, notas
- **Bloqueo de rack** — prevenir cambios accidentales durante operaciones normales
- **Posicionamiento flexible** — ajustar altura de dispositivos (1U-48U+) e IPs de gestión

<!-- screenshot: time machine abierto con eventos DOWN en la línea de tiempo -->

### Time Machine
- **Linea de tiempo vertical** con eventos historicos reales de la base de datos de Kuma
- **Filtrado por mapa** — solo muestra eventos de los monitores ubicados en el mapa actual (no de otros mapas)
- **Arrastrar scrubber** para viajar en el tiempo y ver el estado pasado de la red
- **Modo reproduccion** — avanza automaticamente y pausa en eventos DOWN
- **Marcadores de eventos** con tooltips hover mostrando nombre del monitor, cambio de estado, y timestamp
- **Zoom al nodo afectado** al hacer clic en un evento
- **Efecto visual de blur** durante el scrubbing de tiempo
- **Rango configurable**: 1h, 2h, 6h, 12h, 24h, 48h, 72h, 7d con velocidad de reproduccion 1x/2x/4x/8x/16x/32x

<!-- screenshot: modal de reporte de eventos con barra de uptime -->

### Reporte de Eventos
- **Modal profesional** con barra de uptime de 48 slots mostrando periodos UP/DOWN
- **Sistema de calificacion** — Excelente, Muy Bueno, Bueno, Aceptable, Bajo, Critico
- **Pestanas** — Vista general, Eventos, Downtimes
- **Estadisticas detalladas** — rango de ping, conteo de checks, duracion de caidas
- **Tags del monitor** desde Kuma

- **Barra lateral de controles**: Nueva barra vertical a la derecha con Zoom y botones de visibilidad (Nodos, Links, Cámaras, FOV, Etiquetas)
- **Estatus de Salud en Vivo**: El listado de mapas muestra el conteo de nodos UP/DOWN en tiempo real
- **Backup Masivo**: Exportar e Importar todos los mapas de una sola vez con ventana de previsualización
- **Gestion Unificada de Nodos**: Modal único para configurar Nombre, MAC, IP, Credenciales, Color y visibilidad de etiquetas
- **Superposicion oscura** con opacidad ajustable sobre imagenes satelitales
- **Selector de estilo**: Oscuro, Satelite, Calles
- **Rotacion de mapa** con slider (-180 a +180 grados)

### Funcionalidades Adicionales
- **Notificaciones toast** (Sonner) cuando monitores cambian a DOWN/UP
- **Barra de estado** mostrando conteo de nodos/links en vivo y resumen UP/DOWN
- **Graficos sparkline** en tooltips de nodos mostrando historial de latencia
- **Etiquetas de trafico SNMP** en enlaces con formato de ancho de banda
- **Campos MAC/IP** por nodo (visible al hacer clic)
- **Poligonos/Zonas** — dibuja areas con color y opacidad personalizable
- **Busqueda de direcciones** con geocodificacion (Nominatim)
- **Reloj del mapa** en tiempo real con efecto flash al viajar en el tiempo

---

## Stack Tecnologico

| Capa | Tecnologia | Proposito |
|------|-----------|-----------|
| **Framework** | Next.js 16 (App Router) | Fullstack React con API routes |
| **Frontend** | React 19 + TypeScript 5 | Componentes UI |
| **Mapas** | Leaflet | Mapas interactivos satelital/calles/oscuro |
| **Diagramas** | ReactFlow (xyflow) | Editor de topologia tipo grilla |
| **Estilos** | Tailwind CSS 4 | Tema oscuro utility-first |
| **Tiempo Real** | Socket.IO 4 | WebSocket bidireccional (Kuma <-> Servidor <-> Navegador) |
| **Base de Datos** | SQLite (better-sqlite3) | Persistencia de mapas/nodos/enlaces |
| **Validacion** | Zod 4 | Validacion de schemas en API routes |
| **Notificaciones** | Sonner | Notificaciones toast |
| **Iconos** | Lucide React | Set de iconos premium (40+ iconos de infra) |
| **Servidor** | tsx + Socket.IO | Servidor WebSocket junto a Next.js |

---

## Arquitectura

```
                          Socket.IO                                    Socket.IO
┌─────────────────┐   heartbeats,      ┌──────────────────┐   kuma:monitors,     ┌─────────────────┐
│   Uptime Kuma   │   monitorList      │  KumaMap Server  │   kuma:heartbeat     │    Navegador     │
│   (puerto 3001) │ <================> │  (puerto 3000)   │ <==================> │   App React      │
│                 │                    │                  │                      │                  │
│  - Monitores    │                    │  - API REST      │                      │  - LeafletMap    │
│  - Heartbeats   │                    │  - WebSocket Hub │                      │  - MapListView   │
│  - Alertas      │                    │  - Auth Proxy    │                      │  - TimeMachine   │
└─────────────────┘                    │  - Zod Schemas   │                      │  - MonitorPanel  │
                                       ├──────────────────┤                      │  - MapClock      │
                                       │  SQLite DB       │                      │  - useKumaMonitors│
                                       │  ├─ maps         │                      │  - utils/*       │
                                       │  ├─ map_nodes    │                      └─────────────────┘
                                       │  ├─ map_edges    │
                                       │  └─ view_state   │
                                       └──────────────────┘
```

---

## Inicio Rapido

```bash
# Clonar
git clone https://github.com/flavioGonz/kumamap.git
cd kumamap

# Instalar dependencias
npm install

# Configurar
cat > .env.local << 'EOF'
KUMA_URL=http://127.0.0.1:3001
KUMA_USER=usuario_kuma
KUMA_PASS=password_kuma
EOF

# Compilar y ejecutar
npm run build
NODE_ENV=production npx tsx server.ts
```

Abri `http://localhost:3000` e inicia sesion con tus credenciales de Kuma.

---

## Instalacion Completa

### Requisitos Previos

- **Node.js 18+** (22 recomendado)
- **Uptime Kuma** corriendo y accesible
- **Git**
- **PM2** (recomendado para produccion)

### Paso 1: Clonar el Repositorio

```bash
cd /opt
git clone https://github.com/flavioGonz/kumamap.git
cd kumamap
```

### Paso 2: Instalar Dependencias

```bash
npm install
```

### Paso 3: Configurar Variables de Entorno

```bash
cat > .env.local << 'EOF'
KUMA_URL=http://127.0.0.1:3001
KUMA_USER=admin
KUMA_PASS=tu_contraseña_kuma
NEXT_PUBLIC_BASE_PATH=

# Opcional (Recomendado): Conexion directa a MySQL para historial / TimeMachine mas rapido
KUMA_DB_HOST=127.0.0.1
KUMA_DB_USER=kumamap_reader
KUMA_DB_PASSWORD=tu_password_mysql
KUMA_DB_NAME=kuma
EOF
```

| Variable | Descripcion | Ejemplo |
|----------|-------------|---------|
| `KUMA_URL` | URL interna de Uptime Kuma | `http://127.0.0.1:3001` |
| `KUMA_USER` | Usuario de login de Kuma | `admin` |
| `KUMA_PASS` | Contraseña de login de Kuma | `mipassword` |
| `KUMA_DB_HOST` | [MySQL] IP/Host de base de datos Kuma | `192.168.1.100` |
| `KUMA_DB_USER` | [MySQL] Usuario de SOLO LECTURA a conectar | `kumamap_reader` |
| `KUMA_DB_PASSWORD` | [MySQL] Contraseña del lector | `password_seguro` |
| `KUMA_DB_NAME` | [MySQL] Nombre original de la BD Kuma | `kuma` |
| `KUMA_DB_SOCKET` | [MySQL] Socket Unix para MariaDB embebido en Docker | `/home/nico/uptime-kuma-data/run/mariadb.sock` |

> ⚠️ **Prerequisito MySQL: crear el usuario de solo lectura**
> 
> Si habilitás la conexión directa a MySQL/MariaDB, antes de arrancar KumaMap debés crear el usuario lector. Usá el script incluido que detecta tu instalación automáticamente:
> 
> ```bash
> bash scripts/setup-db-user.sh
> ```
> 
> El script detecta automáticamente si usás:
> - **Uptime Kuma 2.0 con MariaDB embebido en Docker** (el caso más común)
> - **MySQL/MariaDB instalado directamente en el servidor**
> 
> Si preferís hacerlo manualmente, el comando varía según tu instalación:
> 
> ```bash
> # Kuma 2.0 Docker con MariaDB embebido (más común)
> docker exec -it uptime-kuma mariadb -u root --socket=/app/data/run/mariadb.sock
> 
> # MySQL/MariaDB externo o contenedor separado
> docker exec -it <nombre_contenedor_mysql> mysql -u root -p
> # o directamente: mysql -h <IP> -u root -p
> ```
> 
> Una vez dentro del prompt `MariaDB>` o `mysql>`:
> ```sql
> CREATE USER 'kumamap_reader'@'%' IDENTIFIED BY 'tu_password_mysql';
> GRANT SELECT ON kuma.* TO 'kumamap_reader'@'%';
> FLUSH PRIVILEGES;
> exit
> ```

### Paso 4: Compilar

```bash
npm run build
```

### Paso 5: Iniciar

```bash
# Primer plano (para pruebas)
NODE_ENV=production npx tsx server.ts

# Con PM2 (recomendado para produccion)
npm install -g pm2
pm2 start "npx tsx server.ts" --name kumamap
pm2 save
pm2 startup    # Configura auto-inicio en boot
```

### Paso 6: Auto-Inicio en Boot

**Opcion A: PM2 (recomendado)**

```bash
pm2 startup
pm2 save
```

**Opcion B: systemd**

```bash
cat > /etc/systemd/system/kumamap.service << 'EOF'
[Unit]
Description=KumaMap - Visualizacion de Red
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

**Opcion C: rc.local (contenedores LXC sin systemd)**

```bash
echo 'cd /opt/kumamap && NODE_ENV=production nohup npx tsx server.ts > /var/log/kumamap.log 2>&1 &' >> /etc/rc.local
chmod +x /etc/rc.local
```

### Usar un Base Path (ej: `/maps`)

Si queres que KumaMap este en `http://servidor:3000/maps` en lugar de la raiz:

1. Configura en `.env.local`:
   ```
   NEXT_PUBLIC_BASE_PATH=/maps
   ```

2. Actualiza `next.config.ts`:
   ```ts
   const nextConfig: NextConfig = {
     basePath: "/maps",
     serverExternalPackages: ["better-sqlite3"],
   };
   ```

3. Recompilar: `npm run build`

---

## Actualizacion

### Actualizacion via Git (recomendado)

La forma mas segura y rapida de actualizar KumaMap en produccion:

```bash
cd /opt/kumamap

# 1. Detener el servicio
pm2 stop kumamap

# 2. Traer los ultimos cambios
git pull origin master

# 3. Instalar dependencias nuevas (si las hay)
npm install

# 4. Recompilar
npm run build

# 5. Reiniciar
pm2 restart kumamap
```

**Comando rapido en una sola linea:**

```bash
cd /opt/kumamap && pm2 stop kumamap && git pull && npm install && npm run build && pm2 restart kumamap
```

### Si usas systemd en vez de PM2:

```bash
cd /opt/kumamap
systemctl stop kumamap
git pull
npm install
npm run build
systemctl start kumamap
```

### Si no usas gestor de procesos:

```bash
cd /opt/kumamap
pkill -f 'tsx server'
git pull
npm install
rm -rf .next
npm run build
NODE_ENV=production nohup npx tsx server.ts > /var/log/kumamap.log 2>&1 &
```

### Notas importantes sobre la actualizacion

- La **base de datos SQLite** (`kumamap.db`) no se ve afectada por `git pull` — tus mapas, nodos y enlaces se conservan intactos
- Los archivos `.env.local` y `next.config.ts` tampoco se sobreescriben (estan en `.gitignore`)
- Si hay conflictos de merge, podes forzar la actualizacion con:
  ```bash
  git stash
  git pull
  git stash pop   # recupera tus cambios locales si los hay
  ```
- Siempre verifica que el build termina sin errores antes de reiniciar el servicio

---

## Referencia de API

Todos los endpoints estan bajo `/api/` (o `/maps/api/` si usas basePath).

### Mapas

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| `GET` | `/api/maps` | Listar todos los mapas con conteo de nodos/enlaces |
| `POST` | `/api/maps` | Crear un nuevo mapa |
| `GET` | `/api/maps/:id` | Obtener mapa con nodos y enlaces |
| `PUT` | `/api/maps/:id` | Actualizar metadatos del mapa |
| `DELETE` | `/api/maps/:id` | Eliminar un mapa |
| `PUT` | `/api/maps/:id/state` | Guardar nodos, enlaces y estado de vista |
| `POST` | `/api/maps/:id/background` | Subir imagen de fondo |
| `GET` | `/api/maps/:id/export` | Exportar mapa como JSON |
| `POST` | `/api/maps/import` | Importar mapa desde JSON |

### Proxy Kuma

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| `GET` | `/api/kuma` | Obtener monitores y estado de conexion |
| `GET` | `/api/kuma/timeline?hours=24&monitorIds=1,5,12` | Obtener eventos historicos (filtrable por monitor) |
| `GET` | `/api/kuma/history/:monitorId` | Obtener historial de heartbeats de un monitor |

### Autenticacion

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| `POST` | `/api/auth` | Iniciar sesion con credenciales Kuma |
| `DELETE` | `/api/auth` | Cerrar sesion |

### Eventos WebSocket

| Evento | Direccion | Descripcion |
|--------|-----------|-------------|
| `kuma:monitors` | Servidor -> Cliente | Lista completa de monitores con estado en vivo |
| `kuma:heartbeat` | Servidor -> Cliente | Actualizacion individual de heartbeat |

---

<!-- screenshot: menu contextual de un nodo mostrando la opcion Mapas -->

## Tipos de Nodos

| Tipo | Icono | Descripcion |
|------|-------|-------------|
| **Nodo Monitor** | Circulo con pulso | Vinculado a un monitor Kuma, muestra estado en vivo |
| **Nodo Camara** | Cuadrado con compas | Camara de seguridad con cono FOV, rotacion, lente, y stream |
| **Nodo Submap** | Carpeta indigo | Enlace a submap; doble clic navega al mapa vinculado |
| **Waypoint** | Punto gris pequeno | Punto de enrutamiento para enlaces (transparente al estado) |
| **Etiqueta Texto** | Texto flotante | Anotacion, nombre de area, o descripcion |
| **Poligono/Zona** | Area coloreada | Zona delimitada con color y opacidad personalizable |

## Tipos de Enlace

| Tipo | Estilo | Color | Descripcion |
|------|--------|-------|-------------|
| **Cobre** | Linea solida | Verde `#22c55e` | Conexion por cable UTP/STP |
| **Fibra** | Linea solida | Azul `#3b82f6` | Conexion por fibra optica |
| **Wireless** | Linea punteada | Naranja `#f97316` | Enlace inalambrico |
| **VPN** | Circulos animados | Azul `#3b82f6` | Tunel VPN virtual |

Los enlaces automaticamente se vuelven **rojos y pulsan** cuando algun endpoint real esta DOWN, rastreando a traves de cadenas de waypoints.

---

## Iconos Disponibles

KumaMap incluye mas de 40 iconos organizados por categoria:

| Categoria | Iconos |
|-----------|--------|
| **Red** | Router, Switch, Puerto Ethernet, Cable, Wi-Fi/AP, Antena, Radio, Torre, Satelital, Senal, Internet |
| **Seguridad** | Firewall, Escudo, Seguridad OK, Alerta Seguridad, Candado |
| **Dispositivos** | Servidor, Camara IP, Impresora, Telefono IP, Smartphone, Monitor/PC, Escritorio |
| **Infraestructura** | UPS, Bateria, Energia, Enchufe, PDU, Rayo |
| **Compute** | CPU, Microchip, Circuito, Base de Datos, DB Activa, Disco, NAS, Servidor Config |
| **General** | Nube, Nube Config, Actividad |

---

## Atajos de Teclado

| Atajo | Accion |
|-------|--------|
| `Ctrl+S` | Guardar mapa |
| `Ctrl+Z` | Deshacer |
| `Ctrl+Y` | Rehacer |
| `Escape` | Cancelar modo link / cerrar modal |
| `Delete` | Eliminar elemento seleccionado |
| `Clic derecho` | Menu contextual |

---

## Ejemplos de Despliegue

### Mismo servidor que Kuma (contenedor LXC)

```bash
# Kuma en puerto 3001, KumaMap en puerto 3000
KUMA_URL=http://127.0.0.1:3001
```

### Servidor Kuma remoto

```bash
# KumaMap se conecta a Kuma en otra maquina
KUMA_URL=http://192.168.1.50:3001
```

### Multiples instancias

Cada instancia de KumaMap es independiente con su propia base de datos SQLite. Usa Exportar/Importar JSON para compartir mapas entre instancias.

### Despliegue para clientes remotos

```bash
# Instancia para Cliente A
KUMA_URL=http://192.168.99.122:3001
NEXT_PUBLIC_BASE_PATH=/maps

# Instancia para Cliente B
KUMA_URL=http://10.0.0.50:3001
NEXT_PUBLIC_BASE_PATH=/maps
```

---

## Changelog

### v1.6.0 (2026-04-04)

**Refactor: Modularizacion del Codigo**
- **`page.tsx` reducido de ~1200 a ~105 lineas**: la pagina principal ahora solo orquesta autenticacion y navegacion entre vistas.
- **`MapListView`** (nuevo componente): toda la logica de listado, busqueda, filtrado, creacion y gestion de mapas extraida a `src/components/MapListView.tsx`.
- **`useKumaMonitors`** (nuevo hook): conexion WebSocket con Kuma y notificaciones toast de cambio de estado extraidas a `src/hooks/useKumaMonitors.ts`.
- **`MapClock`** (nuevo componente): reloj del mapa con efecto Time Machine extraido a `src/components/network-map/MapClock.tsx`.
- **Utilidades extraidas a `src/utils/`**: `format.ts` (formateo de trafico/downtime), `status.ts` (colores de estado, lookup de monitor), `map-icons.ts` (40+ SVG icons y fabrica de marcadores Leaflet).

**Validacion de APIs con Zod**
- Todas las rutas API (`auth`, `maps`, `maps/[id]`, `maps/[id]/state`, `maps/import`) ahora validan el body con schemas Zod.
- Schemas centralizados en `src/lib/validation.ts` para consistencia y reutilizacion.
- Respuestas de error mejoradas con detalles de validacion (`details: parsed.error.flatten()`).

### v1.5.0 (2026-04-02)

**Jerarquia de Mapas**
- **Submapas**: cada mapa puede tener submapas hijos. La lista principal muestra jerarquia con expand/collapse.
- **Mapas vinculados a nodos**: cualquier nodo puede tener uno o varios mapas asociados. Clic derecho → "Mapas" abre el modal de gestion. Doble clic navega directamente al mapa del sitio (en kiosco, abre el primero vinculado).
- **Nodo Submap**: nuevo tipo de nodo especial `_submap` con icono de carpeta para vincular submapas visualmente en el mapa.
- **Boton Submap** en toolbar: inserta un nodo _submap eligiendo un mapa existente del picker.

**Gestion de Mapas**
- **Importar mapa en editor**: boton "Importar" en toolbar copia nodos y links de otro mapa al mapa actual (IDs remapeados para evitar colisiones).
- **Copiar ubicacion**: reemplaza el boton "Abrir" en la lista. Copia al portapapeles el centro geografico y las coordenadas de todos los nodos del mapa.
- **Se eliminaron los mapas tipo Grilla**: solo se soportan mapas tipo Mapa (Leaflet) e Imagen.

**Correcciones**
- Fix: boton editar nombre de submaps anidados no funcionaba (input inline ahora aparece correctamente en filas hijas).
- Fix: URL kiosko ahora usa `apiUrl()` correctamente sin prefijo `/maps/` hardcodeado.

<!-- screenshot: modal de mapas vinculados a un nodo -->

### v1.4.0 (2026-03-31) - Estable

**Interfaz y Controles**
- **Barra Lateral de Controles**: Se movieron los controles de visibilidad y zoom a una barra vertical en la parte inferior derecha (estilo Google Maps) para liberar espacio en el TopBar.
- **Ocultacion Total**: El toggle de etiquetas ahora oculta no solo los nombres de nodos, sino también etiquetas de interfaces, tráfico SNMP y polígonos.
- **Modal Unificado**: Se integró la edición de Nombre, IP, MAC y Credenciales (custom_data) en una sola ventana de edición de nodo.
- **Selector de Color**: Posibilidad de asignar colores personalizados a cada nodo individualmente.

**Gestion de Mapas y Backup**
- **Dashboard de Estatus**: La lista principal de mapas ahora muestra una columna de "Estado" con el conteo en vivo de nodos UP/DOWN/PENDING (calculado mediante monitorIds).
- **Importacion Masiva con Preview**: Nuevo modal de importación que detecta si el archivo es un mapa individual o un backup masivo, mostrando un resumen de lo que se va a importar antes de confirmar.
- **Exportacion Masiva**: Botón para bajar todos los mapas de la instancia en un único archivo JSON.

**Estabilidad y Produccion**
- **Ruta Raiz por Defecto**: Se restauró la compatibilidad con el acceso desde la raíz (`/`) desactivando el prefijo `/maps` por defecto en builds de producción.
- **Fix Credentials**: Corrección de bugs en la cadena de autenticación Socket.IO que fallaba con ciertos caracteres especiales.
- **Build Typescript**: Correcciones de tipos en `LeafletMapView.tsx` para asegurar despliegues limpios en CI/CD.

### v1.3.0 (2026-03-31)

**TimeMachine — Mini Calendario de Incidentes**
- Nuevo mini calendario visual en el panel de Rango de Time Machine
- Los dias con eventos DOWN se marcan en rojo con un punto indicador
- Al hacer clic en un dia marcado se aplica automaticamente ese rango de 24h
- Nuevo endpoint `GET /api/kuma/timeline/summary` que consulta MySQL para obtener fechas con incidentes en los ultimos 90 dias de forma eficiente

**Integracion MySQL Directa (Uptime Kuma 2.0)**
- Nuevo modulo `src/lib/kuma-db.ts` con conexion via pool `mysql2` a la base de datos de Kuma
- El endpoint `/api/kuma/timeline` ahora usa MySQL directamente (hasta 90 dias de historial) con fallback a Socket.IO
- Fix: se agrego validacion de array vacio en `fetchHeartbeatsFromDb` para evitar error SQL `IN ()`
- `mysql2` agregado a `serverExternalPackages` en `next.config.ts` para evitar error de build en Turbopack
- Script `scripts/setup-db-user.sh` para creacion automatica del usuario de solo lectura (detecta Kuma 2.0 Docker embebido y MySQL local)

**Autenticacion**
- Fix critico: el login ya no abre una nueva conexion Socket.IO a Kuma por cada intento (causaba timeout de 8s en Kuma 2.0)
- La autenticacion ahora valida contra `KUMA_USER`/`KUMA_PASS` del entorno, que ya es verificada por el servidor principal

**Configuracion y Despliegue**
- `src/lib/api.ts`: `apiUrl()` ahora respeta `NEXT_PUBLIC_BASE_PATH` del entorno en lugar de tener `/maps` hardcodeado
- `next.config.ts`: soporte para `allowedDevOrigins` para desarrollo remoto sin bloqueos de CORS
- README actualizado con instrucciones detalladas para MySQL embebido de Kuma 2.0 y script de setup

### v1.2.0 (2026-03-29)

- Homogeneizacion visual: mapa grilla y mapa dinamico ahora comparten el mismo estilo
- Toggle de modo edicion en ambas vistas
- Auto-guardado con debounce en vista grilla
- Indicador LIVE/OFF en barra de herramientas de grilla
- Tipo de enlace VPN con circulos azules animados
- Selector de tipo de enlace en menu contextual de grilla (Fibra/Cobre/Wireless/VPN)
- Fix: TimeMachine ahora filtra eventos solo para monitores del mapa actual
- API timeline: nuevo parametro `monitorIds` para filtrado server-side

### v1.1.0 (2026-03-28)

- Selector de iconos con mas de 40 iconos en 6 categorias
- Tamano personalizable por nodo (6 presets + slider)
- Configuracion y visor de stream de camaras (MJPEG, Snapshot, Web)
- Control manual de distancia focal en camaras
- Modal de reporte de eventos profesionalizado con barra de uptime y tabs
- Tipo de enlace VPN con animacion de circulos

### v1.0.0 (2026-03-27)

- Mapas interactivos satelital/calles/oscuro (Leaflet)
- Conexion Socket.IO en tiempo real con Uptime Kuma
- Nodos monitor drag & drop con estado en vivo con pulso
- Tipos de enlace Fibra/Cobre/Wireless con curvas Bezier
- Rastreo inteligente de estado de links a traves de cadenas de waypoints
- Nodos de camara con FOV ajustable, rotacion, y presets de lente
- Time Machine con historial real de la DB de Kuma
- Etiquetas de texto y anotaciones
- Exportar/Importar mapas como JSON
- Modo Kiosco/Vista para pantallas NOC
- Login con credenciales Kuma
- Superposicion oscura para mapas satelitales
- Etiquetas de trafico SNMP en enlaces
- Menu contextual para todos los elementos
- Soporte Deshacer/Rehacer
- Toggle de auto-guardado
- Notificaciones toast responsivas

---

## Contribuir

Las contribuciones son bienvenidas! Abri un issue o envia un pull request.

## Licencia

Licencia MIT — ver [LICENSE](LICENSE) para detalles.

---

<p align="center">
  Construido con <img src="https://img.shields.io/badge/Claude_Code-Anthropic-cc785c?style=flat-square" alt="Claude Code" /> por <a href="https://github.com/flavioGonz">@flavioGonz</a> &bull; <a href="https://favaro.com.uy">Favaro</a>
</p>
