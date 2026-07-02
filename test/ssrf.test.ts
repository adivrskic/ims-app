import { describe, it, expect } from "vitest";
import { isPrivateAddress } from "@/lib/net/ssrf";

describe("isPrivateAddress (SSRF guard)", () => {
  it("blocks IPv4 metadata / loopback / private / CGNAT ranges", () => {
    for (const ip of [
      "169.254.169.254", // cloud metadata
      "127.0.0.1", // loopback
      "10.1.2.3", // private
      "172.16.5.5", // private
      "172.31.255.255", // private (/12 upper edge)
      "192.168.1.1", // private
      "100.64.0.1", // CGNAT
      "0.0.0.0", // "this" network
      "192.0.2.5", // TEST-NET-1
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("allows genuine public IPv4 addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("respects the 172.16.0.0/12 boundary exactly", () => {
    expect(isPrivateAddress("172.15.255.255")).toBe(false);
    expect(isPrivateAddress("172.16.0.0")).toBe(true);
    expect(isPrivateAddress("172.31.255.255")).toBe(true);
    expect(isPrivateAddress("172.32.0.0")).toBe(false);
  });

  it("blocks IPv6 loopback / ULA / link-local and IPv4-mapped privates", () => {
    for (const ip of [
      "::1", // loopback
      "::", // unspecified
      "fc00::1", // ULA
      "fd12:3456::1", // ULA
      "fe80::1", // link-local
      "::ffff:169.254.169.254", // IPv4-mapped metadata
      "::ffff:10.0.0.1", // IPv4-mapped private
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("allows public IPv6 and rejects non-IPs as unsafe", () => {
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false); // Cloudflare
    expect(isPrivateAddress("not-an-ip")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
  });
});
