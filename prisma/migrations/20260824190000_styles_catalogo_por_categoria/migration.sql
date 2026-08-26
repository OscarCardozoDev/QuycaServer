-- Styles deja de colgar del grupo y de la institución: pasa a ser un catálogo
-- de plataforma por categoría, como GroupCategory.
--
-- El orden importa. Primero se colapsan los duplicados —el catálogo existía una
-- vez por grupo, así que había tantas filas "Acuarela" como grupos de artes—,
-- y recién después se crea el índice único (name, categoryId), que de otro modo
-- fallaría contra los datos existentes.
--
-- Se conserva la fila más vieja de cada (name, categoryId): es la que tiene más
-- chance de estar referenciada desde ProductStyle.

-- 1. Repuntar ProductStyle a la fila que sobrevive, antes de borrar nada.
UPDATE "ProductStyle" ps
SET "styleId" = sobreviviente.uid
FROM "Styles" s
JOIN LATERAL (
  SELECT s2.uid
  FROM "Styles" s2
  WHERE s2.name = s.name AND s2."categoryId" = s."categoryId"
  ORDER BY s2."createdAt" ASC, s2.uid ASC
  LIMIT 1
) AS sobreviviente ON true
WHERE ps."styleId" = s.uid
  AND ps."styleId" <> sobreviviente.uid;

-- 2. Borrar las copias, quedándose con una por (name, categoryId).
DELETE FROM "Styles" s
USING "Styles" otro
WHERE s.name = otro.name
  AND s."categoryId" = otro."categoryId"
  AND (otro."createdAt", otro.uid) < (s."createdAt", s.uid);

-- 3. El esquema nuevo.
ALTER TABLE "Styles" DROP CONSTRAINT "Styles_groupId_fkey";
ALTER TABLE "Styles" DROP CONSTRAINT "Styles_institutionId_fkey";

DROP INDEX "Styles_institutionId_idx";

ALTER TABLE "Styles" DROP COLUMN "groupId",
DROP COLUMN "institutionId";

CREATE INDEX "Styles_categoryId_idx" ON "Styles"("categoryId");

CREATE UNIQUE INDEX "Styles_name_categoryId_key" ON "Styles"("name", "categoryId");
