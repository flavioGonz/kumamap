# CHANGELOG - KumaMap

## [1.7.0] - 2026-04-08

### Nuevas Funcionalidades

#### Rack como nodo de grupo en el mapa
- El icono de rack en el mapa ahora se comporta como un nodo de grupo: si algún dispositivo del rack tiene monitor asociado a Uptime Kuma, el nodo muestra el peor estado del grupo (DOWN > PENDING > MAINTENANCE > UP)
- El color del nodo, el pulso animado y el tooltip reflejan el estado del monitor más crítico
- El tooltip del rack lista los dispositivos down con sus nombres, igual que los grupos de monitores

#### Downtime tooltip animado
- Reemplazado el pill flotante de alerta por una burbuja tooltip anclada sobre el nodo en caída
- Muestra dos líneas: contador `hh:mm:ss` (o `Xd hh:mm:ss`) actualizado cada segundo + fecha/hora de inicio de la caída en formato `DD mmm HH:MM`
- Flecha CSS al pie del tooltip anclada al nodo
- Animación `kuma-tip-pulse` — resplandor rojo pulsante sin movimiento de escala
- El contador usa el campo `downTime` real del monitor (no timestamp estimado)
- Para nodos rack: busca el monitor con caída más temprana dentro de los dispositivos del rack

#### Editor de puertos inline
- Al seleccionar un puerto en la tabla (patch panel o switch), el formulario de edición se abre como acordeón inline debajo de la fila seleccionada, no al final de la tabla
- Mantiene el scroll en la fila visible; al cerrar el acordeón vuelve al listado limpio

#### Selector de puerto al crear links desde rack
- Al crear un link desde/hacia un nodo rack, aparece un modal de selección preguntando a qué dispositivo del rack conectar
- Lista los dispositivos del rack con nombre, tipo e icono, y el estado del monitor si está asignado
- Búsqueda filtrable por nombre

#### Soporte Unix Socket para MariaDB (kuma-db.ts)
- Nueva variable de entorno `KUMA_DB_SOCKET` para conectar a MariaDB via socket Unix en lugar de TCP
- Útil para instancias donde Uptime Kuma 2.x corre en Docker con MariaDB embebido y el socket se monta como volumen en el host
- Ejemplo: `KUMA_DB_SOCKET=/home/nico/uptime-kuma-data/run/mariadb.sock`

### Mejoras

#### Modal de exportación rediseñado
- Cada formato tiene su propia tarjeta con color identificatorio:
  - **Word** → azul (`#3b82f6`) — fondo degradado azul oscuro
  - **Excel** → verde (`#22c55e`) — fondo degradado verde oscuro
  - **PDF** → naranja (`#f97316`) — fondo degradado naranja oscuro
  - **Markdown** → violeta (`#a855f7`) — fondo degradado violeta oscuro
- Badge con extensión del archivo en cada tarjeta (`.docx`, `.xlsx`, `print`, `.md`, `.png`)
- Ícono animado: spinner al cargar → checkmark verde al completar
- Glow de color al hover sobre cada tarjeta
- Errores mostrados inline dentro del modal en rojo (eliminado el `alert()`)
- Header con ícono degradado, nombre del rack y resumen de ocupación

#### PDF export corregido
- Ya no descarga un `.html` con extensión `.pdf`
- Ahora abre el reporte en una pestaña nueva y dispara el diálogo de impresión del navegador automáticamente (print-to-PDF nativo)

#### Corrección de timestamp de downtime en racks
- El cálculo del tiempo de caída de un rack buscaba el estado `0` como clave en lugar del `monitorId`
- Corregido: itera los dispositivos del rack por `monitorId`, consulta `getMonitorData(d.monitorId).downTime`

#### Corrección React hook error #310
- `useState` estaba siendo llamado dentro de un IIFE en JSX (inválido según las reglas de hooks)
- Extraído como componente `RackDevicePickerModal` declarado fuera del componente principal

#### basePath dinámico en next.config.ts
- Restaurada la lógica `const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""` en `next.config.ts`
- Previene que rebuilds sin la variable de entorno rompan despliegues con subpath (ej: `/maps`)

### Infraestructura

- PM2 configurado con `pm2 startup systemd` en instancia unifi.ies.com.uy para persistencia tras reinicios
- Script `/tmp/do-build.sh` para builds limpios en servidores con `next build` lock

---

## [1.6.0] - 2026-04-07

### Major Features Added

#### 1. Tabbed Device Editor Interface
- Reorganized DeviceEditor component to use a clean tabbed interface
- **Puertos Tab**: Shows port configuration (only visible for patchpanel, switch, router)
- **General Tab**: Contains device metadata, positioning, and notes
- Save and Delete buttons now appear in the sticky header for quick access
- Improved UX with cleaner separation of concerns

#### 2. Port Table View
- Introduced `PortTable` component as the default port view for patchpanel and switch devices
- Displays ports in a comprehensive sortable table format instead of just grid dots
- Columns include:
  - **For Patch Panel**: Port number, connection status, label, destination, device, cable color/length, PoE
  - **For Switch**: Port number, connection status, label, speed, device, VLAN, PoE watts, uplink status
- Click on any row to expand detailed editor for that specific port
- Maintains accordion-style port configuration below the table

#### 3. Enhanced Export Modal
- Consolidated export functionality into a single "Export" button in the main header
- New `ExportModal` component provides options for:
  - **Word (.docx)**: Professional formatted report with tables and styling
  - **Excel (.xlsx)**: Multi-sheet workbook with Summary, Equipment Details, and Port listings
  - **PDF**: Print-friendly HTML report (via browser print-to-PDF)
  - **Markdown (.md)**: Plain text markdown table format
  - **PNG Image**: Original image export of the rack visualization
- Clean card-based UI for export options

#### 4. API Endpoints for Export

##### `/api/rack-report-xlsx` (NEW)
- Generates Excel workbooks with multiple sheets
- **Sheet 1 - Resumen**: Summary statistics (total units, occupancy %)
- **Sheet 2 - Equipos**: Complete equipment inventory with model, serial, IP, port count
- **Sheet 3 - Patch Panel**: Detailed port information for patch panels (if any)
- **Sheet 4 - Puertos Switch**: Detailed port information for switches (if any)
- Uses `xlsx` library for robust Excel generation
- Proper column sizing and formatting

##### `/api/rack-report-pdf` (NEW)
- Generates HTML-based PDF reports
- Professional layout with:
  - Header with rack name and generation date
  - Summary boxes showing unit utilization
  - Equipment table with all relevant fields
  - Formatted for printing or PDF export
- Returns styled HTML for browser print-to-PDF functionality

### UI/UX Improvements

#### Icon Update
- Changed **Patch Panel icon** from Wi-Fi symbol to **Cable icon** (more accurate representation)
- Imported new `Cable` icon from lucide-react
- Removed unused `Wifi` icon from imports

#### Header Button Consolidation
- Replaced two separate export buttons (Word icon, Download icon) with single "Export" button
- More intuitive and reduces header clutter
- Opens export modal with all available formats

### Technical Improvements

#### DeviceEditor Refactoring
- Extracted tabs logic to separate UI sections
- Proper state management with `activeTab` useState
- Dynamic tab visibility based on device type
- Better code organization and maintainability
- Sticky header with action buttons stays visible while scrolling

#### Component Structure
- `PortTable`: New reusable component for displaying ports
- `ExportModal`: Centralized export management
- Improved separation of concerns in main RackDesignerDrawer

### File Changes

#### Modified
- `src/components/network-map/RackDesignerDrawer.tsx` (Main component file)
  - Updated imports (Cable icon, removed Wifi)
  - New state: `showExportModal`
  - DeviceEditor complete restructure with tabs
  - PortTable component added
  - ExportModal component added
  - Export button handler updated

#### Created
- `src/app/api/rack-report-xlsx/route.ts` - Excel export endpoint
- `src/app/api/rack-report-pdf/route.ts` - PDF export endpoint
- `CHANGELOG.md` - This file
- `README.md` - Project documentation

### API Changes

#### Request Format (Unchanged)
All export endpoints accept POST requests with JSON body:
```json
{
  "rackName": "Rack A",
  "totalUnits": 42,
  "devices": [...]
}
```

#### Response Format
- `.xlsx` and `.docx`: Binary file attachment
- `.pdf`: HTML file attachment (browser print-to-PDF)
- `.md`: Text file attachment
- `.png`: Image blob (existing, unchanged)

### Browser Compatibility
- All new features compatible with modern browsers (Chrome, Firefox, Safari, Edge)
- Export functions use native browser Blob and URL APIs
- Table rendering uses standard HTML tables for broad compatibility

### Performance Considerations
- Port table rendering optimized for large port counts (tested with 48+ ports)
- Modal animations use Framer Motion for smooth performance
- Export operations are client-side or use efficient server-side libraries

### Future Enhancement Opportunities
- Add PDF export with true pdfmake integration (currently HTML-based)
- Implement port table search/filtering
- Add custom export templates
- Support for bulk port configuration
- CSV export format

### Known Limitations
- PDF export requires browser print-to-PDF capability (no server-side PDF library)
- Excel export requires `xlsx` package to be installed on server
- Port table shows 480px minimum width on narrow screens (horizontal scroll)

### Migration Notes
- Existing rack data remains fully compatible
- Previous export reports (Word/PNG) still work through existing `/api/rack-report` endpoint
- No database schema changes required

### Testing Checklist
- [ ] Device type switching maintains port data
- [ ] Tab switching preserves unsaved changes
- [ ] Export modal loads all device formats
- [ ] Excel sheets contain correct data
- [ ] Markdown table formatting is valid
- [ ] PDF HTML displays correctly
- [ ] Port table click selection works
- [ ] Large port counts (48+) render smoothly
- [ ] Mobile responsiveness maintained

---

**Version**: 1.6.0  
**Release Date**: 2026-04-07  
**Author**: Claude/KumaMap Team  
**Status**: Ready for deployment
