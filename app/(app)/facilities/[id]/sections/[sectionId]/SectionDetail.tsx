"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Package,
  Boxes,
  Layers as LayersIcon,
  Plus,
  X,
  Trash2,
  Loader2,
  AlertTriangle,
  Search,
  ArrowRightLeft,
} from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import {
  searchProducts,
  placeLocation,
  updateLocationQuantity,
  removeLocation,
  relocateLocation,
  type PickedProduct,
  type LocationRow,
} from "./actions";

interface Props {
  warehouseId: string;
  sectionId: string;
  sectionCode: string;
  sectionName: string;
  sectionColor: string;
  totalBays: number;
  totalLevels: number;
  locations: LocationRow[];
}

const slotKey = (bay: number, level: number) => `${bay}:${level}`;

export function SectionDetail({
  warehouseId,
  sectionId,
  sectionCode,
  sectionName,
  sectionColor,
  totalBays,
  totalLevels,
  locations: initialLocations,
}: Props) {
  // Local mutable copy of locations — optimistic mutations land here.
  const [locations, setLocations] = useState<LocationRow[]>(initialLocations);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  // Re-sync if server data refreshes (e.g. after revalidatePath fires
  // from another tab's mutation — Next will re-render with new props).
  useEffect(() => {
    setLocations(initialLocations);
  }, [initialLocations]);

  const slotMap = useMemo(() => {
    const m = new Map<string, LocationRow[]>();
    for (const loc of locations) {
      const k = slotKey(loc.bay, loc.level);
      const arr = m.get(k) ?? [];
      arr.push(loc);
      m.set(k, arr);
    }
    return m;
  }, [locations]);

  const occupiedCells = slotMap.size;
  const totalCells = totalBays * totalLevels;
  const totalUnits = locations.reduce((acc, l) => acc + (l.quantity ?? 0), 0);
  const distinctSkus = new Set(
    locations.filter((l) => l.product).map((l) => l.product!.id)
  ).size;
  const occRatio = totalCells > 0 ? occupiedCells / totalCells : 0;

  const selectedLocations = selected ? slotMap.get(selected) ?? [] : [];
  const [selBay, selLevel] = selected
    ? selected.split(":").map(Number)
    : [null, null];

  const levels = Array.from({ length: totalLevels }, (_, i) => totalLevels - i);
  const bays = Array.from({ length: totalBays }, (_, i) => i + 1);

  // ── Mutations ────────────────────────────────────────────────────────

  const handleUpdateQty = async (locId: string, newQty: number) => {
    const prev = locations;
    setLocations((p) =>
      p.map((l) => (l.id === locId ? { ...l, quantity: newQty } : l))
    );
    setBusyId(locId);
    setError(null);
    const r = await updateLocationQuantity({
      warehouseId,
      sectionId,
      locationId: locId,
      quantity: newQty,
    });
    setBusyId(null);
    if (r.error) {
      setLocations(prev);
      setError(r.error);
    } else if (r.location) {
      // Use the server's authoritative row in case anything else changed.
      setLocations((p) => p.map((l) => (l.id === locId ? r.location! : l)));
    }
  };

  const handleRemove = async (locId: string) => {
    const prev = locations;
    setLocations((p) => p.filter((l) => l.id !== locId));
    setBusyId(locId);
    setError(null);
    const r = await removeLocation({
      warehouseId,
      sectionId,
      locationId: locId,
    });
    setBusyId(null);
    if (r.error) {
      setLocations(prev);
      setError(r.error);
    }
  };

  const handleAdd = async (
    product: PickedProduct,
    quantity: number
  ): Promise<boolean> => {
    if (!selBay || !selLevel) return false;
    setBusyId("add");
    setError(null);
    const r = await placeLocation({
      warehouseId,
      sectionId,
      bay: selBay,
      level: selLevel,
      productId: product.id,
      quantity,
    });
    setBusyId(null);
    if (r.error) {
      setError(r.error);
      return false;
    }
    if (r.location) {
      setLocations((p) => {
        // If the server returned a row whose id we already have (merge case),
        // replace it. Otherwise prepend the new row.
        const exists = p.some((l) => l.id === r.location!.id);
        if (exists) {
          return p.map((l) => (l.id === r.location!.id ? r.location! : l));
        }
        return [r.location!, ...p];
      });
    }
    return true;
  };

  const handleMove = async (
    loc: LocationRow,
    toBay: number,
    toLevel: number
  ): Promise<boolean> => {
    if (toBay < 1 || toBay > totalBays) {
      setError(`Bay must be between 1 and ${totalBays}`);
      return false;
    }
    if (toLevel < 1 || toLevel > totalLevels) {
      setError(`Level must be between 1 and ${totalLevels}`);
      return false;
    }
    if (toBay === loc.bay && toLevel === loc.level) {
      setError("That's the same slot");
      return false;
    }

    const prev = locations;

    // Optimistic. If the destination already holds the same product, merge
    // qty into it and drop the source row. Otherwise just rewrite bay/level.
    const targetExisting = locations.find(
      (l) =>
        l.bay === toBay &&
        l.level === toLevel &&
        l.product?.id === loc.product?.id &&
        l.id !== loc.id
    );

    if (targetExisting) {
      setLocations((p) =>
        p
          .filter((l) => l.id !== loc.id)
          .map((l) =>
            l.id === targetExisting.id
              ? { ...l, quantity: (l.quantity ?? 0) + (loc.quantity ?? 0) }
              : l
          )
      );
    } else {
      setLocations((p) =>
        p.map((l) =>
          l.id === loc.id ? { ...l, bay: toBay, level: toLevel } : l
        )
      );
    }

    setBusyId(loc.id);
    setError(null);
    const r = await relocateLocation({
      warehouseId,
      sectionId,
      locationId: loc.id,
      toBay,
      toLevel,
    });
    setBusyId(null);

    if (r.error) {
      setLocations(prev);
      setError(r.error);
      return false;
    }

    // Reconcile against authoritative server rows.
    setLocations((p) => {
      let next = [...p];
      if (r.source === null) {
        next = next.filter((l) => l.id !== loc.id);
      } else if (r.source) {
        next = next.map((l) => (l.id === loc.id ? r.source! : l));
      }
      if (r.mergedInto) {
        const idx = next.findIndex((l) => l.id === r.mergedInto!.id);
        if (idx >= 0) next[idx] = r.mergedInto!;
        else next.unshift(r.mergedInto!);
      }
      return next;
    });

    setMovingId(null);
    return true;
  };

  return (
    <div className="flex flex-col gap-16 flex-1 min-h-0">
      {/* Stats strip */}
      <div className="flex items-stretch gap-10 flex-wrap">
        <StatCard
          icon={Boxes}
          label="Occupancy"
          value={`${occupiedCells} / ${totalCells}`}
          sub={`${Math.round(occRatio * 100)}% of slots in use`}
        />
        <StatCard
          icon={Package}
          label="Distinct SKUs"
          value={String(distinctSkus)}
          sub={`${locations.length} location records`}
        />
        <StatCard
          icon={LayersIcon}
          label="Total units"
          value={String(totalUnits)}
          sub={`${totalBays} bays × ${totalLevels} levels`}
        />
      </div>

      {/* Grid + side panel */}
      <div className="flex gap-16 flex-1 min-h-0 flex-col lg:flex-row">
        {/* Grid */}
        <div className="hairline bg-[var(--surface)] flex-1 min-w-0 overflow-x-auto">
          <div className="p-16">
            <table
              className="w-full"
              style={{ borderCollapse: "separate", borderSpacing: 4 }}
            >
              <thead>
                <tr>
                  <th className="w-32" />
                  {bays.map((b) => (
                    <th
                      key={b}
                      className="label-text text-text-muted text-center"
                      style={{ fontSize: 9, paddingBottom: 4 }}
                    >
                      Bay {String(b).padStart(2, "0")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {levels.map((lvl) => (
                  <tr key={lvl}>
                    <td
                      className="label-text text-text-muted text-center pr-6"
                      style={{ fontSize: 9, width: 32 }}
                    >
                      L{lvl}
                    </td>
                    {bays.map((b) => {
                      const k = slotKey(b, lvl);
                      const locs = slotMap.get(k);
                      const isSelected = selected === k;
                      return (
                        <td key={b} style={{ padding: 0 }}>
                          <SlotCell
                            bay={b}
                            level={lvl}
                            locations={locs}
                            color={sectionColor}
                            selected={isSelected}
                            onSelect={() => {
                              setSelected((cur) => (cur === k ? null : k));
                              setAdding(false);
                              setError(null);
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel */}
        <aside
          className="hairline bg-[var(--surface)] p-16 flex flex-col gap-12 shrink-0 overflow-y-auto"
          style={{
            width: "100%",
            maxWidth: 360,
            maxHeight: "min(80vh, 720px)",
          }}
          aria-label="Slot detail"
        >
          {!selected ? (
            <EmptyHint totalLevels={totalLevels} />
          ) : (
            <>
              <div className="flex items-baseline gap-8">
                <span
                  className="w-22 h-22 hairline-subtle flex items-center justify-center text-text"
                  style={{
                    background: sectionColor + "22",
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    fontWeight: 600,
                  }}
                >
                  {sectionCode}
                </span>
                <h2
                  className="text-text"
                  style={{
                    fontFamily: "var(--display)",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  Bay {selBay} · Level {selLevel}
                </h2>
              </div>
              <p className="mono-sm text-text-dim">
                {selectedLocations.length === 0
                  ? "Empty slot"
                  : `${selectedLocations.length} location${
                      selectedLocations.length === 1 ? "" : "s"
                    }`}
              </p>

              {error && (
                <div
                  className="hairline-subtle px-10 py-7 flex items-start gap-8"
                  style={{
                    background: "var(--danger-dim)",
                    color: "var(--danger)",
                  }}
                >
                  <AlertTriangle
                    size={11}
                    strokeWidth={1.5}
                    className="mt-1 shrink-0"
                  />
                  <span className="mono-sm flex-1">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    aria-label="Dismiss error"
                    className="shrink-0"
                  >
                    <X size={10} strokeWidth={1.5} />
                  </button>
                </div>
              )}

              {selectedLocations.length > 0 && (
                <ul className="flex flex-col gap-8">
                  {selectedLocations.map((loc) => (
                    <LocationCard
                      key={loc.id}
                      loc={loc}
                      busy={busyId === loc.id}
                      moving={movingId === loc.id}
                      totalBays={totalBays}
                      totalLevels={totalLevels}
                      onUpdateQty={(q) => handleUpdateQty(loc.id, q)}
                      onRemove={() => handleRemove(loc.id)}
                      onStartMove={() => {
                        setMovingId(loc.id);
                        setError(null);
                      }}
                      onCancelMove={() => setMovingId(null)}
                      onMove={(b, l) => handleMove(loc, b, l)}
                    />
                  ))}
                </ul>
              )}

              {adding ? (
                <AddProductForm
                  busy={busyId === "add"}
                  onCancel={() => setAdding(false)}
                  onAdd={async (product, qty) => {
                    const ok = await handleAdd(product, qty);
                    if (ok) setAdding(false);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="hairline-subtle py-10 px-12 inline-flex items-center justify-center gap-8 hover:border-[var(--accent)] hover:text-[var(--accent)] text-text-secondary transition-colors"
                >
                  <Plus size={11} strokeWidth={1.5} />
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      letterSpacing: "0.8px",
                      textTransform: "uppercase",
                    }}
                  >
                    Add product to this slot
                  </span>
                </button>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Slot cell ──────────────────────────────────────────────────────────

function SlotCell({
  bay,
  level,
  locations,
  color,
  selected,
  onSelect,
}: {
  bay: number;
  level: number;
  locations: LocationRow[] | undefined;
  color: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const count = locations?.length ?? 0;
  const empty = count === 0;
  const totalQty = (locations ?? []).reduce((a, l) => a + (l.quantity ?? 0), 0);
  const fill = Math.min(1, totalQty / 50);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full hairline-subtle transition-colors text-left ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent-dim)]"
          : empty
          ? "hover:border-[var(--border-hover)] bg-[var(--surface)]"
          : "hover:border-[var(--accent)]"
      }`}
      style={{
        minHeight: 64,
        padding: 8,
        background: selected ? undefined : empty ? undefined : color + "1f",
      }}
      aria-label={`Bay ${bay} level ${level}, ${
        empty ? "empty" : `${count} locations, ${totalQty} units`
      }`}
    >
      {!empty && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: 3,
            width: `${fill * 100}%`,
            background: color,
            opacity: 0.85,
          }}
          aria-hidden
        />
      )}
      <div className="flex flex-col gap-4 min-w-0">
        <span
          className="text-text-dim"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 8,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          B{String(bay).padStart(2, "0")} · L{level}
        </span>
        {empty ? (
          <span
            className="text-text-dim"
            style={{ fontFamily: "var(--mono)", fontSize: 10 }}
          >
            —
          </span>
        ) : (
          <>
            <span
              className="text-text"
              style={{
                fontFamily: "var(--display)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {count}
            </span>
            <span
              className="text-text-muted truncate"
              style={{ fontFamily: "var(--mono)", fontSize: 9 }}
            >
              {totalQty} units
            </span>
          </>
        )}
      </div>
    </button>
  );
}

function MoveForm({
  fromBay,
  fromLevel,
  totalBays,
  totalLevels,
  busy,
  onCancel,
  onSubmit,
}: {
  fromBay: number;
  fromLevel: number;
  totalBays: number;
  totalLevels: number;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (toBay: number, toLevel: number) => void | Promise<boolean>;
}) {
  const [bay, setBay] = useState(String(fromBay));
  const [level, setLevel] = useState(String(fromLevel));

  const submit = () => {
    const b = parseInt(bay, 10);
    const l = parseInt(level, 10);
    if (Number.isNaN(b) || Number.isNaN(l)) return;
    void onSubmit(b, l);
  };

  const sameSlot =
    parseInt(bay, 10) === fromBay && parseInt(level, 10) === fromLevel;

  return (
    <div className="hairline-t p-10 bg-[var(--surface-2)] flex flex-col gap-8">
      <p className="label-text text-text-muted" style={{ fontSize: 9 }}>
        Move to (within this section)
      </p>
      <div className="flex items-center gap-8">
        <label
          className="flex flex-col gap-2 flex-1"
          style={{ fontFamily: "var(--mono)", fontSize: 9 }}
        >
          <span className="text-text-dim" style={{ letterSpacing: "0.5px" }}>
            BAY (1–{totalBays})
          </span>
          <input
            type="number"
            min={1}
            max={totalBays}
            value={bay}
            disabled={busy}
            onChange={(e) => setBay(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !sameSlot) submit();
              if (e.key === "Escape") onCancel();
            }}
            className="hairline-subtle bg-[var(--surface)] px-6 py-4 text-text tnum disabled:opacity-50 w-full"
            style={{ fontFamily: "var(--mono)", fontSize: 11 }}
          />
        </label>
        <label
          className="flex flex-col gap-2 flex-1"
          style={{ fontFamily: "var(--mono)", fontSize: 9 }}
        >
          <span className="text-text-dim" style={{ letterSpacing: "0.5px" }}>
            LEVEL (1–{totalLevels})
          </span>
          <input
            type="number"
            min={1}
            max={totalLevels}
            value={level}
            disabled={busy}
            onChange={(e) => setLevel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !sameSlot) submit();
              if (e.key === "Escape") onCancel();
            }}
            className="hairline-subtle bg-[var(--surface)] px-6 py-4 text-text tnum disabled:opacity-50 w-full"
            style={{ fontFamily: "var(--mono)", fontSize: 11 }}
          />
        </label>
      </div>
      <div className="flex items-center gap-8">
        <button
          type="button"
          onClick={submit}
          disabled={busy || sameSlot}
          className="hairline-subtle px-10 py-6 inline-flex items-center gap-6 border-[var(--accent-soft)] bg-[var(--accent-dim)] text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? (
            <Loader2 size={10} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <ArrowRightLeft size={10} strokeWidth={1.5} />
          )}
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
            }}
          >
            Move here
          </span>
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="hairline-subtle px-10 py-6 hover:border-[var(--border-hover)] text-text-secondary hover:text-text transition-colors"
        >
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
            }}
          >
            Cancel
          </span>
        </button>
        {sameSlot && (
          <span
            className="ml-auto mono-sm text-text-dim"
            style={{ fontSize: 10 }}
          >
            Pick a different slot
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Existing location row with editable qty + delete ───────────────────

function LocationCard({
  loc,
  busy,
  moving,
  totalBays,
  totalLevels,
  onUpdateQty,
  onRemove,
  onStartMove,
  onCancelMove,
  onMove,
}: {
  loc: LocationRow;
  busy: boolean;
  moving: boolean;
  totalBays: number;
  totalLevels: number;
  onUpdateQty: (qty: number) => void;
  onRemove: () => void;
  onStartMove: () => void;
  onCancelMove: () => void;
  onMove: (toBay: number, toLevel: number) => void | Promise<boolean>;
}) {
  const [draftQty, setDraftQty] = useState(String(loc.quantity ?? 0));
  useEffect(() => {
    setDraftQty(String(loc.quantity ?? 0));
  }, [loc.quantity]);

  const commitQty = () => {
    const n = parseInt(draftQty, 10);
    if (Number.isNaN(n) || n < 0) {
      setDraftQty(String(loc.quantity ?? 0));
      return;
    }
    if (n !== (loc.quantity ?? 0)) onUpdateQty(n);
  };

  return (
    <li className="hairline-subtle flex flex-col">
      <div className="p-10 flex gap-10">
        {loc.product?.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={loc.product.photo_url}
            alt=""
            className="hairline-subtle shrink-0"
            style={{
              width: 40,
              height: 40,
              objectFit: "cover",
              background: "var(--surface-2)",
            }}
          />
        ) : (
          <div
            className="hairline-subtle shrink-0 flex items-center justify-center text-text-dim"
            style={{
              width: 40,
              height: 40,
              background: "var(--surface-2)",
            }}
          >
            <Package size={12} strokeWidth={1.5} />
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <span
            className="text-text truncate"
            style={{
              fontFamily: "var(--display)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {loc.product?.name ?? "Unknown product"}
          </span>
          <span
            className="text-text-dim truncate"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 9,
              letterSpacing: "0.3px",
            }}
          >
            {loc.product?.internal_sku ?? loc.product?.barcode ?? "—"}
          </span>
          <div className="flex items-center gap-6 mt-2">
            <span
              className="label-text text-text-muted"
              style={{ fontSize: 9 }}
            >
              Qty
            </span>
            <input
              type="number"
              min={0}
              value={draftQty}
              disabled={busy}
              onChange={(e) => setDraftQty(e.target.value)}
              onBlur={commitQty}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setDraftQty(String(loc.quantity ?? 0));
              }}
              className="hairline-subtle bg-[var(--surface-2)] px-6 py-2 text-text tnum w-[64px] disabled:opacity-50"
              style={{ fontFamily: "var(--mono)", fontSize: 11 }}
            />
            <button
              type="button"
              onClick={moving ? onCancelMove : onStartMove}
              disabled={busy}
              className={`ml-auto hairline-subtle p-6 transition-colors disabled:opacity-50 ${
                moving
                  ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-dim)]"
                  : "hover:border-[var(--accent)] text-text-secondary hover:text-text"
              }`}
              aria-label={moving ? "Cancel move" : "Move to another slot"}
              title={moving ? "Cancel move" : "Move to another slot"}
            >
              <ArrowRightLeft size={10} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="hairline-subtle p-6 hover:border-[var(--danger)] text-text-secondary hover:text-[var(--danger)] disabled:opacity-50 transition-colors"
              aria-label="Remove location"
              title="Remove from slot"
            >
              {busy ? (
                <Loader2 size={10} strokeWidth={1.5} className="animate-spin" />
              ) : (
                <Trash2 size={10} strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>
      </div>

      {moving && (
        <MoveForm
          fromBay={loc.bay}
          fromLevel={loc.level}
          totalBays={totalBays}
          totalLevels={totalLevels}
          busy={busy}
          onCancel={onCancelMove}
          onSubmit={(b, l) => onMove(b, l)}
        />
      )}
    </li>
  );
}

// ─── Add product form with debounced search ─────────────────────────────

function AddProductForm({
  busy,
  onCancel,
  onAdd,
}: {
  busy: boolean;
  onCancel: () => void;
  onAdd: (product: PickedProduct, quantity: number) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<PickedProduct | null>(null);
  const [qty, setQty] = useState("1");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the search field as soon as the form opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search. Empty/short queries clear results immediately.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchProducts({ query: q });
      setSearching(false);
      if (r.error) {
        setResults([]);
        return;
      }
      setResults(r.products ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const canSubmit = picked !== null && !busy && parseInt(qty, 10) >= 0;

  const submit = () => {
    if (!picked) return;
    const n = parseInt(qty, 10);
    if (Number.isNaN(n) || n < 0) return;
    void onAdd(picked, n);
  };

  return (
    <div className="hairline-subtle p-10 flex flex-col gap-10 bg-[var(--surface-2)]">
      <div className="flex items-center justify-between">
        <p className="label-text text-text-muted" style={{ fontSize: 9 }}>
          Add product
        </p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="hairline-subtle p-5 hover:border-[var(--border-hover)] text-text-secondary hover:text-text transition-colors"
        >
          <X size={10} strokeWidth={1.5} />
        </button>
      </div>

      {!picked ? (
        <>
          <div className="relative">
            <span
              className="absolute left-7 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
              aria-hidden
            >
              <Search size={11} strokeWidth={1.5} />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, SKU, or barcode…"
              className="field-input w-full"
              style={{ paddingLeft: 26 }}
            />
          </div>

          {searching && (
            <div className="flex items-center gap-6 mono-sm text-text-dim">
              <Loader2 size={10} strokeWidth={1.5} className="animate-spin" />
              Searching…
            </div>
          )}

          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
              No products match. Check your spelling or try a barcode.
            </p>
          )}

          {results.length > 0 && (
            <ul className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(p)}
                    className="w-full hairline-subtle bg-[var(--surface)] p-7 flex gap-8 items-center hover:border-[var(--accent)] transition-colors text-left"
                  >
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.photo_url}
                        alt=""
                        className="hairline-subtle shrink-0"
                        style={{
                          width: 28,
                          height: 28,
                          objectFit: "cover",
                          background: "var(--surface-2)",
                        }}
                      />
                    ) : (
                      <div
                        className="hairline-subtle shrink-0 flex items-center justify-center text-text-dim"
                        style={{
                          width: 28,
                          height: 28,
                          background: "var(--surface-2)",
                        }}
                      >
                        <Package size={10} strokeWidth={1.5} />
                      </div>
                    )}
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <span
                        className="text-text truncate"
                        style={{
                          fontFamily: "var(--display)",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {p.name}
                      </span>
                      <span
                        className="text-text-dim truncate"
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 9,
                        }}
                      >
                        {p.internal_sku ?? p.barcode}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="hairline-subtle bg-[var(--surface)] p-7 flex gap-8 items-center">
            {picked.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={picked.photo_url}
                alt=""
                className="hairline-subtle shrink-0"
                style={{
                  width: 28,
                  height: 28,
                  objectFit: "cover",
                  background: "var(--surface-2)",
                }}
              />
            ) : (
              <div
                className="hairline-subtle shrink-0 flex items-center justify-center text-text-dim"
                style={{
                  width: 28,
                  height: 28,
                  background: "var(--surface-2)",
                }}
              >
                <Package size={10} strokeWidth={1.5} />
              </div>
            )}
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span
                className="text-text truncate"
                style={{
                  fontFamily: "var(--display)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {picked.name}
              </span>
              <span
                className="text-text-dim truncate"
                style={{ fontFamily: "var(--mono)", fontSize: 9 }}
              >
                {picked.internal_sku ?? picked.barcode}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="hairline-subtle p-5 hover:border-[var(--border-hover)] text-text-secondary hover:text-text transition-colors"
              aria-label="Pick a different product"
              title="Pick a different product"
            >
              <X size={10} strokeWidth={1.5} />
            </button>
          </div>

          <Input
            label="Quantity"
            type="number"
            min={0}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) submit();
            }}
            autoFocus
          />

          <div className="flex gap-8">
            <CornerButton
              type="button"
              variant="primary"
              size="sm"
              onClick={submit}
              loading={busy}
              disabled={!canSubmit}
            >
              <Plus size={11} strokeWidth={1.5} />
              Add to slot
            </CornerButton>
            <CornerButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </CornerButton>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Stats + empty state ────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="hairline bg-[var(--surface)] px-14 py-12 flex items-start gap-10 flex-1 min-w-[180px]">
      <span
        className="w-26 h-26 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center shrink-0 text-[var(--accent)]"
        aria-hidden
      >
        <Icon size={12} strokeWidth={1.5} />
      </span>
      <div className="flex flex-col gap-2 min-w-0">
        <span className="label-text text-text-muted">{label}</span>
        <span
          className="text-text tnum"
          style={{
            fontFamily: "var(--display)",
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          {value}
        </span>
        <span
          className="text-text-dim truncate"
          style={{ fontFamily: "var(--mono)", fontSize: 10 }}
        >
          {sub}
        </span>
      </div>
    </div>
  );
}

function EmptyHint({ totalLevels }: { totalLevels: number }) {
  return (
    <>
      <p className="label-text text-text-muted">Slot detail</p>
      <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
        Tap any cell in the grid to see what's stored there. From the slot
        detail you can edit quantities, remove items, and place new products.
      </p>
      <p
        className="mono-sm text-text-dim hairline-t pt-12"
        style={{ lineHeight: 1.6 }}
      >
        Levels read top-down — L{totalLevels} sits at the top of the rack, L1 at
        the floor. Bays read left to right.
      </p>
    </>
  );
}
