/**
 * Sample datasets — one per industry plus a general fallback. Pure data.
 *
 * Each catalog is small but complete enough that every dashboard widget has
 * something to show: three sections, three suppliers, four customers and ten
 * products with on-hand stock placed in real bays. Two products per catalog
 * sit below their reorder point (reorder alerts), one supplier gets a PO in
 * transit, two customers get open orders, and the seeder backdates scans so
 * the activity sparkline has a shape. See lib/sampleData/actions.ts.
 */

import type { IndustrySlug } from "@/lib/industries";

export interface SampleSection {
  code: string;
  name: string;
  bays: number;
  levels: number;
}

export interface SampleSupplier {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  paymentTerms: "net_15" | "net_30" | "net_60" | "due_on_receipt";
  leadTimeDays: number;
}

export interface SampleCustomer {
  name: string;
  companyName: string | null;
  email: string;
  phone: string;
  city: string;
  state: string;
}

export interface SampleProduct {
  barcode: string;
  sku: string;
  name: string;
  category: string;
  manufacturer: string;
  unitCost: number;
  unitPrice: number;
  reorderPoint: number;
  safetyStock: number;
  leadTimeDays: number;
  /** Index into the catalog's suppliers. */
  supplier: number;
  /** "SECTION-BAY-LEVEL" within the catalog's sections. */
  location: string;
  qty: number;
  weight: string | null;
}

export interface SampleCatalog {
  key: IndustrySlug | "general";
  sections: SampleSection[];
  suppliers: SampleSupplier[];
  customers: SampleCustomer[];
  products: SampleProduct[];
}

/** Every catalog shares this floor plan: two racks and a bulk floor. */
const SECTIONS: SampleSection[] = [
  { code: "A", name: "Rack A", bays: 6, levels: 4 },
  { code: "B", name: "Rack B", bays: 6, levels: 4 },
  { code: "C", name: "Bulk floor", bays: 4, levels: 1 },
];

/** Every catalog places its ten products on the same ten slots. */
const SLOTS = [
  "A-1-1",
  "A-1-2",
  "A-2-1",
  "A-3-3",
  "A-5-2",
  "B-1-1",
  "B-2-4",
  "B-4-2",
  "C-1-1",
  "C-3-1",
];

/**
 * Compact product row: [sku, name, category, manufacturer, cost, price,
 * reorderPoint, qty, supplierIdx, weight]. Barcode + slot + safety stock +
 * lead time are derived, so a catalog stays readable.
 */
type Row = [
  sku: string,
  name: string,
  category: string,
  manufacturer: string,
  cost: number,
  price: number,
  reorder: number,
  qty: number,
  supplier: number,
  weight: string | null
];

function barcode(catalogIndex: number, i: number): string {
  // 12 digits, deterministic, never a real GS1 prefix: 04 CC 00 NNNNNN.
  return `04${String(catalogIndex).padStart(2, "0")}00${String(i + 1).padStart(
    6,
    "0"
  )}`;
}

function build(
  key: SampleCatalog["key"],
  catalogIndex: number,
  suppliers: SampleSupplier[],
  customers: SampleCustomer[],
  rows: Row[]
): SampleCatalog {
  return {
    key,
    sections: SECTIONS,
    suppliers,
    customers,
    products: rows.map((r, i) => ({
      barcode: barcode(catalogIndex, i),
      sku: r[0],
      name: r[1],
      category: r[2],
      manufacturer: r[3],
      unitCost: r[4],
      unitPrice: r[5],
      reorderPoint: r[6],
      safetyStock: Math.max(2, Math.round(r[6] / 4)),
      leadTimeDays: suppliers[r[8]]?.leadTimeDays ?? 10,
      supplier: r[8],
      location: SLOTS[i % SLOTS.length],
      qty: r[7],
      weight: r[9],
    })),
  };
}

const s = (
  name: string,
  contactName: string,
  email: string,
  phone: string,
  city: string,
  state: string,
  paymentTerms: SampleSupplier["paymentTerms"],
  leadTimeDays: number
): SampleSupplier => ({
  name,
  contactName,
  email,
  phone,
  city,
  state,
  paymentTerms,
  leadTimeDays,
});

const c = (
  name: string,
  companyName: string | null,
  email: string,
  phone: string,
  city: string,
  state: string
): SampleCustomer => ({ name, companyName, email, phone, city, state });

const CATALOGS: SampleCatalog[] = [
  build(
    "general",
    0,
    [
      s("Northline Supply Co.", "Dana Whitfield", "orders@northlinesupply.example", "(404) 555-0142", "Atlanta", "GA", "net_30", 7),
      s("PackRight Packaging", "Luis Ortega", "sales@packright.example", "(614) 555-0188", "Columbus", "OH", "net_30", 5),
      s("SafeHands PPE", "Mira Kowalski", "hello@safehands.example", "(312) 555-0107", "Chicago", "IL", "net_15", 10),
    ],
    [
      c("Harbor Street Studio", "Harbor Street Studio", "ops@harborstreet.example", "(206) 555-0131", "Seattle", "WA"),
      c("Alex Rivera", null, "alex.rivera@example.com", "(512) 555-0119", "Austin", "TX"),
      c("Cedar & Co.", "Cedar & Co.", "buying@cedarandco.example", "(303) 555-0164", "Denver", "CO"),
      c("Nora Haddad", null, "nora.haddad@example.com", "(617) 555-0152", "Boston", "MA"),
    ],
    [
      ["TOTE-27", "Storage Tote 27 gal", "Supplies", "Northline", 9.4, 16.99, 12, 4, 0, "3.1 lb"],
      ["SHELF-5T", "Shelving Unit 5-tier Steel", "Equipment", "Northline", 68, 119, 4, 9, 0, "42 lb"],
      ["HTRUCK-600", "Hand Truck 600 lb", "Equipment", "Northline", 54, 96, 3, 6, 0, "27 lb"],
      ["WRAP-18-4", "Stretch Wrap 18 in (case of 4)", "Packaging", "PackRight", 21.5, 34, 10, 26, 1, "24 lb"],
      ["TAPE-2-36", "Packing Tape 2 in (case of 36)", "Packaging", "PackRight", 31, 49, 8, 18, 1, "18 lb"],
      ["LBL-4X6-500", "Shipping Labels 4x6 (roll of 500)", "Packaging", "PackRight", 6.2, 11.5, 10, 3, 1, "2.2 lb"],
      ["GLASS-CLR", "Safety Glasses Clear", "Safety", "SafeHands", 1.9, 4.5, 24, 60, 2, "0.1 lb"],
      ["GLOVE-L-12", "Work Gloves L (12-pack)", "Safety", "SafeHands", 14, 24, 10, 22, 2, "1.8 lb"],
      ["FLTAPE-YEL", "Floor Marking Tape Yellow 2 in", "Safety", "SafeHands", 7.8, 14, 6, 15, 2, "1.1 lb"],
      ["SCAN-2D", "Barcode Scanner 2D USB", "Equipment", "Northline", 62, 109, 2, 5, 0, "0.6 lb"],
    ]
  ),
  build(
    "flooring-building-materials",
    1,
    [
      s("Northwind Hardwood Co.", "Dana Whitfield", "orders@northwindhardwood.example", "(404) 555-0142", "Atlanta", "GA", "net_30", 10),
      s("Tilecraft Distributors", "Rosa Delgado", "sales@tilecraft.example", "(214) 555-0177", "Dallas", "TX", "net_30", 7),
      s("BondRight Adhesives", "Sam Okafor", "orders@bondright.example", "(614) 555-0188", "Columbus", "OH", "net_15", 5),
    ],
    [
      c("Priya Raman", "Raman Interiors LLC", "priya@ramaninteriors.example", "(404) 555-0199", "Atlanta", "GA"),
      c("Marcus Bell", null, "marcus.bell@example.com", "(770) 555-0123", "Marietta", "GA"),
      c("Oak & Ash Builders", "Oak & Ash Builders", "office@oakandash.example", "(678) 555-0150", "Roswell", "GA"),
      c("Lena Fischer", null, "lena.fischer@example.com", "(404) 555-0161", "Decatur", "GA"),
    ],
    [
      ["WO-PLK-7", "White Oak Plank 7 in Natural", "Hardwood", "Northwind", 4.85, 7.99, 120, 40, 0, "2.4 lb"],
      ["HK-PLK-5", "Hickory Plank 5 in Smoked", "Hardwood", "Northwind", 4.1, 6.89, 80, 210, 0, "2.1 lb"],
      ["MP-ENG-6", "Maple Engineered 6 in Matte", "Hardwood", "Northwind", 3.65, 5.99, 80, 160, 0, "1.9 lb"],
      ["LAM-12-GA", "Laminate 12 mm Grey Ash", "Laminate", "Tilecraft", 1.45, 2.79, 200, 640, 1, "1.6 lb"],
      ["TL-24-CAR", "Porcelain Tile 24x24 Carrara", "Tile", "Tilecraft", 2.9, 5.49, 150, 420, 1, "9.8 lb"],
      ["TL-SUB-WHT", "Ceramic Subway 3x6 White (box)", "Tile", "Tilecraft", 12, 21.9, 30, 12, 1, "11 lb"],
      ["MORTAR-50", "Thinset Mortar 50 lb", "Adhesives & Underlayment", "BondRight", 14.5, 24.9, 20, 46, 2, "50 lb"],
      ["UNDER-100", "Underlayment Roll 100 sq ft", "Adhesives & Underlayment", "BondRight", 22, 39, 15, 33, 2, "9 lb"],
      ["QR-OAK-8", "Quarter Round Oak 8 ft", "Trim", "Northwind", 6.4, 11.5, 40, 96, 0, "1.2 lb"],
      ["TRANS-AL-72", "Transition Strip Aluminum 72 in", "Trim", "Tilecraft", 9.8, 17.99, 20, 38, 1, "1.4 lb"],
    ]
  ),
  build(
    "manufacturing-assembly",
    2,
    [
      s("Precision Fastener Supply", "Greg Lindqvist", "orders@precisionfastener.example", "(216) 555-0140", "Cleveland", "OH", "net_30", 5),
      s("Midwest Bearing & Drive", "Tanya Brooks", "sales@midwestbearing.example", "(414) 555-0172", "Milwaukee", "WI", "net_30", 8),
      s("Voltek Components", "Ravi Menon", "orders@voltek.example", "(408) 555-0195", "San Jose", "CA", "net_15", 12),
    ],
    [
      c("Apex Robotics", "Apex Robotics Inc.", "purchasing@apexrobotics.example", "(412) 555-0133", "Pittsburgh", "PA"),
      c("Dana Whitfield", null, "dana.whitfield@example.com", "(330) 555-0148", "Akron", "OH"),
      c("Harbor Marine Systems", "Harbor Marine Systems", "parts@harbormarine.example", "(410) 555-0181", "Baltimore", "MD"),
      c("Tomas Ruiz", null, "tomas.ruiz@example.com", "(773) 555-0126", "Chicago", "IL"),
    ],
    [
      ["BOLT-M8X40", "Hex Bolt M8x40 Zinc (box of 100)", "Fasteners", "Precision", 8.9, 15.5, 20, 6, 0, "3.4 lb"],
      ["NUT-M8-NYL", "Lock Nut M8 Nylon (box of 100)", "Fasteners", "Precision", 4.2, 7.9, 20, 48, 0, "1.1 lb"],
      ["WASH-M8-SS", "Flat Washer M8 Stainless (box of 200)", "Fasteners", "Precision", 5.6, 9.9, 15, 31, 0, "1.6 lb"],
      ["BRG-6204", "Deep Groove Bearing 6204-2RS", "Bearings", "Midwest", 3.1, 6.25, 40, 150, 1, "0.23 lb"],
      ["MOT-NEMA23", "Stepper Motor NEMA 23 2.8 A", "Motors", "Voltek", 24, 42, 10, 27, 2, "1.5 lb"],
      ["MOT-BL750", "Brushless Motor 750 W 48 V", "Motors", "Voltek", 88, 149, 6, 4, 2, "5.2 lb"],
      ["PCB-CTRL-C", "Control Board Rev C", "Electronics", "Voltek", 31, 58, 12, 40, 2, "0.3 lb"],
      ["SW-LIMIT-R", "Limit Switch Roller Lever", "Electronics", "Voltek", 2.7, 5.4, 25, 90, 2, "0.1 lb"],
      ["ENC-AL-200", "Aluminum Enclosure 200x150x80", "Enclosures", "Midwest", 19, 34, 8, 22, 1, "1.9 lb"],
      ["HARN-12P", "Wiring Harness 12-pin 1 m", "Electronics", "Voltek", 6.5, 12, 15, 44, 2, "0.4 lb"],
    ]
  ),
  build(
    "food-beverage",
    3,
    [
      s("Sunrise Farms Co-op", "Ellen Marsh", "orders@sunrisefarms.example", "(802) 555-0114", "Burlington", "VT", "net_15", 3),
      s("Blue Ridge Beverages", "Caleb Nguyen", "sales@blueridgebev.example", "(828) 555-0167", "Asheville", "NC", "net_30", 5),
      s("PackRight Packaging", "Luis Ortega", "sales@packright.example", "(614) 555-0188", "Columbus", "OH", "net_30", 5),
    ],
    [
      c("Corner Market Deli", "Corner Market Deli", "orders@cornermarketdeli.example", "(802) 555-0138", "Burlington", "VT"),
      c("Anika Sato", null, "anika.sato@example.com", "(603) 555-0121", "Portsmouth", "NH"),
      c("Riverbend Cafe", "Riverbend Cafe LLC", "hello@riverbendcafe.example", "(207) 555-0175", "Portland", "ME"),
      c("Jordan Lee", null, "jordan.lee@example.com", "(413) 555-0159", "Northampton", "MA"),
    ],
    [
      ["OATS-25", "Organic Rolled Oats 25 lb", "Dry Goods", "Sunrise", 28, 44, 10, 3, 0, "25 lb"],
      ["ESP-5-DK", "Espresso Beans 5 lb Dark Roast", "Beverages", "Blue Ridge", 42, 69, 8, 19, 1, "5 lb"],
      ["CB-CONC-1G", "Cold Brew Concentrate 1 gal", "Beverages", "Blue Ridge", 18, 32, 12, 30, 1, "8.6 lb"],
      ["SPK-12-355", "Sparkling Water 12x355 ml", "Beverages", "Blue Ridge", 6.4, 11.9, 24, 72, 1, "10 lb"],
      ["MILK-1G", "Whole Milk 1 gal", "Dairy", "Sunrise", 3.2, 4.99, 20, 44, 0, "8.6 lb"],
      ["YOG-GRK-32", "Greek Yogurt 32 oz", "Dairy", "Sunrise", 3.6, 6.49, 15, 5, 0, "2.1 lb"],
      ["BERRY-FRZ-5", "Frozen Mixed Berries 5 lb", "Frozen", "Sunrise", 11, 18.5, 10, 26, 0, "5 lb"],
      ["ICE-VAN-3G", "Vanilla Ice Cream 3 gal Tub", "Frozen", "Sunrise", 21, 36, 6, 14, 0, "13 lb"],
      ["BOX-KRAFT-8", "Kraft Takeout Box 8 in (case of 200)", "Packaging", "PackRight", 34, 52, 5, 12, 2, "14 lb"],
      ["CUP-12-1000", "Compostable Cups 12 oz (case of 1000)", "Packaging", "PackRight", 58, 84, 4, 9, 2, "22 lb"],
    ]
  ),
  build(
    "automotive-parts",
    4,
    [
      s("Metro Parts Warehouse", "Rick Alvarez", "orders@metroparts.example", "(313) 555-0146", "Detroit", "MI", "net_30", 4),
      s("Northline Brake Co.", "Jenna Park", "sales@northlinebrake.example", "(216) 555-0183", "Cleveland", "OH", "net_30", 7),
      s("AmpStart Electrical", "Omar Haddad", "orders@ampstart.example", "(614) 555-0129", "Columbus", "OH", "net_15", 6),
    ],
    [
      c("Bay Street Auto Repair", "Bay Street Auto Repair", "service@baystreetauto.example", "(313) 555-0155", "Detroit", "MI"),
      c("Chris Okafor", null, "chris.okafor@example.com", "(734) 555-0117", "Ann Arbor", "MI"),
      c("Fleet One Logistics", "Fleet One Logistics", "fleet@fleetone.example", "(419) 555-0192", "Toledo", "OH"),
      c("Mei Chen", null, "mei.chen@example.com", "(248) 555-0136", "Troy", "MI"),
    ],
    [
      ["OF-4967", "Oil Filter OF-4967", "Filters", "Metro", 3.4, 7.99, 30, 8, 0, "0.6 lb"],
      ["AF-1122", "Engine Air Filter AF-1122", "Filters", "Metro", 6.8, 14.99, 20, 55, 0, "0.9 lb"],
      ["CF-8804", "Cabin Air Filter CF-8804", "Filters", "Metro", 5.2, 12.49, 20, 47, 0, "0.5 lb"],
      ["BP-2201", "Ceramic Brake Pads Front BP-2201", "Brakes", "Northline", 22, 44.99, 12, 31, 1, "4.2 lb"],
      ["BR-3050", "Brake Rotor 300 mm BR-3050", "Brakes", "Northline", 29, 59.99, 10, 24, 1, "15 lb"],
      ["BAT-G35-AGM", "AGM Battery Group 35", "Electrical", "AmpStart", 118, 189, 6, 2, 2, "41 lb"],
      ["ALT-130-RM", "Alternator 130 A Remanufactured", "Electrical", "AmpStart", 96, 169, 4, 11, 2, "13 lb"],
      ["OIL-5W30-5Q", "Synthetic Oil 5W-30 5 qt", "Fluids", "Metro", 17, 28.99, 24, 66, 0, "9.6 lb"],
      ["COOL-5050-1G", "Coolant 50/50 1 gal", "Fluids", "Metro", 7.9, 14.49, 18, 40, 0, "8.4 lb"],
      ["SA-7710", "Strut Assembly Front SA-7710", "Suspension", "Northline", 61, 119, 6, 15, 1, "12 lb"],
    ]
  ),
  build(
    "pharmaceuticals-medical",
    5,
    [
      s("MedSource Distribution", "Helen Park", "orders@medsource.example", "(617) 555-0140", "Boston", "MA", "net_30", 4),
      s("SafeHands PPE", "Mira Kowalski", "hello@safehands.example", "(312) 555-0107", "Chicago", "IL", "net_15", 10),
      s("ClearPath Diagnostics", "Ben Ashford", "sales@clearpathdx.example", "(919) 555-0166", "Raleigh", "NC", "net_30", 8),
    ],
    [
      c("Lakeside Family Clinic", "Lakeside Family Clinic", "supplies@lakesideclinic.example", "(617) 555-0173", "Cambridge", "MA"),
      c("Dr. Amara Osei", null, "amara.osei@example.com", "(781) 555-0128", "Newton", "MA"),
      c("Harbor Pharmacy", "Harbor Pharmacy Inc.", "orders@harborpharmacy.example", "(508) 555-0154", "New Bedford", "MA"),
      c("Elena Morales", null, "elena.morales@example.com", "(401) 555-0189", "Providence", "RI"),
    ],
    [
      ["IBU-200-500", "Ibuprofen 200 mg (bottle of 500)", "OTC Medication", "MedSource", 9.5, 17.99, 12, 3, 0, "1.2 lb"],
      ["ACET-500-100", "Acetaminophen 500 mg (bottle of 100)", "OTC Medication", "MedSource", 3.8, 7.49, 15, 38, 0, "0.4 lb"],
      ["GAUZE-4X4-200", "Sterile Gauze 4x4 (box of 200)", "Wound Care", "MedSource", 11, 19.9, 10, 27, 0, "1.5 lb"],
      ["BAND-AST-100", "Adhesive Bandages Assorted (box of 100)", "Wound Care", "MedSource", 4.6, 8.99, 12, 33, 0, "0.5 lb"],
      ["GLV-NIT-M-200", "Nitrile Gloves M (box of 200)", "PPE", "SafeHands", 12, 21.5, 20, 58, 1, "2.2 lb"],
      ["MASK-L2-50", "Surgical Masks Level 2 (box of 50)", "PPE", "SafeHands", 6.2, 12.9, 20, 5, 1, "0.7 lb"],
      ["THERM-DIG", "Digital Thermometer", "Diagnostics", "ClearPath", 7.4, 14.99, 8, 19, 2, "0.2 lb"],
      ["BP-CUFF-AD", "Blood Pressure Cuff Adult", "Diagnostics", "ClearPath", 26, 49, 5, 12, 2, "0.9 lb"],
      ["ALC-PAD-200", "Alcohol Prep Pads (box of 200)", "Consumables", "MedSource", 3.1, 6.49, 15, 41, 0, "0.6 lb"],
      ["SYR-3ML-100", "Syringe 3 ml Luer Lock (box of 100)", "Consumables", "MedSource", 9.8, 17.5, 10, 22, 0, "1.3 lb"],
    ]
  ),
  build(
    "ecommerce-3pl",
    6,
    [
      s("Urban Thread Apparel", "Kim Delacroix", "wholesale@urbanthread.example", "(213) 555-0112", "Los Angeles", "CA", "net_30", 9),
      s("Nordic Home Goods", "Anders Holm", "orders@nordichome.example", "(503) 555-0170", "Portland", "OR", "net_30", 14),
      s("PackRight Packaging", "Luis Ortega", "sales@packright.example", "(614) 555-0188", "Columbus", "OH", "net_30", 5),
    ],
    [
      c("Lumen Candle Co.", "Lumen Candle Co.", "ops@lumencandle.example", "(415) 555-0147", "San Francisco", "CA"),
      c("Nova Fitness Brand", "Nova Fitness Brand", "fulfillment@novafitness.example", "(310) 555-0183", "Santa Monica", "CA"),
      c("Sam Patel", null, "sam.patel@example.com", "(408) 555-0125", "San Jose", "CA"),
      c("Gilded Paper Studio", "Gilded Paper Studio", "hello@gildedpaper.example", "(916) 555-0158", "Sacramento", "CA"),
    ],
    [
      ["TEE-BLK-M", "Crewneck Tee Black M", "Apparel", "Urban Thread", 6.2, 24, 40, 12, 0, "0.4 lb"],
      ["TEE-BLK-L", "Crewneck Tee Black L", "Apparel", "Urban Thread", 6.2, 24, 40, 118, 0, "0.45 lb"],
      ["HOOD-GRY-L", "Hoodie Heather Grey L", "Apparel", "Urban Thread", 14.5, 48, 20, 57, 0, "1.1 lb"],
      ["CNDL-CDR-8", "Soy Candle Cedar 8 oz", "Home", "Nordic", 5.8, 22, 30, 84, 1, "0.8 lb"],
      ["THROW-LIN-OAT", "Linen Throw Oatmeal", "Home", "Nordic", 19, 58, 10, 26, 1, "1.6 lb"],
      ["CBL-USBC-2M", "USB-C Cable 2 m Braided", "Electronics Accessories", "Nordic", 2.4, 12.99, 50, 9, 1, "0.1 lb"],
      ["STAND-PH-AL", "Phone Stand Aluminum", "Electronics Accessories", "Nordic", 4.1, 18, 25, 61, 1, "0.3 lb"],
      ["BOX-10X8X4-50", "Mailer Box 10x8x4 (case of 50)", "Packaging", "PackRight", 24, 39, 6, 17, 2, "12 lb"],
      ["POLY-12X15-500", "Poly Mailer 12x15 (case of 500)", "Packaging", "PackRight", 28, 46, 5, 11, 2, "9 lb"],
      ["BALM-MINT-12", "Lip Balm Mint (12-pack)", "Beauty", "Urban Thread", 9, 30, 15, 36, 0, "0.5 lb"],
    ]
  ),
  build(
    "electrical-plumbing",
    7,
    [
      s("Copperline Electrical Supply", "Walt Jensen", "orders@copperline.example", "(602) 555-0116", "Phoenix", "AZ", "net_30", 4),
      s("Tri-State Plumbing Wholesale", "Bea Romero", "sales@tristateplumbing.example", "(702) 555-0179", "Las Vegas", "NV", "net_30", 6),
      s("BrightBeam Lighting", "Noah Feld", "orders@brightbeam.example", "(858) 555-0134", "San Diego", "CA", "net_15", 9),
    ],
    [
      c("Ridgeway Electric LLC", "Ridgeway Electric LLC", "office@ridgewayelectric.example", "(602) 555-0143", "Phoenix", "AZ"),
      c("Paul Nakamura", null, "paul.nakamura@example.com", "(480) 555-0120", "Tempe", "AZ"),
      c("Summit Mechanical", "Summit Mechanical", "purchasing@summitmech.example", "(520) 555-0197", "Tucson", "AZ"),
      c("Grace Adeyemi", null, "grace.adeyemi@example.com", "(623) 555-0165", "Glendale", "AZ"),
    ],
    [
      ["THHN-12-BLK", "THHN 12 AWG Black 500 ft", "Wire & Cable", "Copperline", 68, 109, 6, 2, 0, "17 lb"],
      ["NM-14-2-250", "Romex NM-B 14/2 250 ft", "Wire & Cable", "Copperline", 54, 89, 8, 21, 0, "13 lb"],
      ["BRK-20A-1P", "20 A Single-Pole Breaker", "Breakers & Panels", "Copperline", 4.9, 9.99, 30, 96, 0, "0.3 lb"],
      ["PNL-200-40", "200 A Main Panel 40-space", "Breakers & Panels", "Copperline", 142, 229, 3, 7, 0, "24 lb"],
      ["PEX-34-100R", "PEX 3/4 in 100 ft Red", "Fittings", "Tri-State", 38, 62, 8, 24, 1, "9 lb"],
      ["PEX-RING-34", "PEX Crimp Ring 3/4 in (bag of 100)", "Fittings", "Tri-State", 11, 19.5, 12, 4, 1, "1.4 lb"],
      ["VLV-BALL-34", "Ball Valve 3/4 in Brass", "Valves", "Tri-State", 7.6, 14.99, 20, 52, 1, "0.8 lb"],
      ["PTRAP-112", "P-Trap 1-1/2 in PVC", "Fittings", "Tri-State", 2.3, 5.49, 25, 70, 1, "0.4 lb"],
      ["DL-6-3000K", "LED Downlight 6 in 3000K", "Fixtures", "BrightBeam", 8.4, 16.99, 24, 88, 2, "0.5 lb"],
      ["GFCI-20-WHT", "GFCI Outlet 20 A White", "Fixtures", "Copperline", 9.1, 17.49, 20, 45, 0, "0.3 lb"],
    ]
  ),
  build(
    "agriculture-seed",
    8,
    [
      s("Prairie Seed Genetics", "Hank Voss", "orders@prairieseed.example", "(515) 555-0141", "Des Moines", "IA", "net_60", 14),
      s("GreenAcre Nutrients", "Maya Thompson", "sales@greenacre.example", "(402) 555-0168", "Lincoln", "NE", "net_30", 7),
      s("FlowLine Irrigation", "Diego Serrano", "orders@flowline.example", "(559) 555-0135", "Fresno", "CA", "net_30", 10),
    ],
    [
      c("Bennett Family Farms", "Bennett Family Farms", "office@bennettfarms.example", "(515) 555-0180", "Ames", "IA"),
      c("Ines Delgado", null, "ines.delgado@example.com", "(319) 555-0113", "Iowa City", "IA"),
      c("Rolling Hills Orchard", "Rolling Hills Orchard", "orders@rollinghillsorchard.example", "(563) 555-0196", "Dubuque", "IA"),
      c("Kwame Mensah", null, "kwame.mensah@example.com", "(641) 555-0157", "Mason City", "IA"),
    ],
    [
      ["CORN-HYB-80K", "Hybrid Corn Seed 80k (bag)", "Seed", "Prairie", 210, 289, 20, 6, 0, "50 lb"],
      ["SOY-140K", "Soybean Seed 140k (bag)", "Seed", "Prairie", 48, 69, 30, 85, 0, "50 lb"],
      ["WHEAT-W-50", "Winter Wheat Seed 50 lb", "Seed", "Prairie", 24, 36, 20, 52, 0, "50 lb"],
      ["UREA-46-50", "Urea 46-0-0 (50 lb)", "Fertilizer", "GreenAcre", 26, 39, 40, 130, 1, "50 lb"],
      ["POTASH-60-50", "Potash 0-0-60 (50 lb)", "Fertilizer", "GreenAcre", 22, 34, 30, 96, 1, "50 lb"],
      ["GLY-41-25", "Glyphosate 41% (2.5 gal)", "Crop Protection", "GreenAcre", 38, 59, 12, 3, 1, "24 lb"],
      ["FUNG-AZOXY-1", "Fungicide Azoxystrobin (1 gal)", "Crop Protection", "GreenAcre", 112, 169, 6, 14, 1, "9.5 lb"],
      ["DRIP-8-7500", "Drip Tape 8 mil 7500 ft", "Irrigation", "FlowLine", 96, 149, 5, 11, 2, "31 lb"],
      ["TANK-1100", "Poly Tank 1100 gal", "Irrigation", "FlowLine", 640, 899, 1, 3, 2, "210 lb"],
      ["TWINE-9000", "Baler Twine 9000 ft", "Supplies", "GreenAcre", 29, 44, 10, 27, 1, "20 lb"],
    ]
  ),
];

const BY_KEY = new Map(CATALOGS.map((cat) => [cat.key, cat]));

export const SAMPLE_CATALOGS: readonly SampleCatalog[] = CATALOGS;

/** The catalog for an industry slug; unknown / null → the general set. */
export function sampleCatalogFor(industry: string | null | undefined): SampleCatalog {
  return (industry && BY_KEY.get(industry as IndustrySlug)) || BY_KEY.get("general")!;
}

/**
 * The derived activity the seeder writes: which products the PO, the two
 * open orders and the backdated scans use. Kept here (pure) so the tests can
 * assert every reference resolves.
 */
export function sampleActivity(catalog: SampleCatalog) {
  const p = catalog.products;
  const fromSupplier0 = p.filter((x) => x.supplier === 0).slice(0, 3);
  return {
    purchaseOrder: {
      supplier: 0,
      expectedInDays: 5,
      sentDaysAgo: 2,
      lines: fromSupplier0.map((x) => ({
        product: x,
        quantity: Math.max(x.reorderPoint * 2, 12),
      })),
    },
    orders: [
      {
        customer: 0,
        status: "created" as const,
        lines: [
          { product: p[3], quantity: 2 },
          { product: p[4], quantity: 1 },
        ],
      },
      {
        customer: 2,
        status: "in_progress" as const,
        lines: [
          { product: p[6], quantity: 3 },
          { product: p[7], quantity: 2 },
        ],
      },
    ],
    scans: [
      ...p.slice(0, 6).map((x, i) => ({
        product: x,
        action: "register" as const,
        daysAgo: 13 - i,
        quantity: x.qty,
      })),
      { product: p[3], action: "pick" as const, daysAgo: 6, quantity: 2 },
      { product: p[8], action: "receive" as const, daysAgo: 3, quantity: 20 },
      { product: p[6], action: "pick" as const, daysAgo: 4, quantity: 3 },
      { product: p[1], action: "cycle_count" as const, daysAgo: 1, quantity: p[1].qty },
      { product: p[2], action: "locate" as const, daysAgo: 0, quantity: null },
    ],
  };
}
