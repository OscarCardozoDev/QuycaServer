import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/client';
import {
  CreateProductUseCase,
  GetProductsOptions,
  UpdateProductUseCase,
  UpdateStatusUseCase,
  ProductStatus,
} from './Product.interface';
import { PhotosService } from 'src/modules/photos/Photos.service';
import { photoManagement, AUDIO_ROOT } from 'src/utils/photosManagement';
import {
  decodeAudioBase64,
  buildAudioFileName,
} from 'src/utils/audioDecoder';
import { v4 as uuidv4 } from 'uuid';
import { runWithoutTenant } from 'src/tenant/tenant-context';

@Injectable()
export class ProductService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly photosService: PhotosService,
  ) {}

  /* =========================
   * BRIDGE-TABLE GUARDS
   * `UserProduct` y `ProductStyle` no tienen `institutionId` propio (son
   * tablas puente) y la extensión de tenant no las filtra. Un userId o
   * styleId que llegue del cliente podría pertenecer a otra institución;
   * se valida explícitamente antes de escribir la relación.
   * ========================= */
  private async assertActiveMembers(userIds: string[], institutionId: string) {
    const unique = [...new Set(userIds)];
    if (!unique.length) return;

    const members = await this.prisma.userInstitution.findMany({
      where: { userId: { in: unique }, institutionId, isActive: true },
      select: { userId: true },
    });

    const memberIds = new Set(members.map((m) => m.userId));
    const invalid = unique.filter((id) => !memberIds.has(id));

    if (invalid.length) {
      throw new ForbiddenException(
        `User(s) not an active member of this institution: ${invalid.join(', ')}`,
      );
    }
  }

  /**
   * Los estilos de una obra tienen que ser de la categoría de su grupo.
   *
   * Reemplaza a `assertStylesBelongToTenant`, que ya no tiene sentido: `Styles`
   * salió de `SCOPED_MODELS` el 2026-08-24 y es un catálogo de plataforma, así
   * que *todos* los estilos son de todas las instituciones. Lo que sí sigue
   * siendo un error es etiquetar un óleo con un estilo de Música: la regla que
   * queda es la categoría, no el tenant.
   */
  private async assertStylesMatchCategory(
    styleIds: string[],
    categoryId: string,
  ) {
    const unique = [...new Set(styleIds)];
    if (!unique.length) return;

    const found = await this.prisma.styles.findMany({
      where: { uid: { in: unique }, categoryId, isActive: true },
      select: { uid: true },
    });

    if (found.length !== unique.length) {
      throw new BadRequestException(
        'Some styles do not exist or belong to another category',
      );
    }
  }

  /* =========================
   * FK GUARD
   * `groupId` is a direct FK on `Products` supplied by the client. The
   * tenant extension only scopes the top-level call it intercepts, not
   * nested relations resolved by FK — an unchecked foreign groupId would
   * let a `Products` row (correctly stamped with the caller's own
   * institutionId) point at another tenant's group. `groups.findUnique`
   * is itself scoped, so a foreign id simply comes back null.
   * ========================= */
  /** Devuelve la categoría del grupo, que es contra la que se validan los estilos. */
  private async assertGroupInTenant(groupId: string): Promise<string> {
    const group = await this.prisma.groups.findUnique({
      where: { uid: groupId },
      select: { uid: true, categoryId: true },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return group.categoryId;
  }

  /* =========================
   * CREATE
   * ========================= */
  /**
   * Valida y guarda el audio, y devuelve la ruta publica que va a `audioUrl`.
   *
   * Escribe FUERA de la transaccion, igual que las imagenes: si la transaccion
   * despues falla, el archivo queda huerfano en disco. Es la misma deuda que ya
   * tienen las fotos, anotada en obsidian/Tareas/Musica-Lo-que-falta.
   */
  private async saveAudio(base64: string): Promise<string> {
    const { buffer, extension } = decodeAudioBase64(base64);

    const result = await photoManagement.save({
      fileBuffer: buffer,
      fileName: buildAudioFileName(extension),
      folderPath: 'products',
      root: AUDIO_ROOT,
    });

    return result.url;
  }

  async createProductUseCase(data: CreateProductUseCase) {
    const { product, styles, images, authors, audio, institutionId } = data;

    // FASE 0️⃣ — Validar que el grupo y los autores pertenecen a la institución
    // activa, y que los estilos son de la categoría del grupo, antes de
    // escribir Products y las tablas puente UserProduct/ProductStyle.
    const categoryId = await this.assertGroupInTenant(product.groupId);

    if (authors?.length) {
      await this.assertActiveMembers(
        authors.map((author) => author.userId),
        institutionId,
      );
    }

    if (styles?.length) {
      await this.assertStylesMatchCategory(styles, categoryId);
    }

    /**
     * FASE 1️⃣ — Crear imágenes (fuera de transacción)
     */
    const photoResults: { uid: string; isMain: boolean }[] = [];

    const savePhoto = async (
      images: {
        base64: string;
        name: string;
        folder: string;
        isMain?: boolean;
      }[],
    ) => {
      for (const image of images) {
        const photo = await this.photosService.createPhotoUseCase({
          base64: image.base64,
          name: product.name,
          folder: image.folder,
        });

        photoResults.push({
          uid: photo.uid,
          isMain: image.isMain ?? false,
        });
      }

      /* Garantizar una sola imagen principal */
      if (photoResults.length) {
        const hasMain = photoResults.some((p) => p.isMain);
        if (!hasMain) {
          photoResults[0].isMain = true;
        }
      }
    };

    /**
     * Audio: se valida y escribe antes de la transaccion porque `audioUrl` es
     * una columna del propio producto, no una tabla puente. Un data-URL invalido
     * corta aca con 400, sin haber creado nada.
     */
    const audioUrl = audio ? await this.saveAudio(audio.base64) : undefined;

    /* Convertir price a Decimal */
    const parsedProduct = {
      ...product,
      price:
        product.price !== undefined ? new Decimal(product.price) : undefined,
      audioUrl,
      institutionId,
    };

    /**
     * FASE 2️⃣ — Transacción
     */
    return this.prisma.$transaction(async (tx) => {
      // 1️⃣ Producto
      const createdProduct = await tx.products.create({
        data: parsedProduct,
        select: { uid: true },
      });

      // 2️⃣ Autores
      if (authors?.length) {
        await tx.userProduct.createMany({
          data: authors.map((author) => ({
            userId: author.userId,
            productId: createdProduct.uid,
            isAuthor: author.isAuthor ?? false,
          })),
          skipDuplicates: true,
        });
      }

      // 3️⃣ Estilos
      if (styles?.length) {
        await tx.productStyle.createMany({
          data: styles.map((styleId) => ({
            productId: createdProduct.uid,
            styleId,
          })),
          skipDuplicates: true,
        });
      }

      // 4️⃣ Relación producto ↔ imágenes
      if (images?.length) {
        await savePhoto(images);
        await tx.productPhoto.createMany({
          data: photoResults.map((photo) => ({
            productId: createdProduct.uid,
            photoId: photo.uid,
            isMain: photo.isMain,
          })),
        });
      }

      return {
        uid: createdProduct.uid,
        photos: photoResults.map((p) => ({
          uid: p.uid,
          isMain: p.isMain,
        })),
      };
    });
  }

  /* =========================
   * READ
   * ========================= */

  // Público: alimenta la galería sin sesión, ver Product.controller.ts.
  async getAll(options: GetProductsOptions = {}) {
    const { page = 1, limit = 10, styleId } = options;

    // Mismas dos reglas que la galería: solo obras aprobadas y activas (sin
    // esto se publicaban PENDING y REJECTED con el feedback del docente
    // adentro), y el estilo solo si lo pidieron —escrito `some: { styleId }` a
    // secas, un `styleId` undefined se colapsa a `some: {}`, que filtra por
    // "tener algún estilo".
    // Por uid y no por nombre: desde la migración
    // `20260824190000_styles_catalogo_por_categoria` un estilo existe UNA sola
    // vez en toda la plataforma, así que el uid que manda la galería es el
    // único que hay. Mientras el catálogo estuvo repetido por grupo hubo que
    // resolver el nombre primero, y ese rodeo ya no hace falta.

    return runWithoutTenant(() =>
      this.prisma.products.findMany({
        skip: (page - 1) * limit,
        take: limit,
        where: {
          isActive: true,
          status: 'APPROVED',
          ...(styleId ? { styles: { some: { styleId } } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          authors: {
            select: {
              isAuthor: true,
              user: {
                select: {
                  name: true,
                  lastName: true,
                },
              },
            },
          },
          photos: {
            select: {
              isMain: true,
              photo: {
                select: {
                  uid: true,
                  name: true,
                  url: true,
                },
              },
            },
          },
        },
      }),
    );
  }

  // Público: alimenta la galería sin sesión, ver Product.controller.ts.
  async getGalleryHome(options: GetProductsOptions = {}) {
    const { page = 1, limit = 10, styleId, categorySlug } = options;

    // El filtro por estilo solo existe si el usuario eligió uno. Escrito como
    // `styles: { some: { styleId } }` a secas, con `styleId` undefined Prisma
    // lo colapsa a `some: {}` — que NO es "sin filtro" sino "que tenga al
    // menos un estilo". La galería sin filtro escondía entonces toda obra
    // aprobada sin estilos cargados.
    // Por uid y no por nombre: desde la migración
    // `20260824190000_styles_catalogo_por_categoria` un estilo existe UNA sola
    // vez en toda la plataforma, así que el uid que manda la galería es el
    // único que hay. Mientras el catálogo estuvo repetido por grupo hubo que
    // resolver el nombre primero, y ese rodeo ya no hace falta.

    return runWithoutTenant(() =>
      this.prisma.products.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        where: {
          isActive: true,
          status: 'APPROVED',
          ...(styleId ? { styles: { some: { styleId } } } : {}),
          // Filtro por disciplina, para las vitrinas por categoria (`/music`).
          // Con spread condicional por la misma disciplina que el estilo: un
          // filtro opcional nunca deja pasar `undefined` hacia adentro.
          ...(categorySlug
            ? { group: { groupCategory: { slug: categorySlug } } }
            : {}),
        },
        select: {
          uid: true,
          name: true,
          madeAt: true,
          // null en toda obra que no sea de la categoria `musica`.
          audioUrl: true,
          photos: {
            where: { isMain: true },
            select: {
              photo: {
                select: {
                  uid: true,
                  name: true,
                  url: true,
                },
              },
            },
          },
          // Autor y estilo son datos publicos: el portafolio `/artist/:uid` ya
          // los expone. No agregar aca nada que no lo sea --precio de reserva,
          // feedback del docente--: esta consulta es cross-tenant.
          authors: {
            select: {
              isAuthor: true,
              user: { select: { uid: true, name: true, lastName: true } },
            },
          },
          styles: {
            select: { style: { select: { uid: true, name: true } } },
          },
        },
      }),
    );
  }

  // Público: alimenta la galería sin sesión, ver Product.controller.ts.
  async getById(uid: string) {
    const product = await runWithoutTenant(() =>
      this.prisma.products.findUnique({
        where: { uid },
        include: {
          authors: {
            select: {
              isAuthor: true,
              userId: true,
            },
          },
          photos: {
            select: {
              photo: {
                select: {
                  uid: true,
                  name: true,
                  url: true,
                },
              },
              isMain: true,
            },
          },
          styles: {
            select: {
              styleId: true,
            },
          },
        },
      }),
    );

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  /**
   * Las obras de un grupo, en todos sus estados, para el dashboard.
   *
   * Reemplazó a la lectura pública `getAllByGroup`, borrada el 2026-08-24: era
   * el mismo `where: { groupId }` pero envuelto en `runWithoutTenant()` y sin
   * guards en el controller, así que publicaba las obras PENDING y REJECTED de
   * cualquier grupo a quien tuviera el uid.
   *
   * La diferencia es TODA la diferencia: sin `runWithoutTenant()`, la
   * extensión inyecta el institutionId y un groupId de otra institución
   * devuelve vacío. La pública existe para la galería, que no tiene tenant
   * resuelto — ver el spec 2026-08-12-pantalla-del-grupo-design § 5.
   */
  async getAllByGroupPrivate(
    groupId: string,
    options: GetProductsOptions = {},
  ) {
    const { page = 1, limit = 10 } = options;

    return this.prisma.products.findMany({
      where: { groupId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        photos: {
          select: {
            photo: {
              select: {
                uid: true,
                name: true,
                url: true,
              },
            },
            isMain: true,
          },
        },
        authors: {
          select: {
            isAuthor: true,
            userId: true,
          },
        },
      },
    });
  }

  // Público: alimenta el portafolio del autor sin sesión, ver
  // Product.controller.ts. La galería pública SOLO muestra obras APPROVED +
  // isActive de grupos activos — sin este where se publicaban PENDING/
  // REJECTED con el feedback del docente adentro (bug de privacidad).
  async getAllByAuthor(authorId: string, options: GetProductsOptions = {}) {
    const { page = 1, limit = 10 } = options;

    return runWithoutTenant(() =>
      this.prisma.products.findMany({
        where: {
          authors: {
            some: { userId: authorId },
          },
          status: 'APPROVED',
          isActive: true,
          group: { isActive: true },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { madeAt: 'desc' },
        include: {
          photos: {
            where: { isMain: true },
            select: {
              photo: {
                select: {
                  uid: true,
                  name: true,
                  url: true,
                },
              },
            },
          },
          authors: {
            select: {
              isAuthor: true,
              userId: true,
            },
          },
          styles: {
            select: {
              style: {
                select: { name: true },
              },
            },
          },
          group: {
            select: { uid: true, name: true },
          },
        },
      }),
    );
  }

  /**
   * Bandeja de trabajo del propio usuario: todos los estados (PENDING,
   * REJECTED, APPROVED), acotada a la institución activa.
   *
   * Sin `runWithoutTenant()` a propósito — `Products` está en SCOPED_MODELS,
   * así que la extensión de tenant inyecta el institutionId sola. Distinta de
   * `getAllByAuthor` (pública, solo APPROVED, cualquier uid de la URL): ver
   * obsidian/Modulos/Products.md § "Dos rutas por groupId, no una", mismo
   * patrón aplicado acá.
   */
  async getMine(userId: string, options: GetProductsOptions = {}) {
    const { page = 1, limit = 10, groupId } = options;

    return this.prisma.products.findMany({
      where: {
        authors: { some: { userId } },
        // El grupo activo del sidebar. Es opcional a propósito: sin él la
        // bandeja mezclaba las obras de MÚSICA con las de ARTES, porque la
        // extensión de tenant acota a la institución, no al grupo.
        ...(groupId && { groupId }),
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        photos: {
          select: {
            isMain: true,
            photo: {
              select: {
                uid: true,
                name: true,
                url: true,
              },
            },
          },
        },
        authors: {
          select: {
            isAuthor: true,
            userId: true,
          },
        },
        styles: {
          select: {
            styleId: true,
          },
        },
      },
    });
  }

  /* =========================
   * UPDATE
   * ========================= */
  async updateProductUseCase(data: UpdateProductUseCase) {
    const { productId, userId, data: updateData, images, styles, audio } = data;

    // El chequeo de autoría vive en el `where`, no en un `if` posterior: así no
    // hay forma de leer la obra ajena antes de rechazarla, y la respuesta es la
    // misma --404-- para "no existe" y para "no es tuya". Un 403 acá confirma
    // que la obra existe, que es el mismo criterio de `assertCanViewGroup`.
    //
    // Antes era un `findUnique` por uid a secas: la extensión de tenant impedía
    // cruzar instituciones, pero dentro de una cualquier rol con permiso de
    // edición podía sobrescribir la obra de otra persona.
    // `findFirst` y no `findUnique` porque `findUnique` no acepta filtros de
    // relación. Aprobar y rechazar siguen por su propio endpoint, con su rol.
    const product = await this.prisma.products.findFirst({
      where: { uid: productId, authors: { some: { userId } } },
      include: {
        photos: {
          select: {
            uid: true,
            photoId: true,
            isMain: true,
            photo: {
              select: { uid: true, url: true },
            },
          },
        },
      },
    });

    if (!product) throw new NotFoundException('Product not found');

    // Misma validación que en create: los estilos tienen que ser de la
    // categoría del grupo de la obra.
    if (styles?.length) {
      await this.assertStylesMatchCategory(
        styles,
        await this.assertGroupInTenant(product.groupId),
      );
    }

    /**
     * FASE 1️⃣ — Guardar archivos nuevos en disco (fuera de transacción)
     * Si la transacción falla, se eliminan estos archivos.
     */
    const savedFiles: {
      fileName: string;
      url: string;
      folder: string;
      isMain: boolean;
    }[] = [];

    if (images && images.length > 0) {
      for (const img of images.filter((i) => !i.isExisting)) {
        const base64 = img.base64!;
        const match = base64.match(/^data:image\/(\w+);base64,(.+)$/);
        const buffer = match
          ? Buffer.from(match[2], 'base64')
          : Buffer.from(base64, 'base64');
        const extension = match ? match[1] : 'jpeg';

        const uid = uuidv4();
        const rawName = img.name!;
        const fileName = rawName.includes('.')
          ? `${uid}_${rawName}`
          : `${uid}_${rawName}.${extension}`;
        const folder = img.folder ?? 'products';

        const fileResult = await photoManagement.save({
          fileBuffer: buffer,
          fileName,
          folderPath: folder,
        });

        savedFiles.push({
          fileName,
          url: fileResult.url,
          folder,
          isMain: img.isMain,
        });
      }
    }

    /* Convierte el precio de number a Decimal si está definido */
    // Sin `audio` en el body, `audioUrl` queda undefined y Prisma no toca la
    // columna: editar el titulo de una cancion no le borra el audio.
    const audioUrl = audio ? await this.saveAudio(audio.base64) : undefined;

    const parsedData = {
      ...updateData,
      price:
        updateData.price !== undefined
          ? new Decimal(updateData.price)
          : undefined,
      audioUrl,
    };

    /**
     * FASE 2️⃣ — Transacción atómica (TODO en BD se revierte si algo falla)
     */
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // 1️⃣ Update producto
        await tx.products.update({
          where: { uid: productId },
          data: {
            ...parsedData,
            status: ProductStatus.PENDING,
            feedback: null,
          },
        });

        // 2️⃣ Sincronizar imágenes
        if (images && images.length > 0) {
          const incomingExistingUids = images
            .filter((img) => img.isExisting && img.uid)
            .map((img) => img.uid!);

          // Eliminar relaciones ProductPhoto de fotos removidas
          const toDelete = product.photos.filter(
            (p) => !incomingExistingUids.includes(p.photo.uid),
          );

          if (toDelete.length) {
            await tx.productPhoto.deleteMany({
              where: {
                productId,
                photoId: { in: toDelete.map((p) => p.photoId) },
              },
            });

            // Eliminar registros Photos de las fotos removidas
            await tx.photos.deleteMany({
              where: { uid: { in: toDelete.map((p) => p.photoId) } },
            });
          }

          // Resetear isMain de fotos que permanecen
          await tx.productPhoto.updateMany({
            where: { productId },
            data: { isMain: false },
          });

          // Crear registros Photos + ProductPhoto para fotos nuevas
          for (const file of savedFiles) {
            const newPhoto = await tx.photos.create({
              data: { name: file.fileName, url: file.url },
            });

            await tx.productPhoto.create({
              data: {
                productId,
                photoId: newPhoto.uid,
                isMain: file.isMain,
              },
            });
          }

          // Establecer isMain en foto existente seleccionada
          const mainImage = images.find((img) => img.isMain && img.isExisting);
          if (mainImage?.uid) {
            await tx.productPhoto.updateMany({
              where: {
                productId,
                photo: { uid: mainImage.uid },
              },
              data: { isMain: true },
            });
          }
        }

        // 3️⃣ Estilos
        if (styles) {
          await tx.productStyle.deleteMany({ where: { productId } });

          if (styles.length) {
            await tx.productStyle.createMany({
              data: styles.map((styleId) => ({ productId, styleId })),
              skipDuplicates: true,
            });
          }
        }

        return { uid: productId };
      });

      // Transacción exitosa → eliminar archivos viejos del disco
      if (images && images.length > 0) {
        const incomingExistingUids = images
          .filter((img) => img.isExisting && img.uid)
          .map((img) => img.uid!);

        const toDeleteFromDisk = product.photos.filter(
          (p) => !incomingExistingUids.includes(p.photo.uid),
        );

        for (const photo of toDeleteFromDisk) {
          try {
            const cleanPath = photo.photo.url.replace(/^\/images\//, '');
            const segments = cleanPath.split('/').filter(Boolean);
            const fileName = segments.pop()!;
            const folderPath = segments.join('/');
            await photoManagement.remove(fileName, folderPath);
          } catch {
            // Archivo ya no existe, no es crítico
          }
        }
      }

      return result;
    } catch (error) {
      // Transacción falló → eliminar archivos nuevos del disco (rollback)
      for (const file of savedFiles) {
        try {
          await photoManagement.remove(file.fileName, file.folder);
        } catch {
          // Best-effort cleanup
        }
      }
      throw error;
    }
  }
  async updateStatus(data: UpdateStatusUseCase) {
    return this.prisma.products.update({
      where: { uid: data.uid },
      data: { status: data.status, feedback: data.feedback ?? null },
    });
  }

  async approveMany(productIds: string[]) {
    return this.prisma.products.updateMany({
      where: { uid: { in: productIds }, status: 'PENDING' },
      data: { status: 'APPROVED' },
    });
  }

  /* =========================
   * DELETE
   * ========================= 
  async deleteProduct(productId: string) {
    return this.prisma.products.delete({
      where: { uid: productId },
    });
  }
  */
}
