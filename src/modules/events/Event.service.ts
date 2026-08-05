import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PhotosService } from 'src/modules/photos/Photos.service';
import {
  CreateEventUseCase,
  UpdateEventUseCase,
  UpdateEventStatusUseCase,
  UpdateEventProductsUseCase,
  AddEventPhotoUseCase,
  RespondInvitationUseCase,
  GetEventsOptions,
  EventStatus,
  EventPhotoType,
  InvitationStatus,
} from './Event.interface';

/* =========================
 * TIPOS AUXILIARES
 * ========================= */

/**
 * Forma mínima que necesita lazyComplete para operar.
 * Al usar un genérico que extiende esto garantizamos que
 * el objeto de entrada siempre tenga los tres campos
 * sin recurrir a `any`.
 */
type LazyCompleteBase = {
  uid: string;
  status: string;
  startDate: Date;
};

@Injectable()
export class EventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photosService: PhotosService,
  ) {}

  /* =========================
   * HELPERS PRIVADOS
   * ========================= */

  /**
   * Si el evento está APPROVED y su fecha ya pasó, lo actualiza a
   * COMPLETED en la BD y devuelve el objeto con el status corregido.
   *
   * El cast `as T` es seguro porque solo modificamos la propiedad
   * `status`, que ya existe en T (heredada del constraint LazyCompleteBase).
   */
  private async lazyComplete<T extends LazyCompleteBase>(event: T): Promise<T> {
    if (event.status === EventStatus.APPROVED && event.startDate < new Date()) {
      await this.prisma.events.update({
        where: { uid: event.uid },
        data: { status: EventStatus.COMPLETED },
      });
      return { ...event, status: EventStatus.COMPLETED } as T;
    }
    return event;
  }

  /* =========================
   * CREATE
   * ========================= */

  async createEventUseCase(data: CreateEventUseCase): Promise<{ uid: string }> {
    const { event, groupIds, productIds, coverPhoto } = data;

    // FASE 1️⃣ — Subir foto de portada (fuera de transacción)
    let coverPhotoId: string | null = null;

    if (coverPhoto) {
      const photo = await this.photosService.createPhotoUseCase({
        base64: coverPhoto.base64,
        name: coverPhoto.name,
        folder: coverPhoto.folder,
      });
      coverPhotoId = photo.uid;
    }

    // FASE 2️⃣ — Transacción DB
    return this.prisma.$transaction(async (tx) => {
      // 1️⃣ Crear el evento
      const createdEvent = await tx.events.create({
        data: event,
        select: { uid: true },
      });

      // 2️⃣ Vincular grupos del coordinador directamente (sin invitación)
      if (groupIds?.length) {
        await tx.groupEvent.createMany({
          data: groupIds.map((groupId) => ({
            groupId,
            eventId: createdEvent.uid,
          })),
          skipDuplicates: true,
        });
      }

      // 3️⃣ Vincular obras (solo APPROVED del grupo del coordinador)
      if (productIds?.length) {
        await tx.eventProduct.createMany({
          data: productIds.map((productId) => ({
            productId,
            eventId: createdEvent.uid,
          })),
          skipDuplicates: true,
        });
      }

      // 4️⃣ Vincular foto de portada (HERO)
      if (coverPhotoId) {
        await tx.eventPhoto.create({
          data: {
            eventId: createdEvent.uid,
            photoId: coverPhotoId,
            photoType: EventPhotoType.HERO,
          },
        });
      }

      return { uid: createdEvent.uid };
    });
  }

  /* =========================
   * READ
   * ========================= */

  async getAll(options: GetEventsOptions = {}) {
    const { page = 1, limit = 10, status, eventType } = options;

    const events = await this.prisma.events.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { startDate: 'asc' },
      where: {
        ...(status !== undefined && { status }),
        ...(eventType !== undefined && { eventType }),
      },
      include: {
        groups: {
          select: {
            group: { select: { uid: true, name: true, categoryId: true } },
          },
        },
        photos: {
          where: { photoType: EventPhotoType.HERO },
          select: {
            photoType: true,
            photo: { select: { uid: true, url: true } },
          },
          take: 1,
        },
        createdBy: {
          select: { uid: true, name: true, lastName: true },
        },
      },
    });

    // Lazy complete: marcar como COMPLETED los que ya pasaron
    return Promise.all(events.map((e) => this.lazyComplete(e)));
  }

  async getUpcoming(options: GetEventsOptions = {}) {
    const { page = 1, limit = 10, eventType } = options;

    return this.prisma.events.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { startDate: 'asc' },
      where: {
        isActive: true,
        status: EventStatus.APPROVED,
        startDate: { gt: new Date() },
        ...(eventType !== undefined && { eventType }),
      },
      select: {
        uid: true,
        name: true,
        description: true,
        eventType: true,
        startDate: true,
        endDate: true,
        isVirtual: true,
        groups: {
          select: {
            group: { select: { uid: true, name: true, categoryId: true } },
          },
        },
        photos: {
          where: { photoType: EventPhotoType.HERO },
          select: {
            photoType: true,
            photo: { select: { uid: true, url: true } },
          },
          take: 1,
        },
      },
    });
  }

  async getPast(options: GetEventsOptions = {}) {
    const { page = 1, limit = 10, eventType } = options;

    return this.prisma.events.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { startDate: 'desc' },
      where: {
        isActive: true,
        status: EventStatus.COMPLETED,
        ...(eventType !== undefined && { eventType }),
      },
      select: {
        uid: true,
        name: true,
        description: true,
        eventType: true,
        startDate: true,
        endDate: true,
        groups: {
          select: {
            group: { select: { uid: true, name: true, categoryId: true } },
          },
        },
        photos: {
          where: { photoType: EventPhotoType.HERO },
          select: {
            photoType: true,
            photo: { select: { uid: true, url: true } },
          },
          take: 1,
        },
      },
    });
  }

  /**
   * Para la página de inicio: id, nombre, fecha y foto HERO
   * de los próximos eventos APPROVED.
   */
  async getHome(options: GetEventsOptions = {}) {
    const { page = 1, limit = 6 } = options;

    return this.prisma.events.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { startDate: 'asc' },
      where: {
        isActive: true,
        status: EventStatus.APPROVED,
        startDate: { gt: new Date() },
      },
      select: {
        uid: true,
        name: true,
        eventType: true,
        startDate: true,
        photos: {
          where: { photoType: EventPhotoType.HERO },
          select: {
            photoType: true,
            photo: { select: { uid: true, url: true } },
          },
          take: 1,
        },
      },
    });
  }

  async getById(uid: string) {
    const event = await this.prisma.events.findUnique({
      where: { uid },
      include: {
        groups: {
          select: {
            group: { select: { uid: true, name: true, categoryId: true } },
          },
        },
        products: {
          select: {
            product: {
              select: {
                uid: true,
                name: true,
                description: true,
                photos: {
                  where: { isMain: true },
                  select: {
                    photo: { select: { uid: true, url: true } },
                  },
                  take: 1,
                },
              },
            },
          },
        },
        photos: {
          select: {
            photoType: true,
            photo: { select: { uid: true, url: true } },
          },
        },
        createdBy: {
          select: { uid: true, name: true, lastName: true },
        },
        invitations: {
          select: {
            uid: true,
            status: true,
            group: { select: { uid: true, name: true } },
          },
        },
      },
    });

    if (!event) throw new NotFoundException('Event not found');

    // Variable separada para no reasignar `event` y mantener el tipo de Prisma intacto
    return this.lazyComplete(event);
  }

  async getByGroup(groupId: string, options: GetEventsOptions = {}) {
    const { page = 1, limit = 10 } = options;

    return this.prisma.events.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { startDate: 'asc' },
      where: {
        isActive: true,
        status: { in: [EventStatus.APPROVED, EventStatus.COMPLETED] },
        groups: { some: { groupId } },
      },
      select: {
        uid: true,
        name: true,
        eventType: true,
        status: true,
        startDate: true,
        endDate: true,
        photos: {
          where: { photoType: EventPhotoType.HERO },
          select: {
            photoType: true,
            photo: { select: { uid: true, url: true } },
          },
          take: 1,
        },
      },
    });
  }

  /**
   * Obras APPROVED del grupo disponibles para agregar a un evento.
   */
  async getAvailableProducts(groupId: string) {
    return this.prisma.products.findMany({
      where: { groupId, status: 'APPROVED', isActive: true },
      select: {
        uid: true,
        name: true,
        description: true,
        photos: {
          where: { isMain: true },
          select: {
            photo: { select: { uid: true, url: true } },
          },
          take: 1,
        },
        authors: {
          select: {
            isAuthor: true,
            user: { select: { name: true, lastName: true } },
          },
        },
      },
    });
  }

  /* =========================
   * UPDATE
   * ========================= */

  async updateEventUseCase(data: UpdateEventUseCase) {
    const { eventId, data: updateData } = data;

    const event = await this.prisma.events.findUnique({
      where: { uid: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('A cancelled event cannot be edited');
    }

    return this.prisma.events.update({
      where: { uid: eventId },
      data: {
        ...updateData,
        // Cualquier edición vuelve a PENDING y limpia el feedback anterior
        status: EventStatus.PENDING,
        feedback: null,
      },
    });
  }

  async updateStatus(data: UpdateEventStatusUseCase) {
    return this.prisma.events.update({
      where: { uid: data.uid },
      data: { status: data.status, feedback: data.feedback ?? null },
    });
  }

  async deactivate(uid: string) {
    const event = await this.prisma.events.findUnique({ where: { uid } });
    if (!event) throw new NotFoundException('Event not found');

    return this.prisma.events.update({
      where: { uid },
      data: { isActive: false },
    });
  }

  /* =========================
   * PRODUCTS DEL EVENTO
   * ========================= */

  /**
   * Reemplaza SOLO las obras del grupo solicitante dentro del evento.
   * Las obras de otros grupos no se tocan.
   * Cualquier cambio devuelve el evento a PENDING.
   */
  async updateEventProducts(
    data: UpdateEventProductsUseCase,
  ): Promise<{ uid: string }> {
    const { eventId, productIds, requestingGroupId } = data;

    const event = await this.prisma.events.findUnique({
      where: { uid: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot edit products of a cancelled event',
      );
    }

    // Validar que todas las obras pertenecen al grupo solicitante y están APPROVED
    if (productIds.length) {
      const validProducts = await this.prisma.products.findMany({
        where: {
          uid: { in: productIds },
          groupId: requestingGroupId,
          status: 'APPROVED',
          isActive: true,
        },
        select: { uid: true },
      });

      if (validProducts.length !== productIds.length) {
        throw new BadRequestException(
          'Some products are not APPROVED or do not belong to your group',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Obtener obras actuales del evento que pertenecen al grupo solicitante
      const currentGroupProducts = await tx.eventProduct.findMany({
        where: {
          eventId,
          product: { groupId: requestingGroupId },
        },
        select: { uid: true },
      });

      // Eliminar las obras actuales del grupo
      if (currentGroupProducts.length) {
        await tx.eventProduct.deleteMany({
          where: { uid: { in: currentGroupProducts.map((p) => p.uid) } },
        });
      }

      // Insertar las nuevas obras
      if (productIds.length) {
        await tx.eventProduct.createMany({
          data: productIds.map((productId) => ({ productId, eventId })),
          skipDuplicates: true,
        });
      }

      // Devolver a PENDING
      await tx.events.update({
        where: { uid: eventId },
        data: { status: EventStatus.PENDING, feedback: null },
      });

      return { uid: eventId };
    });
  }

  /* =========================
   * FOTOS DEL EVENTO
   * ========================= */

  async addPhoto(data: AddEventPhotoUseCase) {
    const { eventId, images } = data;

    const event = await this.prisma.events.findUnique({
      where: { uid: eventId },
      select: { name: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    /**
     * FASE 1️⃣ — Crear imágenes (fuera de transacción)
     */
    const photoResults: { uid: string; photoType: EventPhotoType }[] = [];

    const savePhotos = async (
      images: {
        base64: string;
        name: string;
        folder: string;
        photoType: EventPhotoType;
      }[],
    ) => {
      for (const image of images) {
        const photo = await this.photosService.createPhotoUseCase({
          base64: image.base64,
          name: `${image.photoType}_${event.name}`,
          folder: image.folder,
        });

        photoResults.push({
          uid: photo.uid,
          photoType: image.photoType,
        });
      }
    };

    /**
     * FASE 2️⃣ — Transacción
     */
    return this.prisma.$transaction(async (tx) => {
      // 1️⃣ Subir fotos
      await savePhotos(images);

      // 2️⃣ Si hay HERO nueva, degradar la anterior
      const hasHero = photoResults.some(
        (p) => p.photoType === EventPhotoType.HERO,
      );
      if (hasHero) {
        await tx.eventPhoto.updateMany({
          where: { eventId, photoType: EventPhotoType.HERO },
          data: { photoType: EventPhotoType.PROMO },
        });
      }

      // 3️⃣ Crear vínculos
      await tx.eventPhoto.createMany({
        data: photoResults.map((photo) => ({
          eventId,
          photoId: photo.uid,
          photoType: photo.photoType,
        })),
      });

      return {
        photos: photoResults.map((p) => ({
          uid: p.uid,
          photoType: p.photoType,
        })),
      };
    });
  }

  async removePhoto(eventId: string, photoId: string) {
    const eventPhoto = await this.prisma.eventPhoto.findFirst({
      where: { eventId, photoId },
    });

    if (!eventPhoto)
      throw new NotFoundException('Photo not found in this event');

    await this.prisma.eventPhoto.delete({
      where: { uid: eventPhoto.uid },
    });

    return await this.photosService.deletePhotoUseCase(photoId);
  }

  /* =========================
   * INVITACIONES
   * ========================= */

  async sendInvitation(eventId: string, groupId: string) {
    const event = await this.prisma.events.findUnique({
      where: { uid: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot invite groups to a cancelled event',
      );
    }

    // Verificar que el grupo no esté ya vinculado directamente
    const alreadyJoined = await this.prisma.groupEvent.findFirst({
      where: { eventId, groupId },
    });

    if (alreadyJoined) {
      throw new BadRequestException(
        'This group is already participating in the event',
      );
    }

    return this.prisma.eventInvitation.upsert({
      where: { eventId_groupId: { eventId, groupId } },
      update: { status: InvitationStatus.PENDING, respondedAt: null },
      create: { eventId, groupId },
    });
  }

  /**
   * Invitaciones pendientes del profesor autenticado
   * filtradas por los grupos que él administra.
   */
  async getPendingInvitations(profesorId: string) {
    return this.prisma.eventInvitation.findMany({
      where: {
        status: InvitationStatus.PENDING,
        group: { profesorId },
      },
      include: {
        event: {
          select: {
            uid: true,
            name: true,
            eventType: true,
            startDate: true,
            photos: {
              where: { photoType: EventPhotoType.HERO },
              select: {
                photoType: true,
                photo: { select: { uid: true, url: true } },
              },
              take: 1,
            },
          },
        },
        group: { select: { uid: true, name: true, categoryId: true } },
      },
    });
  }

  async respondInvitation(data: RespondInvitationUseCase) {
    const invitation = await this.prisma.eventInvitation.findUnique({
      where: { uid: data.invitationId },
    });

    if (!invitation) throw new NotFoundException('Invitation not found');

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        'This invitation has already been responded',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.eventInvitation.update({
        where: { uid: data.invitationId },
        data: { status: data.status, respondedAt: new Date() },
      });

      // Si acepta → crear el GroupEvent para que el profesor pueda editar
      if (data.status === InvitationStatus.ACCEPTED) {
        await tx.groupEvent.create({
          data: {
            groupId: invitation.groupId,
            eventId: invitation.eventId,
          },
        });
      }

      return updated;
    });
  }

  async removeGroupFromEvent(
    eventId: string,
    groupId: string,
  ): Promise<{ removed: boolean }> {
    const groupEvent = await this.prisma.groupEvent.findFirst({
      where: { eventId, groupId },
    });
    if (!groupEvent) throw new NotFoundException('Group not found in event');

    return this.prisma.$transaction(async (tx) => {
      await tx.groupEvent.deleteMany({ where: { eventId, groupId } });

      await tx.eventProduct.deleteMany({
        where: { eventId, product: { groupId } },
      });

      await tx.events.update({
        where: { uid: eventId },
        data: { status: EventStatus.PENDING, feedback: null },
      });

      return { removed: true };
    });
  }

  async revokeInvitation(
    eventId: string,
    groupId: string,
  ): Promise<{ revoked: boolean }> {
    const invitation = await this.prisma.eventInvitation.findFirst({
      where: { eventId, groupId },
    });

    if (!invitation) throw new NotFoundException('Invitation not found');

    return this.prisma.$transaction(async (tx) => {
      // 1️⃣ Eliminar la invitación
      await tx.eventInvitation.delete({ where: { uid: invitation.uid } });

      // 2️⃣ Eliminar la participación del grupo (si ya había aceptado)
      await tx.groupEvent.deleteMany({ where: { eventId, groupId } });

      // 3️⃣ Eliminar automáticamente las obras de ese grupo en el evento
      await tx.eventProduct.deleteMany({
        where: {
          eventId,
          product: { groupId },
        },
      });

      return { revoked: true };
    });
  }
}
