import { Injectable, NotFoundException } from '@nestjs/common';
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
import { photoManagement } from 'src/utils/photosManagement';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photosService: PhotosService,
  ) {}

  /* =========================
   * CREATE
   * ========================= */
  async createProductUseCase(data: CreateProductUseCase) {
    const { product, styles, images, authors } = data;

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

    /* Convertir price a Decimal */
    const parsedProduct = {
      ...product,
      price:
        product.price !== undefined ? new Decimal(product.price) : undefined,
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
  async getAll(options: GetProductsOptions = {}) {
    const { page = 1, limit = 10, styleId } = options;

    return this.prisma.products.findMany({
      skip: (page - 1) * limit,
      take: limit,
      where: { styles: { some: { styleId } } },
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
    });
  }

  async getGalleryHome(options: GetProductsOptions = {}) {
    const { page = 1, limit = 10, styleId } = options;

    return this.prisma.products.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      where: {
        isActive: true,
        status: 'APPROVED',
        styles: { some: { styleId } },
      },
      select: {
        uid: true,
        name: true,
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
      },
    });
  }

  async getById(uid: string) {
    const product = await this.prisma.products.findUnique({
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
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async getAllByGroup(groupId: string, options: GetProductsOptions = {}) {
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

  async getAllByAuthor(authorId: string, options: GetProductsOptions = {}) {
    const { page = 1, limit = 10 } = options;

    return this.prisma.products.findMany({
      where: {
        authors: {
          some: { userId: authorId },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
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
      },
    });
  }

  /* =========================
   * UPDATE
   * ========================= */
  async updateProductUseCase(data: UpdateProductUseCase) {
    const { productId, data: updateData, images, styles } = data;

    const product = await this.prisma.products.findUnique({
      where: { uid: productId },
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
    const parsedData = {
      ...updateData,
      price:
        updateData.price !== undefined
          ? new Decimal(updateData.price)
          : undefined,
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
