/**
 * Remote deploy targets for KumaMap instances.
 *
 * Each target is a server where KumaMap is deployed.
 * The deploy process runs: git pull → npm run build → pm2 restart kumamap
 *
 * Configure via environment variables in .env.local:
 *   DEPLOY_TARGETS='[{"id":"laguna","name":"Laguna Blanca","host":"10.0.0.1","user":"root"},{"id":"ies","name":"IES","host":"10.0.0.2","user":"root"}]'
 *
 * Or edit the FALLBACK_TARGETS below for a simpler setup.
 */

export interface DeployTarget {
  id: string;
  name: string;
  host: string;
  port?: number;
  user: string;
  path?: string;       // default: /opt/kumamap
  pm2Name?: string;    // default: kumamap
}

// Fallback targets if env var is not set — edit these directly
const FALLBACK_TARGETS: DeployTarget[] = [
  {
    id: "principal",
    name: "Principal",
    host: "192.168.99.122",
    user: "root",
    path: "/opt/kumamap",
    pm2Name: "kumamap",
  },
  // Add your remote clients here:
  // {
  //   id: "laguna",
  //   name: "Laguna Blanca",
  //   host: "192.168.x.x",
  //   user: "root",
  // },
  // {
  //   id: "ies",
  //   name: "IES",
  //   host: "192.168.x.x",
  //   user: "root",
  // },
];

export function getDeployTargets(): DeployTarget[] {
  const env = process.env.DEPLOY_TARGETS;
  if (env) {
    try {
      const parsed = JSON.parse(env) as DeployTarget[];
      return parsed.map((t) => ({
        ...t,
        port: t.port || 22,
        path: t.path || "/opt/kumamap",
        pm2Name: t.pm2Name || "kumamap",
      }));
    } catch {
      console.warn("[deploy] Failed to parse DEPLOY_TARGETS env var, using fallback");
    }
  }
  return FALLBACK_TARGETS.map((t) => ({
    ...t,
    port: t.port || 22,
    path: t.path || "/opt/kumamap",
    pm2Name: t.pm2Name || "kumamap",
  }));
}
