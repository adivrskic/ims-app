"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ScanLine,
  Check,
  AlertCircle,
  MapPin,
  ClipboardCheck,
  ClipboardList,
  Truck,
} from "lucide-react";
import {
  useLastScan,
  useScannerEnabled,
} from "@/components/scanner/ScannerProvider";
import { lookupBarcode, type ScanLookupResult } from "./actions";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import { EmptyState } from "@/components/ui/EmptyState";

interface HistoryEntry {
  result: ScanLookupResult;
  at: number;
}

const MAX_HISTORY = 25;

export function ScanWorkspace() {
  const lastScan = useLastScan();
  const [enabled, setEnabled] = useScannerEnabled();
  const [current, setCurrent] = useState<ScanLookupResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [manual, setManual] = useState("");

  // Monotonic request id so a newer lookup (rapid scans or a manual submit
  // landing mid-flight) always wins and stale responses are discarded.
  const reqId = useRef(0);

  const runLookup = useCallback(
    (barcode: string, at: number) => {
      const trimmed = barcode.trim();
      if (!trimmed) return;
      const myId = ++reqId.current;
      setPending(true);
      startTransition(() => {
        lookupBarcode(trimmed).then((result) => {
          if (myId !== reqId.current) return; // superseded by a newer lookup
          setCurrent(result);
          setPending(false);
          setHistory((prev) =>
            [{ result, at }, ...prev].slice(0, MAX_HISTORY)
          );
        });
      });
    },
    [startTransition]
  );

  // Hardware scans flow through the global ScannerProvider → useLastScan.
  useEffect(() => {
    if (!lastScan) return;
    runLookup(lastScan.barcode, lastScan.at);
  }, [lastScan, runLookup]);

  // Manual entry: works without scanner hardware, as a test path, and even
  // when global capture is paused. (The global useScanner only recognizes
  // scanner-speed keystroke bursts and ignores human typing by design — so
  // an explicit input is the only way to type a barcode by hand.)
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manual.trim();
    if (!trimmed) return;
    runLookup(trimmed, Date.now());
    setManual("");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-24">
      {/* Main scan surface */}
      <section aria-labelledby="scan-surface" className="flex flex-col gap-16">
        {/* Paused-capture notice — the manual field below still works */}
        {!enabled && (
          <div className="hairline-subtle bg-[var(--surface-2)] px-14 py-10 flex items-center gap-12">
            <AlertCircle
              size={13}
              strokeWidth={1.5}
              className="text-text-muted shrink-0"
              aria-hidden
            />
            <p className="mono-sm text-text-muted flex-1">
              Hardware scan capture is paused. The field below still works.
            </p>
            <CornerButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEnabled(true)}
            >
              Resume
            </CornerButton>
          </div>
        )}

        {/* Manual barcode entry — always available */}
        <form
          onSubmit={handleManualSubmit}
          className="flex items-center gap-8"
          aria-label="Look up a barcode"
        >
          <div className="relative flex-1">
            <ScanLine
              size={12}
              strokeWidth={1.5}
              className="absolute left-12 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
              aria-hidden
            />
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Enter or scan a barcode…"
              aria-label="Barcode"
              className="field-shell w-full pl-32 pr-12 py-8 mono-sm"
            />
          </div>
          <CornerButton
            type="submit"
            variant="primary"
            size="sm"
            disabled={!manual.trim() || pending}
          >
            Look up
          </CornerButton>
        </form>

        {current ? (
          <ResultPanel result={current} pending={pending} />
        ) : (
          <ReadyPanel />
        )}
      </section>

      {/* History */}
      <aside aria-labelledby="scan-history" className="flex flex-col gap-12">
        <h2
          id="scan-history"
          className="label-text"
          style={{ color: "var(--text-muted)" }}
        >
          — Session history
        </h2>
        {history.length === 0 ? (
          <p className="mono-sm text-text-dim">
            Scans this session will appear here.
          </p>
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {history.map((h, i) => (
              <li
                key={`${h.at}-${i}`}
                className="px-12 py-10 flex items-center gap-10"
              >
                <span
                  className={`shrink-0 dot ${
                    h.result.found ? "dot-online" : "dot-offline"
                  }`}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="truncate"
                    style={{
                      fontFamily: "var(--display)",
                      fontSize: 12,
                      color: h.result.found
                        ? "var(--text)"
                        : "var(--text-muted)",
                    }}
                  >
                    {h.result.found ? h.result.product?.name : "Not in catalog"}
                  </p>
                  <p className="mono-sm text-text-dim tnum truncate">
                    {h.result.barcode}
                  </p>
                </div>
                <time
                  className="mono-sm text-text-dim tnum"
                  dateTime={new Date(h.at).toISOString()}
                >
                  {new Date(h.at).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function ReadyPanel() {
  return (
    <div className="hairline bg-[var(--surface)] p-40 flex flex-col items-center text-center gap-16 brackets">
      <span
        className="w-56 h-56 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center text-[var(--accent)]"
        aria-hidden
      >
        <ScanLine size={24} strokeWidth={1.5} />
      </span>
      <div>
        <h2
          style={{
            fontFamily: "var(--display)",
            fontSize: 22,
            fontWeight: 500,
            color: "var(--text)",
            margin: "0 0 8px",
          }}
        >
          Ready to scan.
        </h2>
        <p
          className="mono-sm text-text-muted"
          style={{ lineHeight: 1.7, maxWidth: 420 }}
        >
          Plug in a USB or Bluetooth barcode scanner and pull the trigger. We'll
          resolve the barcode and offer next steps. No clicks required.
        </p>
      </div>
      <p className="label-text text-text-dim" style={{ marginTop: 16 }}>
        Or enter a barcode in the field above to look one up
      </p>
    </div>
  );
}

function ResultPanel({
  result,
  pending,
}: {
  result: ScanLookupResult;
  pending: boolean;
}) {
  if (!result.found) {
    return (
      <div className="hairline bg-[var(--surface)] p-32 flex flex-col gap-20">
        <header className="flex items-start gap-14">
          <span
            className="w-40 h-40 hairline-subtle bg-[var(--danger-dim)] flex items-center justify-center text-[var(--danger)] shrink-0"
            aria-hidden
          >
            <AlertCircle size={16} strokeWidth={1.5} />
          </span>
          <div>
            <p className="label-text mb-4" style={{ color: "var(--danger)" }}>
              Not in catalog
            </p>
            <h2
              style={{
                fontFamily: "var(--display)",
                fontSize: 22,
                fontWeight: 500,
                color: "var(--text)",
                margin: "0 0 4px",
              }}
            >
              {result.barcode}
            </h2>
            <p className="mono-sm text-text-muted">
              This barcode isn't registered yet. Register it now to start
              tracking.
            </p>
          </div>
        </header>
        <footer className="flex items-center gap-10 hairline-t pt-16">
          <CornerLink
            href={`/inventory?register=${encodeURIComponent(result.barcode)}`}
            variant="primary"
            size="sm"
          >
            Register product →
          </CornerLink>
          <span className="mono-sm text-text-dim">
            Pre-fills the barcode on the new-product form
          </span>
        </footer>
      </div>
    );
  }

  const p = result.product!;
  const here = p.on_hand_here;
  const total = p.on_hand_total;
  const belowReorder =
    p.reorder_point != null && (here ?? total) <= p.reorder_point;

  return (
    <div className="hairline bg-[var(--surface)] p-32 flex flex-col gap-20">
      <header className="flex items-start gap-14">
        <span
          className="w-40 h-40 hairline-subtle bg-[var(--success-dim)] flex items-center justify-center text-[var(--success)] shrink-0"
          aria-hidden
        >
          <Check size={16} strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-text mb-4 text-text-muted">
            {p.category_name ?? "Uncategorized"}
          </p>
          <h2
            style={{
              fontFamily: "var(--display)",
              fontSize: 22,
              fontWeight: 500,
              color: "var(--text)",
              margin: "0 0 4px",
              opacity: pending ? 0.7 : 1,
              transition: "opacity 150ms",
            }}
          >
            {p.name}
          </h2>
          <div className="flex items-center gap-12 flex-wrap mono-sm text-text-muted">
            <span className="tnum">{p.barcode}</span>
            {p.internal_sku && <span>SKU {p.internal_sku}</span>}
            {p.manufacturer && <span>{p.manufacturer}</span>}
          </div>
        </div>
      </header>

      {/* Stock summary */}
      <div className="grid grid-cols-3 gap-16 hairline-t pt-16">
        <StockBlock
          label={here !== null ? "Here" : "On hand"}
          value={here !== null ? here : total}
          tone={belowReorder ? "danger" : "neutral"}
        />
        {here !== null && (
          <StockBlock label="Workspace" value={total} tone="neutral" />
        )}
        {p.reorder_point != null && (
          <StockBlock
            label="Reorder point"
            value={p.reorder_point}
            tone={belowReorder ? "danger" : "neutral"}
          />
        )}
      </div>

      {/* Locations */}
      {p.locations.length > 0 && (
        <div className="flex flex-col gap-8">
          <p className="label-text text-text-muted">— Locations</p>
          <ul className="flex flex-wrap gap-6">
            {p.locations.map((l, i) => (
              <li
                key={i}
                className="hairline-subtle px-10 py-6 inline-flex items-center gap-8 mono-sm"
              >
                <MapPin
                  size={10}
                  strokeWidth={1.5}
                  className="text-text-dim"
                  aria-hidden
                />
                <span className="text-text-secondary">
                  {l.section_code ?? "—"} · B{l.bay}·L{l.level}
                </span>
                <span className="tnum text-text">{l.quantity}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <footer className="flex flex-wrap items-center gap-8 hairline-t pt-16">
        <CornerLink href={`/inventory/${p.id}`} variant="primary" size="sm">
          <MapPin size={11} strokeWidth={1.5} />
          Locate
        </CornerLink>
        <CornerLink href={`/orders/new?product=${p.id}`} variant="ghost" size="sm">
          <ClipboardList size={11} strokeWidth={1.5} />
          Pick
        </CornerLink>
        <CornerLink
          href={`/cycle-counts?product=${p.id}`}
          variant="ghost"
          size="sm"
        >
          <ClipboardCheck size={11} strokeWidth={1.5} />
          Count
        </CornerLink>
        {belowReorder && (
          <CornerLink href="/purchase-orders" variant="ghost" size="sm">
            <Truck size={11} strokeWidth={1.5} />
            Reorder
          </CornerLink>
        )}
      </footer>
    </div>
  );
}

function StockBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "danger";
}) {
  return (
    <div className="flex flex-col gap-4">
      <span className="label-text text-text-muted">{label}</span>
      <span
        className="tnum"
        style={{
          fontFamily: "var(--mono)",
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: "-0.5px",
          color: tone === "danger" ? "var(--danger)" : "var(--text)",
        }}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}