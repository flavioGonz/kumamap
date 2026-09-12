/**
 * Vigilancia de los resolvers DNS publicos mas importantes del planeta.
 *
 * Esto no es decorado: cada punto del globo del login es un resolver real, con su IP
 * real, y la latencia que se muestra es una consulta DNS de verdad hecha desde este
 * controlador (Montevideo). Si Quad9 se cae, el punto se pone rojo.
 *
 * Se consulta en UDP/53 igual que lo haria cualquier cliente. Si la red de salida no
 * permite DNS hacia afuera, todos quedan en "sin dato" y el globo igual se dibuja.
 */
import dns from "dns";

export interface Resolver {
  id: string;
  nombre: string;
  operador: string;
  ip: string;
  ciudad: string;
  lat: number;
  lng: number;
}

/**
 * Todas estas IPs son anycast: no viven en un solo lugar. La coordenada es la sede o
 * region principal del operador, que es como se rotula en cualquier mapa de red, y la
 * latencia de al lado es la medida real desde aca.
 */
export const RESOLVERS: Resolver[] = [
  { id: "cf",      nombre: "Cloudflare",   operador: "Cloudflare",        ip: "1.1.1.1",         ciudad: "San Francisco", lat: 37.77,  lng: -122.42 },
  { id: "cf2",     nombre: "Cloudflare 2", operador: "Cloudflare",        ip: "1.0.0.1",         ciudad: "Singapur",      lat: 1.35,   lng: 103.82 },
  { id: "google",  nombre: "Google",       operador: "Google",            ip: "8.8.8.8",         ciudad: "Mountain View", lat: 37.39,  lng: -122.08 },
  { id: "google2", nombre: "Google 2",     operador: "Google",            ip: "8.8.4.4",         ciudad: "Tokio",         lat: 35.68,  lng: 139.69 },
  { id: "quad9",   nombre: "Quad9",        operador: "Fundación Quad9",   ip: "9.9.9.9",         ciudad: "Zúrich",        lat: 47.38,  lng: 8.54 },
  { id: "opendns", nombre: "OpenDNS",      operador: "Cisco",             ip: "208.67.222.222",  ciudad: "San José",      lat: 37.34,  lng: -121.89 },
  { id: "level3",  nombre: "Level3",       operador: "Lumen",             ip: "4.2.2.2",         ciudad: "Denver",        lat: 39.74,  lng: -104.99 },
  { id: "verisign",nombre: "Verisign",     operador: "Verisign",          ip: "64.6.64.6",       ciudad: "Reston",        lat: 38.96,  lng: -77.36 },
  { id: "adguard", nombre: "AdGuard",      operador: "AdGuard",           ip: "94.140.14.14",    ciudad: "Limassol",      lat: 34.71,  lng: 33.02 },
  { id: "alidns",  nombre: "AliDNS",       operador: "Alibaba",           ip: "223.5.5.5",       ciudad: "Hangzhou",      lat: 30.27,  lng: 120.16 },
  { id: "114dns",  nombre: "114DNS",       operador: "114DNS",            ip: "114.114.114.114", ciudad: "Nanjing",       lat: 32.06,  lng: 118.80 },
  { id: "yandex",  nombre: "Yandex",       operador: "Yandex",            ip: "77.88.8.8",       ciudad: "Moscú",         lat: 55.76,  lng: 37.62 },
  { id: "cira",    nombre: "CIRA Shield",  operador: "CIRA",              ip: "149.112.121.10",  ciudad: "Ottawa",        lat: 45.42,  lng: -75.7 },
  { id: "controld",nombre: "Control D",    operador: "Control D",         ip: "76.76.2.0",       ciudad: "Toronto",       lat: 43.65,  lng: -79.38 },
  { id: "nextdns", nombre: "NextDNS",      operador: "NextDNS",           ip: "45.90.28.0",      ciudad: "París",         lat: 48.86,  lng: 2.35 },
  { id: "cleanb",  nombre: "CleanBrowsing",operador: "CleanBrowsing",     ip: "185.228.168.9",   ciudad: "Londres",       lat: 51.51,  lng: -0.13 },
  { id: "safedns", nombre: "SafeDNS",      operador: "SafeDNS",           ip: "195.46.39.39",    ciudad: "Ámsterdam",     lat: 52.37,  lng: 4.90 },
  { id: "quad9e",  nombre: "Quad9 ECS",    operador: "Fundación Quad9",   ip: "9.9.9.11",        ciudad: "Fráncfort",     lat: 50.11,  lng: 8.68 },
  { id: "comodo",  nombre: "Comodo Secure",operador: "Comodo",            ip: "8.26.56.26",      ciudad: "Sídney",        lat: -33.87, lng: 151.21 },
  { id: "antel",   nombre: "Antel",        operador: "Antel (Uruguay)",   ip: "200.40.30.245",   ciudad: "Montevideo",    lat: -34.9,  lng: -56.16 },
];

export interface Medicion {
  id: string;
  nombre: string;
  operador: string;
  ip: string;
  ciudad: string;
  lat: number;
  lng: number;
  ms: number | null;
  estado: "ok" | "lento" | "caido" | "sin-dato";
  at: number;
}

const NOMBRE_PRUEBA = "example.com";
const TIMEOUT_MS = 2500;
const LENTO_MS = 250;
const CADA_MS = 5 * 60 * 1000;

let ultimas: Medicion[] = RESOLVERS.map((r) => ({
  ...r, ms: null, estado: "sin-dato" as const, at: 0,
}));
let midiendo = false;
let ultimaVuelta = 0;

/** Una consulta A contra un resolver concreto, con timeout propio. */
function consultar(ip: string): Promise<number | null> {
  return new Promise((resolve) => {
    let listo = false;
    const r = new dns.Resolver({ timeout: TIMEOUT_MS, tries: 1 });
    try {
      r.setServers([ip]);
    } catch {
      return resolve(null);
    }
    const t0 = Date.now();
    const cerrar = (ms: number | null) => {
      if (listo) return;
      listo = true;
      clearTimeout(reloj);
      resolve(ms);
    };
    const reloj = setTimeout(() => {
      try { r.cancel(); } catch { /* ya termino */ }
      cerrar(null);
    }, TIMEOUT_MS);
    r.resolve4(NOMBRE_PRUEBA, (err, dirs) => {
      cerrar(!err && dirs && dirs.length ? Date.now() - t0 : null);
    });
  });
}

function clasificar(ms: number | null): Medicion["estado"] {
  if (ms === null) return "caido";
  return ms > LENTO_MS ? "lento" : "ok";
}

async function vuelta(): Promise<void> {
  if (midiendo) return;
  midiendo = true;
  try {
    const res = await Promise.all(
      RESOLVERS.map(async (r) => {
        const ms = await consultar(r.ip);
        return { ...r, ms, estado: clasificar(ms), at: Date.now() } as Medicion;
      })
    );
    ultimas = res;
    ultimaVuelta = Date.now();
  } catch {
    /* si algo explota, nos quedamos con la vuelta anterior */
  } finally {
    midiendo = false;
  }
}

let arrancado = false;
function arrancar() {
  if (arrancado) return;
  arrancado = true;
  setTimeout(() => { vuelta(); }, 1500);
  const t = setInterval(() => { vuelta(); }, CADA_MS);
  if (typeof t.unref === "function") t.unref();
}

export function estadoDns(): { desde: string; at: number; resolvers: Medicion[] } {
  arrancar();
  // si hace mucho que no medimos (proceso recien levantado), disparamos sin esperar
  if (Date.now() - ultimaVuelta > CADA_MS) vuelta();
  return { desde: "Montevideo, Uruguay", at: ultimaVuelta, resolvers: ultimas };
}
