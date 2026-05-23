import { KioskShell } from "@/components/kiosk/KioskShell";
import { KioskBoard } from "@/components/kiosk/KioskBoard";
import { InventoryRealtime } from "@/components/realtime/PageRealtime";
import { getActiveScope } from "@/lib/facilityScope";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getKioskData, type KioskData } from "@/lib/data/kiosk";

export const metadata = { title: "Kiosk" };

const EMPTY: KioskData = {
  scansToday: 0,
  scans14d: new Array(14).fill(0),
  scansDelta: null,
  unitsOnHand: 0,
  productCount: 0,
  lowStockCount: 0,
  lowStock: [],
  topMovers: [],
  recentScans: [],
  openOrdersCount: 0,
  pickQueue: [],
  posInTransit: [],
};

export default async function KioskPage() {
  const scope = await getActiveScope();
  const ctx = await getCurrentOrgContext();
  const facilityId = scope.mode === "single" ? scope.id : null;
  const facilityName = scope.mode === "single" ? scope.name : "All facilities";

  const data = ctx ? await getKioskData(ctx.orgId, facilityId) : EMPTY;

  return (
    <KioskShell refreshSec={60} wakeLock>
      {/* Reuse the inventory realtime channel so scans/stock changes refresh
          the board live; KioskShell's timer is the backstop. */}
      <InventoryRealtime warehouseId={facilityId} />
      <KioskBoard data={data} facilityName={facilityName} />
    </KioskShell>
  );
}
