import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard for user-supplied outbound URLs (e.g. webhook endpoints).
 *
 * Without this, an org admin could point a webhook at http(s)://169.254.169.254
 * (cloud metadata), localhost, or an internal host, and — because we POST
 * server-side and store/reflect the response — exfiltrate internal data.
 *
 * `assertPublicHttpsUrl` requires https + port 443, and rejects any host that
 * is (or DNS-resolves to) a private / loopback / link-local / ULA / metadata
 * address. Callers should ALSO re-validate at delivery time and disable HTTP
 * redirect following, since DNS can rebind between validation and fetch.
 */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → treat as unsafe
  const inRange = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base);
    if (b === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) >>> 0 === (b & mask) >>> 0;
  };
  return (
    inRange("0.0.0.0", 8) || // "this" network
    inRange("10.0.0.0", 8) || // private
    inRange("100.64.0.0", 10) || // CGNAT
    inRange("127.0.0.0", 8) || // loopback
    inRange("169.254.0.0", 16) || // link-local (incl. 169.254.169.254 metadata)
    inRange("172.16.0.0", 12) || // private
    inRange("192.0.0.0", 24) || // IETF protocol assignments
    inRange("192.0.2.0", 24) || // TEST-NET-1
    inRange("192.168.0.0", 16) || // private
    inRange("198.18.0.0", 15) || // benchmarking
    inRange("198.51.100.0", 24) || // TEST-NET-2
    inRange("203.0.113.0", 24) || // TEST-NET-3
    inRange("224.0.0.0", 4) || // multicast
    inRange("240.0.0.0", 4) // reserved + broadcast
  );
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // strip any zone id
  // IPv4-mapped (::ffff:a.b.c.d) → judge by the embedded v4 address.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (addr === "::1" || addr === "::") return true; // loopback / unspecified
  const firstHextet = parseInt(addr.split(":")[0] || "0", 16);
  if (Number.isNaN(firstHextet)) return true;
  if ((firstHextet & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((firstHextet & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
}

/** True if the literal IP is non-public (private/loopback/link-local/etc.). */
export function isPrivateAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return isPrivateIPv4(ip);
  if (fam === 6) return isPrivateIPv6(ip);
  return true; // not a valid IP → unsafe
}

/**
 * Throws with a user-safe message if `raw` is not a public https URL. Resolves
 * DNS and rejects if the host (or any resolved address) is non-public.
 */
export async function assertPublicHttpsUrl(raw: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("That URL isn't valid");
  }
  if (u.protocol !== "https:") {
    throw new Error("Endpoint must be an https:// URL");
  }
  if (u.port && u.port !== "443") {
    throw new Error("Only the standard https port (443) is allowed");
  }
  if (u.username || u.password) {
    throw new Error("URLs with embedded credentials aren't allowed");
  }

  const host = u.hostname;
  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new Error("That URL points at a non-public address");
    }
    return;
  }

  let results: Array<{ address: string }>;
  try {
    results = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("The endpoint host couldn't be resolved");
  }
  if (results.length === 0) {
    throw new Error("The endpoint host couldn't be resolved");
  }
  for (const r of results) {
    if (isPrivateAddress(r.address)) {
      throw new Error("That URL resolves to a non-public address");
    }
  }
}
