-- server/scripts/dev.db.sql
--
-- Catálogo de estilos de Artes Plásticas.
--
-- QUÉ HACE
-- Siembra los 45 estilos en la categoría `artes`. Una sola vez para toda la
-- plataforma: desde la migración `20260824190000_styles_catalogo_por_categoria`
-- un estilo pertenece a una categoría y a nada más — no cuelga de un grupo ni
-- de una institución. Es idempotente, `ON CONFLICT` contra el índice único
-- `(name, categoryId)`.
--
-- CÓMO SE CORRE
--   docker exec -i Quyca-DB psql -U prisma -d quyca < server/scripts/dev.db.sql
--
-- ANTES HAY QUE CORRER `bun run prisma:seed:static`, que siembra las cinco
-- `GroupCategory`. Sin la categoría `artes` este script no inserta nada y no
-- falla: el SELECT no encuentra a qué colgar los estilos.
--
-- El nombre puede repetirse ENTRE categorías —"Contemporáneo" existe en Danzas
-- y en Música— pero no dentro de una. Por eso el conflicto se resuelve contra
-- `(name, categoryId)` y no contra `name` solo.

INSERT INTO "Styles" ("uid", "name", "description", "categoryId", "updatedAt")
SELECT gen_random_uuid(), c.name, c.description, gc.uid, NOW()
FROM (VALUES

  -- PINTURA
  ('Óleo en Lienzo', 'Técnica pictórica que utiliza pigmentos aglutinados en aceite aplicados sobre lienzo tensado, permitiendo veladuras, mezclas ricas y una amplia gama tonal con gran durabilidad.'),
  ('Óleo en Madera', 'Pintura al óleo ejecutada sobre tabla de madera preparada con gesso, soporte tradicional del Renacimiento que otorga firmeza y permite acabados de alta precisión y detalle.'),
  ('Acuarela', 'Técnica que diluye pigmentos en agua sobre papel, aprovechando la transparencia y fluidez del medio para crear efectos luminosos, degradados suaves y texturas espontáneas.'),
  ('Acrílico', 'Pintura de secado rápido a base de polímeros acrílicos, versátil sobre múltiples superficies; admite texturas empastadas similares al óleo o veladuras transparentes como la acuarela.'),
  ('Gouache', 'Pintura opaca a base de agua similar a la acuarela pero con mayor cuerpo y cubrimiento; produce colores sólidos y mates sobre papel o cartón, muy usada en ilustración y diseño.'),
  ('Fresco', 'Técnica mural que aplica pigmentos sobre mortero húmedo, integrándose al soporte al secar; exige rapidez y precisión, y produce obras de extraordinaria permanencia en paredes y techos.'),
  ('Muralismo', 'Creación de grandes composiciones pictóricas directamente sobre superficies arquitectónicas mediante óleo, acrílico o fresco, con narrativa cultural o social de carácter público.'),
  ('Encáustica', 'Antigua técnica egipcia y griega que mezcla pigmentos con cera de abeja fundida; se aplica caliente sobre madera o tela y se fija con calor, creando superficies translúcidas y de gran riqueza táctil.'),
  ('Aerografía', 'Técnica que proyecta pintura atomizada mediante un aerógrafo de aire comprimido; permite degradados suaves, efectos fotorrealistas y grandes formatos con transiciones de color imperceptibles.'),
  ('Pastel', 'Técnica que emplea barras de pigmento puro aglutinado sobre papel de grano, logrando colores intensos, texturas aterciopeladas y transiciones suaves mediante difuminado.'),
  ('Batik', 'Técnica textil de origen indonesio que aplica cera caliente sobre tela para reservar zonas antes de teñirla; al retirar la cera emergen patrones de gran riqueza cromática y detalle.'),
  ('Tempera', 'Pintura de secado rápido que aglutina pigmentos con yema de huevo u otros emulsionantes; produce colores brillantes y precisos, fue el medio dominante en la pintura de tabla medieval y renacentista.'),

  -- DIBUJO Y TRAZO
  ('Tinta China', 'Técnica de dibujo y pintura que utiliza tinta negra o de color sobre papel o seda, logrando trazos precisos, lavados expresivos y contrastes de valor mediante diluciones variables.'),
  ('Carboncillo', 'Medio de dibujo que emplea varillas de carbón vegetal sobre papel, permitiendo trazos expresivos, difuminados amplios y correcciones fáciles; ideal para estudios de figura y composición.'),
  ('Sanguina', 'Técnica de dibujo con lápiz o barrita de óxido de hierro rojizo sobre papel; permite líneas precisas y difuminados cálidos, muy empleada en el Renacimiento para estudios anatómicos.'),
  ('Lápiz Grafito', 'Técnica de dibujo con lápices de grafito de distintas durezas sobre papel; permite desde trazos finos y precisos hasta sombreados amplios, siendo el medio de dibujo más universal y accesible.'),
  ('Lápices de Colores', 'Técnica que superpone capas de lápices de colores sobre papel para construir tonos, texturas y gradientes; admite técnicas como el bruñido, el esgrafiado y la mezcla óptica de colores.'),
  ('Punta de Plata', 'Técnica de dibujo renacentista que traza líneas delicadas con un estilete de plata sobre papel preparado con base de carbonato; produce líneas finas e irreversibles que se oxidan levemente con el tiempo.'),
  ('Rotulador Artístico', 'Técnica contemporánea que emplea marcadores de punta fina o gruesa con tintas de alcohol o base acuosa; permite trazos precisos, rellenos planos y gradientes sobre papel, cartón o superficies no porosas.'),

  -- GRABADO E IMPRESIÓN
  ('Grabado', 'Proceso que incide diseños sobre una matriz de metal, madera o piedra para entintar y transferir la imagen al papel mediante presión, permitiendo la reproducción múltiple de la obra.'),
  ('Aguafuerte', 'Técnica de grabado calcográfico que muerde el metal con ácido nítrico para crear surcos donde se aloja la tinta; produce líneas de gran expresividad y variedad tonal según el tiempo de mordida.'),
  ('Litografía', 'Técnica de impresión planográfica basada en la repulsión entre grasa y agua sobre piedra caliza o plancha metálica; permite reproducir dibujos con gran fidelidad tonal y textura.'),
  ('Serigrafía', 'Proceso de impresión que fuerza tinta a través de una malla tensada con áreas bloqueadas por una emulsión fotosensible; permite tiradas largas con colores planos y vibrantes sobre tela, papel o cartón.'),
  ('Xilografía', 'Grabado en relieve que talla la imagen en un bloque de madera eliminando las zonas que no se imprimirán; la superficie entintada se presiona sobre papel para obtener estampas de trazo expresivo.'),
  ('Linóleo', 'Variante del grabado en relieve que talla sobre plancha de linóleo en lugar de madera; el material más blando facilita cortes curvos y detallados, muy usado en arte educativo y carteles.'),

  -- ESCULTURA
  ('Escultura en Arcilla', 'Modelado tridimensional con arcilla natural o cerámica; material maleable que permite construir formas orgánicas y geométricas, fijadas mediante cocción en horno a altas temperaturas.'),
  ('Escultura en Piedra', 'Técnica sustractiva que talla y cincela bloques de mármol, granito u otras rocas para revelar formas tridimensionales; requiere precisión técnica y herramientas especializadas.'),
  ('Escultura en Bronce', 'Técnica de fundición que vierte metal líquido en moldes para obtener piezas tridimensionales de gran durabilidad; el proceso de cera perdida permite reproducir detalles finos con alta fidelidad.'),
  ('Escultura en Madera', 'Talla directa sobre bloques de madera usando gubias, formones y mazos para revelar la forma tridimensional; cada especie de madera aporta textura, veta y resistencia distintas a la obra final.'),
  ('Escultura en Yeso', 'Modelado o vaciado de formas tridimensionales con yeso fraguado; material económico y de fraguado rápido, muy usado para maquetas, estudios preparatorios y obras de acabado liso o texturizado.'),
  ('Escultura en Resina', 'Técnica que vierte resina poliéster o epoxi en moldes para obtener piezas translúcidas o pigmentadas de gran resistencia; permite incluir objetos en su interior y lograr efectos de vidrio o cristal.'),
  ('Instalación Artística', 'Práctica que interviene un espacio tridimensional con objetos, luz, sonido o medios digitales para crear una experiencia inmersiva; la obra existe en relación directa con el entorno y el espectador.'),
  ('Cerámica Esmaltada', 'Técnica que modela arcilla y la recubre con esmaltes vítreos antes de la cocción; el horno funde el esmalte creando superficies brillantes, coloridas e impermeables de gran valor decorativo y funcional.'),

  -- TEXTIL Y MATERIA
  ('Tapicería Artística', 'Arte textil que entrelaza hilos de urdimbre y trama a mano en telar para crear composiciones pictóricas o abstractas; admite lana, seda, algodón y fibras mixtas con gran riqueza de textura y color.'),
  ('Bordado Artístico', 'Técnica que decora tela con hilos de colores usando aguja; mediante puntos como el satén, el nudo francés o el relleno, construye imágenes detalladas con relieve y textura sobre el soporte textil.'),

  -- TÉCNICAS MIXTAS Y OTRAS
  ('Collage', 'Procedimiento que construye imágenes pegando fragmentos de papel, tela, fotografías u otros materiales sobre una superficie; combina texturas y significados para crear composiciones visuales originales.'),
  ('Técnica Mixta', 'Enfoque que combina libremente materiales y procedimientos —óleo, acrílico, collage, tinta, objetos— en una misma obra, expandiendo las posibilidades expresivas más allá de un solo medio.'),
  ('Mosaico', 'Arte de componer imágenes o patrones ensamblando pequeñas piezas de vidrio, cerámica o piedra (teselas) sobre una superficie con mortero; muy practicado en el arte romano y bizantino.'),
  ('Vitral', 'Arte de ensamblar piezas de vidrio coloreado unidas con plomo para formar composiciones luminosas; la luz que atraviesa el vidrio es parte esencial de la obra, muy presente en arquitectura religiosa.'),
  ('Arte en Papel', 'Disciplina que transforma el papel en escultura tridimensional mediante doblado, corte y modelado; abarca desde el origami japonés hasta construcciones arquitectónicas de gran complejidad estructural.'),
  ('Land Art', 'Práctica que interviene paisajes naturales usando tierra, rocas, ramas u otros elementos del entorno como material escultórico; la obra existe en el territorio y se documenta mediante fotografía o video.'),

  -- FOTOGRAFÍA Y DIGITAL
  ('Fotografía Artística', 'Disciplina que utiliza la cámara y la luz como herramientas creativas, explorando composición, encuadre y edición para construir imágenes con intención estética y narrativa visual.'),
  ('Fotografía Análoga', 'Proceso fotográfico que registra imágenes en película sensible a la luz y las revela mediante baño químico en cuarto oscuro; el grano, el contraste y los virajes dan a cada imagen un carácter único e irrepetible.'),
  ('Ilustración Digital', 'Creación de imágenes mediante software de dibujo y tableta gráfica; replica técnicas tradicionales como acuarela o óleo en entorno digital, ofreciendo capas, deshacido ilimitado y paleta infinita.'),
  ('Arte Generativo', 'Disciplina que emplea algoritmos, código y sistemas computacionales para producir obras visuales; el artista diseña las reglas del proceso y el sistema genera formas, patrones o composiciones autónomamente.')
) AS c(name, description)
CROSS JOIN "GroupCategory" gc
WHERE gc.slug = 'artes'
ON CONFLICT ("name", "categoryId") DO NOTHING;
