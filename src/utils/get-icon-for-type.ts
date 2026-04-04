export function getIconForType(type: string): string {
  switch (type) {
    case "http": case "keyword": case "json-query": return "globe";
    case "ping": case "smtp": return "wifi";
    case "port": case "steam": case "gamedig": return "server";
    case "dns": return "database";
    case "docker": case "tailscale-ping": return "cloud";
    case "push": case "mqtt": return "signal";
    case "radius": case "ldap": return "lock";
    case "snmp": return "router";
    case "sqlserver": case "postgres": case "mysql": case "mongodb": case "redis": return "database";
    case "grpc-keyword": return "servercog";
    default: return "activity";
  }
}
