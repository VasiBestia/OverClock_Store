USE OverClock_Store_DB;
GO

SET NOCOUNT ON;

-- 1. Ștergere produse fără preț valid din catalogul central
DELETE FROM dbo.products
WHERE is_active = 0 OR price_ron IS NULL OR price_ron <= 0;

-- 2. Ștergere sincronizată a rândurilor fără preț din toate cele 25 de tabele de specificații
DECLARE @slug SYSNAME, @del_sql NVARCHAR(MAX);
DECLARE clean_cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT slug FROM dbo.categories;

OPEN clean_cur;
FETCH NEXT FROM clean_cur INTO @slug;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @del_sql = N'DELETE FROM dbo.' + QUOTENAME(@slug) + N' WHERE price IS NULL OR price <= 0;';
    EXEC sp_executesql @del_sql;
    FETCH NEXT FROM clean_cur INTO @slug;
END

CLOSE clean_cur;
DEALLOCATE clean_cur;
GO

-- 3. Raportul final pe categorii (ce a rămas disponibil în magazin)
SELECT 
    c.display_name AS Categorie,
    c.slug AS Tabela,
    COUNT(p.product_id) AS ProduseDisponibile,
    MIN(p.price_ron) AS PretMinim_RON,
    CAST(AVG(p.price_ron) AS DECIMAL(10, 2)) AS PretMediu_RON,
    MAX(p.price_ron) AS PretMaxim_RON
FROM dbo.categories c
LEFT JOIN dbo.products p ON c.category_id = p.category_id
GROUP BY c.display_name, c.slug
ORDER BY ProduseDisponibile DESC;

-- 4. Verificare distribuție socket-uri pentru configuratorul AI
SELECT 
    s.socket_code AS Socket,
    (SELECT COUNT(*) FROM dbo.cpu WHERE socket_id = s.socket_id) AS Procesoare,
    (SELECT COUNT(*) FROM dbo.motherboard WHERE socket_id = s.socket_id) AS PlaciDeBaza
FROM dbo.sockets s
ORDER BY Procesoare DESC;

USE OverClock_Store_DB;
GO

-- 1. Adăugăm socket-urile workstation și generațiile anterioare
INSERT INTO dbo.sockets (socket_code)
SELECT v.code
FROM (VALUES ('sTRX4'), ('TR4'), ('LGA2066'), ('LGA2011-3'), ('LGA1150'), ('LGA1155'), ('AM3+')) AS v(code)
WHERE NOT EXISTS (SELECT 1 FROM dbo.sockets s WHERE s.socket_code = v.code);
GO

-- 2. Re-mapăm plăcile de bază din 'Other' după coloana lor textuală `socket`
UPDATE m
SET m.socket_id = s.socket_id
FROM dbo.motherboard m
INNER JOIN dbo.sockets s_old ON m.socket_id = s_old.socket_id AND s_old.socket_code = 'Other'
INNER JOIN dbo.sockets s ON REPLACE(UPPER(LTRIM(RTRIM(CAST(m.socket AS NVARCHAR(30))))), ' ', '') = s.socket_code;

-- 3. Re-mapăm procesoarele din 'Other' după microarhitectură și denumire
UPDATE c
SET c.socket_id = COALESCE(
    (SELECT socket_id FROM dbo.sockets WHERE socket_code = CASE
        WHEN c.microarchitecture IN ('Zen 4', 'Zen 5') AND c.name LIKE '%Threadripper%' THEN 'sTR5'
        WHEN c.microarchitecture = 'Zen 3' AND c.name LIKE '%Threadripper%' THEN 'sTRX4'
        WHEN c.microarchitecture = 'Zen 2' AND c.name LIKE '%Threadripper%' THEN 'sTRX4'
        WHEN c.microarchitecture IN ('Zen', 'Zen+') AND c.name LIKE '%Threadripper%' THEN 'TR4'
        WHEN c.microarchitecture IN ('Zen 4', 'Zen 5') THEN 'AM5'
        WHEN c.microarchitecture IN ('Zen', 'Zen+', 'Zen 2', 'Zen 3') THEN 'AM4'
        WHEN c.microarchitecture IN ('Bulldozer', 'Piledriver') THEN 'AM3+'
        WHEN c.microarchitecture = 'Arrow Lake' THEN 'LGA1851'
        WHEN c.microarchitecture IN ('Alder Lake', 'Raptor Lake', 'Raptor Lake Refresh') THEN 'LGA1700'
        WHEN c.microarchitecture IN ('Comet Lake', 'Rocket Lake') THEN 'LGA1200'
        WHEN c.microarchitecture IN ('Skylake', 'Kaby Lake', 'Coffee Lake', 'Coffee Lake Refresh') THEN 'LGA1151'
        WHEN c.microarchitecture IN ('Haswell', 'Broadwell') AND c.name NOT LIKE '%-E%' THEN 'LGA1150'
        WHEN c.microarchitecture IN ('Sandy Bridge', 'Ivy Bridge') THEN 'LGA1155'
        WHEN c.microarchitecture IN ('Cascade Lake', 'Skylake-X', 'Kaby Lake-X') THEN 'LGA2066'
        ELSE NULL
    END),
    c.socket_id
)
FROM dbo.cpu c
INNER JOIN dbo.sockets s_old ON c.socket_id = s_old.socket_id AND s_old.socket_code = 'Other';
GO