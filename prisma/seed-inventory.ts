/**
 * Executable Master Data MVP seed inventory. This file is the canonical list;
 * current owner direction is recorded in docs/apps/masterdata.md.
 *
 * This module is a pure transcription of the owner-approved inventory. It
 * contains no I/O so both the seed runner and the seed contract tests consume
 * exactly the same locked values.
 */

export type UnitUsageCode = "DIMENSION" | "QUANTITY" | "USAGE" | "PURCHASE" | "RATE";

export type UnitSeed = {
  code: string;
  label: string;
  usages: UnitUsageCode[];
  aliases: string[];
};

export type BusinessTypeSeed = {
  code: string;
  label: string;
};

export type ProductCategorySeed = {
  name: string;
  search_synonyms: string[];
};

export type WorkRootSeed = { name: string };
export type WorkChildSeed = { parent: string; name: string };

/// Units — one controlled dictionary. `usages` restricts picker context and
/// introduces no conversion semantics. Order is the locked inventory order;
/// it determines deterministic `sort_order`.
export const UNIT_SEEDS: readonly UnitSeed[] = [
  { code: "pcs", label: "pcs", usages: ["QUANTITY", "PURCHASE", "RATE"], aliases: ["piece", "pieces", "buah"] },
  { code: "sheet", label: "lembar", usages: ["PURCHASE", "RATE"], aliases: ["sheet", "lembar"] },
  { code: "m", label: "m", usages: ["DIMENSION", "USAGE", "PURCHASE", "RATE"], aliases: ["meter", "metre", "m'"] },
  { code: "m2", label: "m²", usages: ["USAGE", "PURCHASE", "RATE"], aliases: ["m2", "sqm", "square meter"] },
  { code: "point", label: "titik", usages: ["RATE"], aliases: ["point", "titik"] },
  { code: "roll", label: "roll", usages: ["PURCHASE", "RATE"], aliases: ["gulung", "roll"] },
  { code: "kg", label: "kg", usages: ["PURCHASE", "RATE"], aliases: ["kilogram"] },
  { code: "ls", label: "lump sum", usages: ["RATE"], aliases: ["lumpsum", "lump sum"] },
  { code: "person-day", label: "orang-hari", usages: ["RATE"], aliases: ["org-hari", "man-day"] },
  { code: "mm", label: "mm", usages: ["DIMENSION"], aliases: ["millimeter", "millimetre"] },
  { code: "cm", label: "cm", usages: ["DIMENSION"], aliases: ["centimeter", "centimetre"] },
  { code: "in", label: "in", usages: ["DIMENSION"], aliases: ["inch", "inches"] },
  { code: "ft", label: "ft", usages: ["DIMENSION"], aliases: ["foot", "feet"] },
  { code: "set", label: "set", usages: ["QUANTITY", "PURCHASE", "RATE"], aliases: ["set"] },
  { code: "pair", label: "pasang", usages: ["QUANTITY", "PURCHASE", "RATE"], aliases: ["pair", "pasang"] },
  { code: "box", label: "box", usages: ["PURCHASE", "RATE"], aliases: ["carton", "karton", "box"] },
  { code: "pack", label: "pack", usages: ["PURCHASE", "RATE"], aliases: ["package", "paket", "pack"] },
  { code: "bag", label: "sak", usages: ["PURCHASE", "RATE"], aliases: ["sack", "bag", "sak"] },
  { code: "bar", label: "batang", usages: ["PURCHASE", "RATE"], aliases: ["bar", "batang"] },
  { code: "m3", label: "m³", usages: ["USAGE", "PURCHASE", "RATE"], aliases: ["m3", "cubic meter"] },
  { code: "l", label: "liter", usages: ["PURCHASE", "RATE"], aliases: ["litre", "liter", "ltr"] },
  { code: "hour", label: "jam", usages: ["RATE"], aliases: ["hour", "hr", "jam"] },
  { code: "day", label: "hari", usages: ["RATE"], aliases: ["day", "hari"] },
  { code: "lot", label: "lot", usages: ["PURCHASE", "RATE"], aliases: ["lot"] },
];

/// Business nature dictionary. Descriptive only; never grants operational
/// eligibility implicitly.
export const BUSINESS_TYPE_SEEDS: readonly BusinessTypeSeed[] = [
  { code: "MANUFACTURER", label: "Manufacturer" },
  { code: "DISTRIBUTOR", label: "Distributor" },
  { code: "RETAILER", label: "Retailer" },
  { code: "CONTRACTOR", label: "Contractor" },
  { code: "SERVICE_PROVIDER", label: "Service Provider" },
];

/// The 40 inherited PRODUCT categories followed by the three evidence-backed
/// gaps (43 total). All flat: parent_id=null, path=null.
const PRODUCT_CATEGORY_NAMES: readonly string[] = [
  "HPL",
  "Compact Laminate",
  "Decorative PVC Sheet",
  "Veneer",
  "Melamine Faced Board (MFC)",
  "Edgebanding",
  "Plywood",
  "MDF",
  "Particleboard",
  "Solid Wood",
  "Engineered Wood Flooring",
  "SPC Flooring",
  "LVT / Vinyl Flooring",
  "Carpet",
  "Homogeneous Tile (HT)",
  "Ceramic & Porcelain Tile",
  "Natural Stone",
  "Terrazzo",
  "Solid Surface",
  "Quartz Surface",
  "Sintered Stone",
  "Glass",
  "Mirror",
  "Aluminium System",
  "Gypsum Board & Ceiling System",
  "Acoustic Panel",
  "Wallpaper",
  "Paint & Coating",
  "Decorative Lighting",
  "Architectural Lighting",
  "Switches & Sockets",
  "Sanitaryware",
  "Plumbing Fittings",
  "Furniture Hardware",
  "Door & Window Hardware",
  "Adhesive & Sealant",
  "Waterproofing",
  "Fabric & Upholstery",
  "Leather & Synthetic Leather",
  "Blinds & Window Covering",
  "Furniture & FF&E",
  "WPC & Composite Panels",
  "Door & Window Systems",
];

/// Normalization merges: aliases become search_synonyms and never create more
/// Category rows. Keyed by canonical category name.
const PRODUCT_CATEGORY_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  "Edgebanding": ["Edging", "Edge Banding"],
  "Melamine Faced Board (MFC)": ["MFC", "Melaminto", "Melamine Faced Board"],
  "Engineered Wood Flooring": ["Engineering Wood Floor", "Parquet"],
  "LVT / Vinyl Flooring": ["Vinyl", "Vinyl Tile", "Vinyl Roll", "LVT"],
  "Ceramic & Porcelain Tile": ["Ceramic", "Ceramics", "Keramik", "Porcelain", "Tiles"],
  "Homogeneous Tile (HT)": ["HT", "Homogeneous", "Granite Tile"],
  "Natural Stone": ["Marble", "Marmer", "Granite", "Granit", "Onyx", "Travertine", "Batu Alam"],
  "Terrazzo": ["Terazzo", "Terrazo"],
  "Decorative PVC Sheet": ["Interior Film", "Finish Foil", "PVC Sheet"],
  "Acoustic Panel": ["Acoustic", "Noice Control", "Sound Absorber"],
  "Paint & Coating": ["Cat", "Duco", "Texture Paint", "Decorative Paint"],
  "Switches & Sockets": ["Switch", "Socket", "Power Outlet"],
  "Sanitaryware": ["Sanitary", "Sanitary Ware", "Bathroom", "Toilet", "Sink", "Shower"],
  "Plumbing Fittings": ["Faucet", "Plumbing Fitting"],
  "Blinds & Window Covering": ["Roller Blind", "Venetian Blind", "Curtain", "Drapery", "Window Covering"],
  "Fabric & Upholstery": ["Fabric", "Kain", "Upholstery"],
  "Leather & Synthetic Leather": ["Leather", "Kulit", "Synthetic Leather"],
  "Aluminium System": ["Aluminium Door & Window", "Aluminum System"],
  "Gypsum Board & Ceiling System": ["Gypsum", "Plafon", "Ceiling", "Partition"],
  "WPC & Composite Panels": ["WPC", "wood-plastic composite", "composite wall panel"],
  "Furniture & FF&E": ["Loose Furniture", "Custom Furniture", "Home Furniture", "Office Furniture"],
};

export const PRODUCT_CATEGORY_SEEDS: readonly ProductCategorySeed[] = PRODUCT_CATEGORY_NAMES.map((name) => ({
  name,
  search_synonyms: [...(PRODUCT_CATEGORY_SYNONYMS[name] ?? [])],
}));

/// Inherited WORK roots. Only two children have direct legacy rate-table
/// evidence; no speculative hierarchy is seeded.
export const WORK_ROOT_SEEDS: readonly WorkRootSeed[] = [
  { name: "Sipil & Struktur" },
  { name: "Furniture / Custom" },
  { name: "Finishing" },
  { name: "MEP" },
  { name: "Kaca & Aluminium" },
  { name: "Batu & Keramik" },
  { name: "Lain-lain" },
];

export const WORK_CHILD_SEEDS: readonly WorkChildSeed[] = [
  { parent: "MEP", name: "Lighting" },
  { parent: "Sipil & Struktur", name: "Floor Works" },
];
