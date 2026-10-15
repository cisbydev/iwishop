-- Comptage en lecture seule, pour comparer une base restaurée à sa source.
-- Utilisé pour la première fois à l'étape B du 2026-10-14 (corps inchangé depuis).
-- Donne, une ligne par élément, au format cle;valeur : nombre de lignes de
-- chaque table du schéma public, dernière valeur de chaque séquence, nombre de
-- tables, séquences, index et contraintes, et les deux ventes témoins.
-- Procédure : docs/postgresql-backup-restore.md, « Contrôles après restauration ».
-- Aucune écriture possible dans cette session : transaction en lecture seule.
SET default_transaction_read_only = on;
BEGIN READ ONLY;

SELECT cle, valeur FROM (
    -- Nombre de lignes de chaque table du schéma public
    SELECT 'table:' || c.relname AS cle,
           (xpath('/row/n/text()',
                  query_to_xml(format('SELECT count(*) AS n FROM %I.%I', n.nspname, c.relname),
                               false, true, '')))[1]::text AS valeur
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')

    -- Dernière valeur de chaque séquence (sinon les prochains INSERT entreraient en collision)
    UNION ALL
    SELECT 'sequence:' || sequencename, coalesce(last_value::text, 'null')
    FROM pg_sequences WHERE schemaname = 'public'

    -- Nombre d'objets du schéma
    UNION ALL
    SELECT 'objets:tables', count(*)::text
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    UNION ALL
    SELECT 'objets:sequences', count(*)::text
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
    UNION ALL
    SELECT 'objets:index', count(*)::text
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'i'
    UNION ALL
    SELECT 'objets:contraintes', count(*)::text
    FROM pg_constraint co JOIN pg_namespace n ON n.oid = co.connamespace
    WHERE n.nspname = 'public'

    -- Les deux ventes témoins
    UNION ALL
    SELECT 'vente:' || numero, 'presente'
    FROM sales_vente WHERE numero IN ('V-2F621063', 'V-AD91351B')
) t
ORDER BY cle;

ROLLBACK;
