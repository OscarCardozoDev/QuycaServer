/* =========================
 * ENUMS
 * ========================= */

export enum EventStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum EventType {
  EXHIBITION = 'EXHIBITION',
  WORKSHOP = 'WORKSHOP',
  PERFORMANCE = 'PERFORMANCE',
  CONFERENCE = 'CONFERENCE',
  OTHER = 'OTHER',
}

export enum EventPhotoType {
  HERO = 'HERO',
  PROMO = 'PROMO',
  MEMORY = 'MEMORY',
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

/* =========================
 * PARAMS / OPTIONS
 * ========================= */

export interface GetEventsOptions {
  page?: number;
  limit?: number;
  status?: EventStatus;
  eventType?: EventType;
}

/* =========================
 * CASOS DE USO
 * ========================= */

export interface CreateEventUseCase {
  event: {
    name: string;
    description: string;
    eventType: EventType;
    startDate: Date;
    endDate?: Date;
    locationUrl?: string;
    isVirtual: boolean;
    streamingUrl?: string;
    createdById: string;
    institutionId: string;
  };
  // Grupos propios del coordinador (entran directo a GroupEvent, sin invitación)
  groupIds: string[];
  productIds?: string[];
  coverPhoto?: {
    base64: string;
    name: string;
    folder: string;
  };
}

export interface UpdateEventUseCase {
  eventId: string;
  data: {
    name?: string;
    description?: string;
    eventType?: EventType;
    startDate?: Date;
    endDate?: Date;
    locationUrl?: string;
    isVirtual?: boolean;
    streamingUrl?: string;
  };
}

export interface UpdateEventStatusUseCase {
  uid: string;
  status: EventStatus;
  feedback?: string;
}

export interface UpdateEventProductsUseCase {
  eventId: string;
  // IDs de las obras que pertenecen al grupo del solicitante
  productIds: string[];
  // Grupo del profesor que hace la solicitud (para reemplazar solo sus obras)
  requestingGroupId: string;
}

export interface AddEventPhotoUseCase {
  eventId: string;
  images: {
    base64: string;
    name: string;
    folder: string;
    photoType: EventPhotoType;
  }[];
}

export interface RespondInvitationUseCase {
  invitationId: string;
  status: InvitationStatus.ACCEPTED | InvitationStatus.REJECTED;
}

/* =========================
 * PORTAFOLIO DEL ARTISTA
 * ========================= */

// Eventos en los que un autor participó (getByAuthor). "Participó" = tiene
// una obra propia expuesta — ver Event.service.ts § getByAuthor.
export interface AuthorEvent {
  uid: string;
  name: string;
  eventType: EventType;
  startDate: Date;
  endDate: Date | null;
  isVirtual: boolean;
  locationUrl: string | null;
  worksCount: number;
  works: { uid: string; name: string }[];
}
