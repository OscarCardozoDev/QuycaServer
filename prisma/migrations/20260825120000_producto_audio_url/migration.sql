-- Audio de la obra, para la categoría `musica` (MVP de la página de música).
--
-- Aditiva y nullable: no hay backfill y ninguna obra existente se toca — en una
-- pintura la columna queda en NULL, que es lo correcto.
--
-- Guarda la ruta pública (`/audio/<carpeta>/<uuid>.mp3`), no el archivo. El
-- archivo lo escribe photoManagement con AUDIO_ROOT y lo sirve el segundo
-- ServeStaticModule de app.module.ts.
--
-- `Products` ya es scoped, así que esto NO toca SCOPED_MODELS: es una columna
-- más de un modelo que la extensión de Prisma ya filtra.

-- AlterTable
ALTER TABLE "Products" ADD COLUMN     "audioUrl" VARCHAR(500);
