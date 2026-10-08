-- StudioFlow Product Schedule defaults, verified from legacy commit
-- c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27.  These are explicit mappings,
-- not fallback-prefix derivations.  The statements are idempotent and add no
-- rows to existing projects; only a future project bootstrap or explicit
-- Apply templates command materializes the reserve rows.

WITH defaults(category, category_key, prefix, sort_order) AS (
  VALUES
    ('Paint',                   'PAINT',                   'PT',  10),
    ('Spray Paint',             'SPRAY PAINT',             'SPR', 20),
    ('Wood',                    'WOOD',                    'WD',  30),
    ('High Pressure Laminate',  'HIGH PRESSURE LAMINATE',  'PL',  40),
    ('Solid Surface',           'SOLID SURFACE',           'SO',  50),
    ('Stone',                   'STONE',                   'ST',  60),
    ('Terrazzo',                'TERRAZZO',                'TER', 70),
    ('Ceramic Tile',            'CERAMIC TILE',            'CT',  80),
    ('Homogeneous Tile',        'HOMOGENEOUS TILE',        'HT',  90),
    ('Glass',                   'GLASS',                   'GL',  100),
    ('Metal',                   'METAL',                   'MT',  110),
    ('Acrylic',                 'ACRYLIC',                 'ACR', 120),
    ('Fabric',                  'FABRIC',                  'F',   130),
    ('Miscellaneous',           'MISCELLANEOUS',           'MSC', 140)
)
INSERT INTO "studioflow"."sf_schedule_prefix" ("id", "section", "category", "category_key", "prefix", "updated_at")
SELECT gen_random_uuid()::TEXT, 'MATERIAL', category, category_key, prefix, NOW()
FROM defaults
ON CONFLICT ("section", "category_key") DO NOTHING;

WITH defaults(category, category_key, sort_order) AS (
  VALUES
    ('Paint',                   'PAINT',                   10),
    ('Spray Paint',             'SPRAY PAINT',             20),
    ('Wood',                    'WOOD',                    30),
    ('High Pressure Laminate',  'HIGH PRESSURE LAMINATE',  40),
    ('Solid Surface',           'SOLID SURFACE',           50),
    ('Stone',                   'STONE',                   60),
    ('Terrazzo',                'TERRAZZO',                70),
    ('Ceramic Tile',            'CERAMIC TILE',            80),
    ('Homogeneous Tile',        'HOMOGENEOUS TILE',        90),
    ('Glass',                   'GLASS',                   100),
    ('Metal',                   'METAL',                   110),
    ('Acrylic',                 'ACRYLIC',                 120),
    ('Fabric',                  'FABRIC',                  130),
    ('Miscellaneous',           'MISCELLANEOUS',           140)
)
INSERT INTO "studioflow"."sf_schedule_template_category" ("id", "section", "category", "category_key", "sort_order", "updated_at")
SELECT gen_random_uuid()::TEXT, 'MATERIAL', category, category_key, sort_order, NOW()
FROM defaults
ON CONFLICT ("section", "category_key") DO NOTHING;

WITH defaults(category, category_key, sort_order) AS (
  VALUES
    ('Paint',                   'PAINT',                   10),
    ('Spray Paint',             'SPRAY PAINT',             20),
    ('Wood',                    'WOOD',                    30),
    ('High Pressure Laminate',  'HIGH PRESSURE LAMINATE',  40),
    ('Solid Surface',           'SOLID SURFACE',           50),
    ('Stone',                   'STONE',                   60),
    ('Terrazzo',                'TERRAZZO',                70),
    ('Ceramic Tile',            'CERAMIC TILE',            80),
    ('Homogeneous Tile',        'HOMOGENEOUS TILE',        90),
    ('Glass',                   'GLASS',                   100),
    ('Metal',                   'METAL',                   110),
    ('Acrylic',                 'ACRYLIC',                 120),
    ('Fabric',                  'FABRIC',                  130),
    ('Miscellaneous',           'MISCELLANEOUS',           140)
)
INSERT INTO "studioflow"."sf_schedule_template_item"
  ("id", "template_category_id", "section", "category", "category_key", "product_name", "sort_order", "updated_at")
SELECT gen_random_uuid()::TEXT, category_row.id, 'MATERIAL', defaults.category, defaults.category_key, '', defaults.sort_order, NOW()
FROM defaults
JOIN "studioflow"."sf_schedule_template_category" AS category_row
  ON category_row."section" = 'MATERIAL' AND category_row."category_key" = defaults.category_key
WHERE NOT EXISTS (
  SELECT 1
  FROM "studioflow"."sf_schedule_template_item" AS item
  WHERE item."section" = 'MATERIAL'
    AND item."category_key" = defaults.category_key
    AND item."product_name" = ''
);
