"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Shell, ArrowUp, ArrowDown, X } from "lucide-react";
import type { KioskData, KioskLowStock, KioskOrder } from "@/lib/data/kiosk";

type ScreenKey = "ops" | "inventory" | "orders";

const MAX_WIDTH = 1920; // cap on huge wallboards; contents center beyond this

const SCREENS: { key: ScreenKey; label: string }[] = [
  { key: "ops", label: "Operations" },
  { key: "inventory", label: "Inventory" },
  { key: "orders", label: "Orders" },
];

const STATUS_LABEL: Record<string, string> = {
  created: "Created",
  pick_list_assigned: "Assigned",
  in_progress: "Picking",
  staged: "Staged",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  sent: "Sent",
  partially_received: "Partial",
};

const ACTION_TONE: Record<string, string> = {
  receive: "var(--success)",
  pick: "var(--info)",
  locate: "var(--accent)",
  relocate: "var(--accent)",
  cycle_count: "var(--warning)",
  register: "var(--text-secondary)",
  adjust: "var(--text-secondary)",
  return: "var(--danger)",
};

export function KioskBoard({
  data,
  facilityName,
}: {
  data: KioskData;
  facilityName: string;
}) {
  const [screen, setScreen] = useState<ScreenKey>("ops");
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  const move = useCallback((dir: 1 | -1) => {
    setScreen((cur) => {
      const i = SCREENS.findIndex((s) => s.key === cur);
      return SCREENS[(i + dir + SCREENS.length) % SCREENS.length].key;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") move(1);
      else if (e.key === "ArrowLeft") move(-1);
      else if (e.key >= "1" && e.key <= String(SCREENS.length)) {
        setScreen(SCREENS[Number(e.key) - 1].key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  return (
    <div
      className="flex flex-col"
      style={{
        minHeight: "calc(100vh - 48px)",
        gap: 16,
        width: "100%",
        maxWidth: MAX_WIDTH,
        marginInline: "auto",
      }}
    >
      <header
        className="flex items-center justify-between"
        style={{ paddingBottom: 4 }}
      >
        <div className="flex items-center gap-12">
          <Shell
            size={24}
            strokeWidth={1.5}
            style={{ color: "var(--accent)" }}
          />
          <span
            style={{
              fontFamily: "var(--display)",
              fontWeight: 600,
              fontSize: 18,
              letterSpacing: "0.5px",
            }}
          >
            NAUTILUS
          </span>
          <span
            className="label-text"
            style={{
              borderLeft: "1px solid var(--border-subtle)",
              paddingLeft: 14,
            }}
          >
            {facilityName}
          </span>
        </div>

        <nav
          className="flex items-center"
          style={{ gap: 4 }}
          aria-label="Kiosk screens"
        >
          {SCREENS.map((s) => {
            const on = s.key === screen;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setScreen(s.key)}
                aria-current={on ? "page" : undefined}
                className="transition-colors"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 13,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  padding: "8px 16px",
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${
                    on ? "var(--accent)" : "transparent"
                  }`,
                  color: on ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center" style={{ gap: 16 }}>
          <span className="flex items-center gap-10">
            <span className="dot dot-live" aria-hidden />
            <span className="label-text">Live · {clock || "—"}</span>
          </span>
          <Link
            href="/"
            aria-label="Exit kiosk"
            title="Exit kiosk"
            className="hairline-subtle inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors"
            style={{
              padding: "7px 13px",
              fontFamily: "var(--mono)",
              fontSize: 12,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
            }}
          >
            <X size={12} strokeWidth={1.5} />
            Exit
          </Link>
        </div>
      </header>

      {screen === "ops" && <OpsScreen data={data} />}
      {screen === "inventory" && <InventoryScreen data={data} />}
      {screen === "orders" && <OrdersScreen data={data} />}
    </div>
  );
}

/* ── Bento skeleton ────────────────────────────────────────────────────── */

interface Tile {
  label: string;
  value: string;
  tone?: string;
}

function BentoScreen({
  hero,
  tiles,
  wide,
  side,
}: {
  hero: {
    label: string;
    value: string;
    spark?: number[];
    footer?: React.ReactNode;
  };
  tiles: [Tile, Tile, Tile, Tile];
  wide: { label: string; tone?: string; children: React.ReactNode };
  side: { label: string; tone?: string; children: React.ReactNode };
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1.6fr 1fr 1fr",
        gridTemplateRows: "1fr 1fr 1.25fr",
        gap: 12,
        minHeight: 0,
      }}
    >
      <CardShell
        style={{
          gridColumn: 1,
          gridRow: "1 / span 2",
          justifyContent: "center",
        }}
      >
        <span className="label-text">{hero.label}</span>
        <span
          className="kpi-value"
          data-kpi-value
          style={{ fontFamily: "var(--display)", fontWeight: 600 }}
        >
          {hero.value}
        </span>
        {hero.spark && <Sparkline values={hero.spark} />}
        {hero.footer && <div style={{ marginTop: 6 }}>{hero.footer}</div>}
      </CardShell>

      {tiles.map((t, i) => (
        <CardShell
          key={i}
          style={{
            gridColumn: i % 2 === 0 ? 2 : 3,
            gridRow: i < 2 ? 1 : 2,
            justifyContent: "center",
          }}
        >
          <span
            className="label-text"
            style={t.tone ? { color: t.tone } : undefined}
          >
            {t.label}
          </span>
          <span
            style={{
              fontFamily: "var(--display)",
              fontWeight: 600,
              fontSize: "clamp(28px, 3.2vw, 52px)",
              lineHeight: 1,
              color: t.tone ?? "var(--text)",
            }}
          >
            {t.value}
          </span>
        </CardShell>
      ))}

      <CardShell style={{ gridColumn: "1 / span 2", gridRow: 3 }}>
        <span
          className="label-text"
          style={wide.tone ? { color: wide.tone } : undefined}
        >
          {wide.label}
        </span>
        <div
          className="flex flex-col"
          style={{ marginTop: 2, overflow: "hidden" }}
        >
          {wide.children}
        </div>
      </CardShell>

      <CardShell style={{ gridColumn: 3, gridRow: 3 }}>
        <span
          className="label-text"
          style={side.tone ? { color: side.tone } : undefined}
        >
          {side.label}
        </span>
        <div
          className="flex flex-col"
          style={{ marginTop: 2, overflow: "hidden" }}
        >
          {side.children}
        </div>
      </CardShell>
    </div>
  );
}

function CardShell({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="hairline"
      style={{
        background: "var(--surface)",
        padding: "18px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 4,
        height: 64,
        marginTop: 8,
      }}
      aria-hidden
    >
      {values.map((v, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(4, (v / max) * 100)}%`,
            background:
              i === values.length - 1
                ? "var(--accent-bright)"
                : "var(--accent-soft)",
            minHeight: 3,
          }}
        />
      ))}
    </div>
  );
}

function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span
      className="mono-body"
      style={{ color: up ? "var(--success)" : "var(--danger)" }}
    >
      {up ? <ArrowUp size={14} /> : <ArrowDown size={14} />} {Math.abs(pct)}%
      vs. yesterday
    </span>
  );
}

function Row({
  left,
  right,
  rightTone,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  rightTone?: string;
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "8px 0",
        borderBottom: "1px solid var(--border-subtle)",
        gap: 12,
      }}
    >
      <span
        className="mono-body"
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {left}
      </span>
      <span
        className="mono-body"
        style={{ color: rightTone ?? "var(--text)", whiteSpace: "nowrap" }}
      >
        {right}
      </span>
    </div>
  );
}

function lowRows(items: KioskLowStock[]) {
  return items
    .slice(0, 4)
    .map((p) => (
      <Row
        key={p.id}
        left={p.name}
        right={`${p.on_hand} / ${p.reorder_point ?? 0}`}
        rightTone="var(--danger)"
      />
    ));
}

function scanRows(items: KioskData["recentScans"]) {
  return items.slice(0, 4).map((s, i) => (
    <Row
      key={i}
      left={
        <span
          style={{ color: ACTION_TONE[s.action] ?? "var(--text-secondary)" }}
        >
          {s.action.replace("_", " ").toUpperCase()}
        </span>
      }
      right={
        s.scanned_at
          ? new Date(s.scanned_at).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—"
      }
      rightTone="var(--text-dim)"
    />
  ));
}

function orderRows(items: KioskOrder[]) {
  return items.slice(0, 4).map((o, i) => (
    <Row
      key={i}
      left={
        <>
          {o.order_number ?? "—"}{" "}
          <span style={{ color: "var(--accent)" }}>
            {STATUS_LABEL[o.status] ?? o.status}
          </span>
        </>
      }
      right={`${o.item_count} ${o.item_count === 1 ? "item" : "items"}`}
    />
  ));
}

/* ── Screens ───────────────────────────────────────────────────────────── */

function OpsScreen({ data }: { data: KioskData }) {
  return (
    <BentoScreen
      hero={{
        label: "Scans · today",
        value: data.scansToday.toLocaleString(),
        spark: data.scans14d,
        footer: <Delta pct={data.scansDelta} />,
      }}
      tiles={[
        { label: "Units on hand", value: data.unitsOnHand.toLocaleString() },
        { label: "Open orders", value: data.openOrdersCount.toLocaleString() },
        { label: "Products", value: data.productCount.toLocaleString() },
        {
          label: "Low stock",
          value: data.lowStockCount.toLocaleString(),
          tone: "var(--danger)",
        },
      ]}
      wide={{
        label: "Reorder alerts",
        tone: "var(--danger)",
        children: data.lowStock.length ? lowRows(data.lowStock) : <Empty />,
      }}
      side={{
        label: "Recent scans",
        children: data.recentScans.length ? (
          scanRows(data.recentScans)
        ) : (
          <Empty />
        ),
      }}
    />
  );
}

function InventoryScreen({ data }: { data: KioskData }) {
  return (
    <BentoScreen
      hero={{
        label: "Units on hand",
        value: data.unitsOnHand.toLocaleString(),
      }}
      tiles={[
        { label: "Products", value: data.productCount.toLocaleString() },
        {
          label: "Low stock",
          value: data.lowStockCount.toLocaleString(),
          tone: "var(--danger)",
        },
        { label: "Scans · today", value: data.scansToday.toLocaleString() },
        { label: "Open orders", value: data.openOrdersCount.toLocaleString() },
      ]}
      wide={{
        label: "Reorder queue",
        tone: "var(--danger)",
        children: data.lowStock.length ? lowRows(data.lowStock) : <Empty />,
      }}
      side={{
        label: "Top movers · 14d",
        children: data.topMovers.length ? (
          data.topMovers
            .slice(0, 4)
            .map((m) => (
              <Row
                key={m.product_id}
                left={m.name}
                right={`${m.scans}`}
                rightTone="var(--accent)"
              />
            ))
        ) : (
          <Empty />
        ),
      }}
    />
  );
}

function OrdersScreen({ data }: { data: KioskData }) {
  return (
    <BentoScreen
      hero={{
        label: "Open orders",
        value: data.openOrdersCount.toLocaleString(),
      }}
      tiles={[
        {
          label: "In pick queue",
          value: data.pickQueue.length.toLocaleString(),
        },
        {
          label: "POs in transit",
          value: data.posInTransit.length.toLocaleString(),
          tone: "var(--info)",
        },
        { label: "Units on hand", value: data.unitsOnHand.toLocaleString() },
        {
          label: "Low stock",
          value: data.lowStockCount.toLocaleString(),
          tone: "var(--danger)",
        },
      ]}
      wide={{
        label: "Pick queue",
        children: data.pickQueue.length ? orderRows(data.pickQueue) : <Empty />,
      }}
      side={{
        label: "POs in transit",
        tone: "var(--info)",
        children: data.posInTransit.length ? (
          data.posInTransit
            .slice(0, 4)
            .map((po, i) => (
              <Row
                key={i}
                left={po.po_number ?? po.supplier_name ?? "PO"}
                right={STATUS_LABEL[po.status] ?? po.status}
                rightTone="var(--info)"
              />
            ))
        ) : (
          <Empty />
        ),
      }}
    />
  );
}

function Empty() {
  return (
    <span className="mono-body text-text-dim" style={{ marginTop: 8 }}>
      Nothing to show
    </span>
  );
}
