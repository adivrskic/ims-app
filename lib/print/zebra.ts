"use client";

/**
 * Zebra USB printer driver via WebUSB.
 *
 * Works with any modern Zebra ZPL-speaking printer (ZD420, ZD620, GK420,
 * ZT410, ZT411, ZD230, ZD888, etc.) over USB. Bluetooth/network printers
 * need a different transport (out of scope for v1).
 *
 * Browser support:
 *   - Chrome / Edge / Opera: ✓ WebUSB available
 *   - Firefox / Safari:      ✗ WebUSB not implemented; isSupported() === false
 *
 * Pairing model:
 *   - First time on a device, the user must click a button that calls
 *     requestPrinter() — the browser shows a USB picker.
 *   - Subsequent sessions, getPairedPrinter() returns the same handle
 *     without a picker (the grant persists for the origin).
 *   - Grants can be revoked by the user via Chrome's site settings.
 *
 * The printer must be powered on AND not currently held by another app
 * (Zebra Setup Utilities, BarTender, etc.) — those will steal the USB
 * interface. Close them before printing from the browser.
 */

/** Zebra's USB vendor ID — matches every Zebra-branded printer. */
const ZEBRA_VENDOR_ID = 0x0a5f;

/** Stable error codes the UI can switch on. */
export type PrintErrorCode =
  | "unsupported"
  | "no-device"
  | "cancelled"
  | "claim-failed"
  | "transfer-failed";

export class PrintError extends Error {
  code: PrintErrorCode;
  constructor(code: PrintErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "PrintError";
  }
}

/** True iff the browser exposes navigator.usb. */
export function isSupported(): boolean {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

interface USBNavigator {
  usb: {
    getDevices: () => Promise<USBDevice[]>;
    requestDevice: (options: {
      filters: { vendorId: number }[];
    }) => Promise<USBDevice>;
    addEventListener: (event: string, fn: (e: USBEvent) => void) => void;
    removeEventListener: (event: string, fn: (e: USBEvent) => void) => void;
  };
}

interface USBEvent {
  device: USBDevice;
}

interface USBDevice {
  vendorId: number;
  productId: number;
  productName?: string;
  manufacturerName?: string;
  serialNumber?: string;
  opened: boolean;
  configuration: USBConfiguration | null;
  configurations: USBConfiguration[];
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (configurationValue: number) => Promise<void>;
  claimInterface: (interfaceNumber: number) => Promise<void>;
  releaseInterface: (interfaceNumber: number) => Promise<void>;
  transferOut: (
    endpointNumber: number,
    data: BufferSource
  ) => Promise<{ status: string; bytesWritten: number }>;
}

interface USBConfiguration {
  configurationValue: number;
  interfaces: USBInterface[];
}

interface USBInterface {
  interfaceNumber: number;
  alternate: USBAlternateInterface;
  alternates: USBAlternateInterface[];
}

interface USBAlternateInterface {
  endpoints: USBEndpoint[];
}

interface USBEndpoint {
  endpointNumber: number;
  direction: "in" | "out";
  type: "bulk" | "interrupt" | "isochronous";
}

function usbApi(): USBNavigator["usb"] {
  if (!isSupported()) {
    throw new PrintError(
      "unsupported",
      "WebUSB is not available in this browser. Use Chrome, Edge, or Opera."
    );
  }
  return (navigator as unknown as USBNavigator).usb;
}

/**
 * Show the browser's USB picker, filtered to Zebra devices. Returns the
 * selected device, or throws PrintError('cancelled') if the user dismisses
 * the picker.
 */
export async function requestPrinter(): Promise<USBDevice> {
  try {
    const device = await usbApi().requestDevice({
      filters: [{ vendorId: ZEBRA_VENDOR_ID }],
    });
    return device;
  } catch (err) {
    // The spec rejects with NotFoundError when the user cancels. Some
    // browsers use a different name; treat any rejection from the picker
    // as a user-cancellation rather than a hard error.
    const msg = err instanceof Error ? err.message : "Picker dismissed";
    throw new PrintError("cancelled", msg);
  }
}

/**
 * Return the first previously-paired Zebra printer this user has granted
 * access to, or null. No picker, no prompts. Safe to call on every mount.
 */
export async function getPairedPrinter(): Promise<USBDevice | null> {
  if (!isSupported()) return null;
  const devices = await usbApi().getDevices();
  return devices.find((d) => d.vendorId === ZEBRA_VENDOR_ID) ?? null;
}

/**
 * Open the device, claim its first interface, and locate its bulk OUT
 * endpoint. Returns the endpoint number to use for transferOut.
 *
 * Idempotent — safe to call before each print. If the device is already
 * open with the interface claimed, we re-use the existing endpoint.
 */
async function openAndClaim(device: USBDevice): Promise<number> {
  if (!device.opened) {
    try {
      await device.open();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to open device";
      throw new PrintError("claim-failed", msg);
    }
  }

  if (!device.configuration) {
    await device.selectConfiguration(1);
  }

  const iface = device.configuration?.interfaces[0];
  if (!iface) {
    throw new PrintError(
      "claim-failed",
      "Printer reported no USB interface — likely held by another app."
    );
  }

  try {
    await device.claimInterface(iface.interfaceNumber);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "claim failed";
    throw new PrintError(
      "claim-failed",
      `Couldn't claim printer interface (${msg}). ` +
        "Close Zebra Setup Utilities, BarTender, or any other app that " +
        "might be using the printer."
    );
  }

  const outEndpoint = iface.alternate.endpoints.find(
    (e) => e.direction === "out" && e.type === "bulk"
  );

  if (!outEndpoint) {
    throw new PrintError(
      "claim-failed",
      "Printer has no bulk OUT endpoint — not a printable Zebra device?"
    );
  }

  return outEndpoint.endpointNumber;
}

/**
 * Send a raw ZPL string to the printer. Caller is responsible for the
 * full ZPL document including ^XA / ^XZ.
 *
 * Throws PrintError on failure. The printer is NOT closed afterwards;
 * the device handle stays paired and warm for the next print.
 */
export async function printZpl(device: USBDevice, zpl: string): Promise<void> {
  const endpoint = await openAndClaim(device);
  const bytes = new TextEncoder().encode(zpl);

  try {
    const result = await device.transferOut(endpoint, bytes);
    if (result.status !== "ok") {
      throw new PrintError(
        "transfer-failed",
        `Printer rejected transfer (status: ${result.status})`
      );
    }
  } catch (err) {
    if (err instanceof PrintError) throw err;
    const msg = err instanceof Error ? err.message : "Unknown transfer error";
    throw new PrintError("transfer-failed", msg);
  }
}

/** Human-readable label for an attached printer (for status displays). */
export function printerLabel(device: USBDevice): string {
  const name = device.productName?.trim();
  if (name) return name;
  const serial = device.serialNumber ? ` (${device.serialNumber})` : "";
  return `Zebra ${device.productId
    .toString(16)
    .padStart(4, "0")
    .toUpperCase()}${serial}`;
}

export type { USBDevice as ZebraDevice };
