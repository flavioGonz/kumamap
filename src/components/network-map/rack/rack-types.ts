// ── Shared Rack Designer Interfaces ──────────────────────────────────────────

export interface PatchPort {
  port: number;
  label: string;
  connected: boolean;
  destination?: string;
  cableLength?: string;
  cableColor?: string;
  isPoe?: boolean;
  poeType?: "802.3af" | "802.3at" | "802.3bt";
  connectedDevice?: string;
  macAddress?: string;
  notes?: string;
}

export interface SwitchPort {
  port: number;
  label: string;
  connected: boolean;
  speed?: "10" | "100" | "1G" | "10G";
  isPoe?: boolean;
  poeWatts?: number;
  connectedDevice?: string;
  macAddress?: string;
  vlan?: number;
  uplink?: boolean;
  notes?: string;
}

export interface RouterInterface {
  id: string;
  name: string;
  type: "WAN" | "LAN" | "MGMT" | "DMZ" | "VPN" | "other";
  ipAddress?: string;
  connected: boolean;
  notes?: string;
}

export interface PbxExtension {
  extension: string;
  name: string;
  ipPhone?: string;
  macAddress?: string;
  username?: string;
  password?: string;
  model?: string;
  location?: string;
  notes?: string;
  monitorId?: number | null;
  webUser?: string;
  webPassword?: string;
}

export interface PbxTrunkLine {
  id: string;
  provider: string;
  number: string;
  type: "SIP" | "PRI" | "BRI" | "FXO" | "FXS" | "IAX" | "other";
  channels?: number;
  sipServer?: string;
  sipUser?: string;
  sipPassword?: string;
  codec?: string;
  status?: "active" | "inactive" | "backup";
  notes?: string;
}

export interface RackDevice {
  id: string;
  unit: number;
  sizeUnits: number;
  label: string;
  type: "server" | "switch" | "patchpanel" | "ups" | "router" | "pdu" | "pbx" | "tray-fiber" | "tray-1u" | "tray-2u" | "cable-organizer" | "other";
  color?: string;
  monitorId?: number | null;
  ports?: PatchPort[];
  switchPorts?: SwitchPort[];
  routerInterfaces?: RouterInterface[];
  portCount?: number;
  managementIp?: string;
  model?: string;
  serial?: string;
  cableLength?: number;
  isPoeCapable?: boolean;
  notes?: string;
  // Bandeja de fibra
  fiberTrayType?: string;
  fiberCapacity?: number;
  fiberConnectorType?: string;
  fiberMode?: string;
  spliceCount?: number;
  // Organizador de cable
  mountedItems?: string;
  // PDU
  pduHasBreaker?: boolean;
  pduInputCount?: number;
  // PBX
  pbxExtensions?: PbxExtension[];
  pbxTrunkLines?: PbxTrunkLine[];
}

/** Status info returned by getDeviceStatusInfo helpers */
export interface StatusInfo {
  color: string;
  name: string;
}
