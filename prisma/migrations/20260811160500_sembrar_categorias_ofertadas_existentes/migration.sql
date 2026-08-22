-- Backfill de InstitutionCategory.
--
-- La tabla nace vacía, y "sin filas" significa "la institución no oferta
-- ninguna categoría" (ver el comentario del modelo en schema.prisma). Sin este
-- backfill, toda institución que ya existía quedaría ofertando cero y
-- POST /groups/create le devolvería 403 para cualquier categoría.
--
-- Se siembra el catálogo completo activo: es el comportamiento que tenían
-- hasta hoy (cualquier categoría era válida). A partir de acá el rector
-- desmarca lo que no dicta desde PUT /categories/offered.
--
-- Va en una migración aparte de la que crea la tabla, y no dentro de ella, para
-- no reescribir una migración ya aplicada (Prisma guarda el checksum y exige
-- reset si el archivo cambia).
--
-- ON CONFLICT DO NOTHING la hace re-ejecutable sin romper el índice único.
INSERT INTO "InstitutionCategory" ("uid", "institutionId", "categoryId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), i."uid", c."uid", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Institution" i
CROSS JOIN "GroupCategory" c
WHERE c."isActive" = true
ON CONFLICT ("institutionId", "categoryId") DO NOTHING;
