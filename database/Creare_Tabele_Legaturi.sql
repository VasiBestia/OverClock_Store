USE OverClock_Store_DB;
GO

DECLARE @tables TABLE (tbl_name SYSNAME);
INSERT INTO @tables (tbl_name) VALUES
    ('case_accessory'), ('case_fan'), ('cases'), ('cpu'), ('cpu_cooler'),
    ('external_hard_drive'), ('fan_controller'), ('headphones'), ('internal_hard_drive'),
    ('keyboard'), ('memory'), ('monitor'), ('motherboard'), ('mouse'),
    ('optical_drive'), ('os'), ('power_supply'), ('sound_card'), ('speakers'),
    ('thermal_paste'), ('ups'), ('video_card'), ('webcam'),
    ('wired_network_card'), ('wireless_network_card');

DECLARE @tbl SYSNAME, @sql NVARCHAR(MAX);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT tbl_name FROM @tables;
OPEN cur;
FETCH NEXT FROM cur INTO @tbl;

WHILE @@FETCH_STATUS = 0
BEGIN
    IF OBJECT_ID(N'dbo.' + QUOTENAME(@tbl), 'U') IS NOT NULL
       AND COL_LENGTH('dbo.' + @tbl, 'id') IS NULL
    BEGIN
        SET @sql = N'ALTER TABLE dbo.' + QUOTENAME(@tbl) + N' ADD id INT IDENTITY(1,1) NOT NULL;'
                 + N'ALTER TABLE dbo.' + QUOTENAME(@tbl) + N' ADD CONSTRAINT ' + QUOTENAME('PK_' + @tbl)
                 + N' PRIMARY KEY CLUSTERED (id);';
        EXEC sp_executesql @sql;
    END

    -- Eliminare rânduri fără denumire, deduplicare și normalizare tipuri pentru indexare
    SET @sql = N'
        DELETE FROM dbo.' + QUOTENAME(@tbl) + N'
        WHERE name IS NULL OR LTRIM(RTRIM(CAST(name AS NVARCHAR(MAX)))) = '''';

        WITH Dupes AS (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY CAST(name AS NVARCHAR(400)) ORDER BY id) AS rn
            FROM dbo.' + QUOTENAME(@tbl) + N'
        )
        DELETE FROM Dupes WHERE rn > 1;

        UPDATE dbo.' + QUOTENAME(@tbl) + N'
        SET price = TRY_CAST(REPLACE(REPLACE(CAST(price AS NVARCHAR(100)), ''$'', ''''), '','', '''') AS DECIMAL(10, 2));

        ALTER TABLE dbo.' + QUOTENAME(@tbl) + N' ALTER COLUMN name NVARCHAR(300) NOT NULL;
        ALTER TABLE dbo.' + QUOTENAME(@tbl) + N' ALTER COLUMN price DECIMAL(10, 2) NULL;
    ';
    EXEC sp_executesql @sql;

    FETCH NEXT FROM cur INTO @tbl;
END

CLOSE cur;
DEALLOCATE cur;
GO

-- 1. Nomenclatoare de compatibilitate și categorii
CREATE TABLE dbo.categories (
    category_id   INT IDENTITY(1,1) PRIMARY KEY,
    slug          SYSNAME NOT NULL UNIQUE,
    display_name  NVARCHAR(100) NOT NULL,
    default_image NVARCHAR(255) NOT NULL
);

CREATE TABLE dbo.sockets (
    socket_id   INT IDENTITY(1,1) PRIMARY KEY,
    socket_code NVARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE dbo.form_factors (
    form_factor_id INT IDENTITY(1,1) PRIMARY KEY,
    code           NVARCHAR(40) NOT NULL UNIQUE
);

INSERT INTO dbo.sockets (socket_code) VALUES
    ('AM5'), ('AM4'), ('LGA1851'), ('LGA1700'), ('LGA1200'), ('LGA1151'), ('sTR5'), ('Other');

INSERT INTO dbo.form_factors (code) VALUES
    ('ATX'), ('Micro ATX'), ('Mini ITX'), ('EATX'), ('Other');

INSERT INTO dbo.categories (slug, display_name, default_image) VALUES
    ('video_card',            'Graphics Cards',         'img/product-3.png'),
    ('cpu',                   'Processors',             'img/product-4.png'),
    ('motherboard',           'Motherboards',           'img/product-5.png'),
    ('memory',                'Memory (RAM)',           'img/product-6.png'),
    ('internal_hard_drive',   'Internal Storage',       'img/product-7.png'),
    ('power_supply',          'Power Supplies',         'img/product-8.png'),
    ('cpu_cooler',            'CPU Coolers',            'img/product-10.png'),
    ('cases',                 'PC Cases',               'img/product-11.png'),
    ('case_fan',              'Case Fans',              'img/product-10.png'),
    ('case_accessory',        'Case Accessories',       'img/product-11.png'),
    ('fan_controller',        'Fan Controllers',        'img/product-8.png'),
    ('thermal_paste',         'Thermal Paste',          'img/product-16.png'),
    ('monitor',               'Monitors',               'img/product-12.png'),
    ('keyboard',              'Keyboards',              'img/product-13.png'),
    ('mouse',                 'Mice',                   'img/product-14.png'),
    ('headphones',            'Headphones',             'img/product-15.png'),
    ('speakers',              'Speakers',               'img/product-15.png'),
    ('webcam',                'Webcams',                'img/product-16.png'),
    ('external_hard_drive',   'External Storage',       'img/product-7.png'),
    ('optical_drive',         'Optical Drives',         'img/product-17.png'),
    ('sound_card',            'Sound Cards',            'img/product-5.png'),
    ('wired_network_card',    'Wired Network Cards',    'img/product-5.png'),
    ('wireless_network_card', 'Wireless Network Cards', 'img/product-5.png'),
    ('ups',                   'UPS Systems',            'img/product-8.png'),
    ('os',                    'Operating Systems',      'img/product-12.png');
GO

-- 2. Adăugare Foreign Keys de compatibilitate pe cpu, motherboard și cases
ALTER TABLE dbo.cpu         ADD socket_id INT NULL CONSTRAINT FK_cpu_socket FOREIGN KEY REFERENCES dbo.sockets(socket_id);
ALTER TABLE dbo.motherboard ADD socket_id INT NULL CONSTRAINT FK_mb_socket FOREIGN KEY REFERENCES dbo.sockets(socket_id);
ALTER TABLE dbo.motherboard ADD form_factor_id INT NULL CONSTRAINT FK_mb_ff FOREIGN KEY REFERENCES dbo.form_factors(form_factor_id);
ALTER TABLE dbo.cases       ADD form_factor_id INT NULL CONSTRAINT FK_cases_ff FOREIGN KEY REFERENCES dbo.form_factors(form_factor_id);
GO

UPDATE m
SET m.socket_id = COALESCE(s.socket_id, (SELECT socket_id FROM dbo.sockets WHERE socket_code = 'Other'))
FROM dbo.motherboard m
LEFT JOIN dbo.sockets s ON UPPER(LTRIM(RTRIM(CAST(m.socket AS NVARCHAR(30))))) = s.socket_code;

UPDATE c
SET c.socket_id = (
    SELECT socket_id FROM dbo.sockets WHERE socket_code = CASE
        WHEN c.microarchitecture IN ('Zen 4', 'Zen 5') THEN 'AM5'
        WHEN c.microarchitecture IN ('Zen', 'Zen+', 'Zen 2', 'Zen 3') THEN 'AM4'
        WHEN c.microarchitecture = 'Arrow Lake' THEN 'LGA1851'
        WHEN c.microarchitecture IN ('Alder Lake', 'Raptor Lake', 'Raptor Lake Refresh') THEN 'LGA1700'
        WHEN c.microarchitecture IN ('Comet Lake', 'Rocket Lake') THEN 'LGA1200'
        WHEN c.microarchitecture IN ('Skylake', 'Kaby Lake', 'Coffee Lake', 'Coffee Lake Refresh') THEN 'LGA1151'
        ELSE 'Other'
    END
)
FROM dbo.cpu c;

UPDATE m
SET m.form_factor_id = COALESCE(f.form_factor_id, (SELECT form_factor_id FROM dbo.form_factors WHERE code = 'Other'))
FROM dbo.motherboard m
LEFT JOIN dbo.form_factors f ON REPLACE(UPPER(LTRIM(RTRIM(CAST(m.form_factor AS NVARCHAR(40))))), '-', ' ') = UPPER(f.code);

UPDATE cs
SET cs.form_factor_id = (
    SELECT form_factor_id FROM dbo.form_factors WHERE code = CASE
        WHEN cs.type LIKE '%Mini ITX%' THEN 'Mini ITX'
        WHEN cs.type LIKE '%MicroATX%' OR cs.type LIKE '%Micro ATX%' THEN 'Micro ATX'
        WHEN cs.type LIKE '%Full Tower%' THEN 'EATX'
        WHEN cs.type LIKE '%Mid Tower%' OR cs.type LIKE '%ATX%' THEN 'ATX'
        ELSE 'Other'
    END
)
FROM dbo.cases cs;
GO

-- 3. Tabela centrală de produse + Configurator AI + Comenzi
CREATE TABLE dbo.products (
    product_id    INT IDENTITY(1,1) PRIMARY KEY,
    category_id   INT NOT NULL CONSTRAINT FK_products_category FOREIGN KEY REFERENCES dbo.categories(category_id),
    source_table  SYSNAME NOT NULL,
    source_row_id INT NOT NULL,
    name          NVARCHAR(300) NOT NULL,
    price_usd     DECIMAL(10, 2) NULL,
    price_ron     DECIMAL(10, 2) NULL,
    stock_qty     INT NOT NULL DEFAULT 15,
    image_url     NVARCHAR(255) NOT NULL,
    is_active     BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_products_source UNIQUE (source_table, source_row_id)
);

CREATE TABLE dbo.pc_builds (
    build_id          INT IDENTITY(1,1) PRIMARY KEY,
    build_name        NVARCHAR(150) NOT NULL,
    target_use        NVARCHAR(60) NOT NULL,
    total_price_ron   DECIMAL(12, 2) NOT NULL DEFAULT 0,
    estimated_wattage INT NOT NULL DEFAULT 0,
    is_ai_generated   BIT NOT NULL DEFAULT 0,
    created_at        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.pc_build_items (
    build_item_id  INT IDENTITY(1,1) PRIMARY KEY,
    build_id       INT NOT NULL CONSTRAINT FK_build_items_build FOREIGN KEY REFERENCES dbo.pc_builds(build_id) ON DELETE CASCADE,
    product_id     INT NOT NULL CONSTRAINT FK_build_items_product FOREIGN KEY REFERENCES dbo.products(product_id),
    component_role NVARCHAR(40) NOT NULL,
    quantity       INT NOT NULL DEFAULT 1
);

CREATE TABLE dbo.customers (
    customer_id  INT IDENTITY(1,1) PRIMARY KEY,
    full_name    NVARCHAR(150) NOT NULL,
    email        NVARCHAR(150) NOT NULL UNIQUE,
    phone        NVARCHAR(30) NULL,
    city         NVARCHAR(80) NOT NULL DEFAULT 'Bucharest',
    address_line NVARCHAR(250) NULL,
    created_at   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.orders (
    order_id     INT IDENTITY(1,1) PRIMARY KEY,
    customer_id  INT NOT NULL CONSTRAINT FK_orders_customer FOREIGN KEY REFERENCES dbo.customers(customer_id),
    order_status NVARCHAR(30) NOT NULL DEFAULT 'Pending',
    total_ron    DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.order_items (
    order_item_id  INT IDENTITY(1,1) PRIMARY KEY,
    order_id       INT NOT NULL CONSTRAINT FK_order_items_order FOREIGN KEY REFERENCES dbo.orders(order_id) ON DELETE CASCADE,
    product_id     INT NOT NULL CONSTRAINT FK_order_items_product FOREIGN KEY REFERENCES dbo.products(product_id),
    quantity       INT NOT NULL DEFAULT 1,
    unit_price_ron DECIMAL(10, 2) NOT NULL
);
GO

-- 4. Populare dbo.products din toate cele 25 de tabele (curs 4.65 RON/USD)
DECLARE @cat_id INT, @slug SYSNAME, @img NVARCHAR(255), @ins_sql NVARCHAR(MAX);
DECLARE cat_cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT category_id, slug, default_image FROM dbo.categories;

OPEN cat_cur;
FETCH NEXT FROM cat_cur INTO @cat_id, @slug, @img;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @ins_sql = N'
        INSERT INTO dbo.products (category_id, source_table, source_row_id, name, price_usd, price_ron, stock_qty, image_url, is_active)
        SELECT
            @cid,
            @slg,
            id,
            name,
            price,
            CAST(ROUND(price * 4.65, 2) AS DECIMAL(10, 2)),
            CASE WHEN price IS NULL THEN 0 ELSE 15 END,
            @im,
            CASE WHEN price IS NULL OR price <= 0 THEN 0 ELSE 1 END
        FROM dbo.' + QUOTENAME(@slug) + N';
    ';
    EXEC sp_executesql
        @ins_sql,
        N'@cid INT, @slg SYSNAME, @im NVARCHAR(255)',
        @cid = @cat_id, @slg = @slug, @im = @img;

    FETCH NEXT FROM cat_cur INTO @cat_id, @slug, @img;
END

CLOSE cat_cur;
DEALLOCATE cat_cur;
GO

SELECT 
    c.display_name AS Categorie,
    c.slug AS TabelaSursa,
    COUNT(*) AS TotalInregistrari,
    SUM(CASE WHEN p.is_active = 1 THEN 1 ELSE 0 END) AS ProduseActiveCuPret,
    SUM(CASE WHEN p.is_active = 0 THEN 1 ELSE 0 END) AS FaraPret_Dezactivate,
    MIN(p.price_ron) AS PretMinim_RON,
    MAX(p.price_ron) AS PretMaxim_RON
FROM dbo.products p
INNER JOIN dbo.categories c ON p.category_id = c.category_id
GROUP BY c.display_name, c.slug
ORDER BY ProduseActiveCuPret DESC;

Select *
From dbo.categories
