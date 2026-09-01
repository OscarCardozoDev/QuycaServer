import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsEnum,
  IsIn,
  IsDateString,
  ValidateIf,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import {
  EventStatus,
  EventType,
  EventPhotoType,
  InvitationStatus,
} from './Event.interface';
import { MEDIA_FOLDERS } from 'src/utils/photosManagement';

// ─── Params ──────────────────────────────────────────────────────────────────

export class EventParamsDto {
  @ApiProperty({ example: 'b4fa2024-0da5-49a9-bc29-2417515e118c' })
  @IsString()
  uid: string;
}

export class EventPhotoParamsDto {
  @ApiProperty({ example: 'b4fa2024-0da5-49a9-bc29-2417515e118c' })
  @IsString()
  uid: string;

  @ApiProperty({ example: 'aa35ee0c-f81a-4739-aa4c-af4cdfa820d3' })
  @IsString()
  photoId: string;
}

export class InvitationParamsDto {
  @ApiProperty({ example: 'b4fa2024-0da5-49a9-bc29-2417515e118c' })
  @IsString()
  uid: string;
}

export class EventGroupParamsDto {
  @ApiProperty({ example: 'b4fa2024-0da5-49a9-bc29-2417515e118c' })
  @IsString()
  uid: string;

  @ApiProperty({ example: 'aa35ee0c-f81a-4739-aa4c-af4cdfa820d3' })
  @IsString()
  groupId: string;
}

// ─── Query / Paginación ───────────────────────────────────────────────────────

export class GetEventsDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  limit?: number = 10;

  @ApiPropertyOptional({ enum: EventStatus })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({ enum: EventType })
  @IsOptional()
  @IsEnum(EventType)
  eventType?: EventType;
}

// ─── Foto para eventos ────────────────────────────────────────────────────────

export class EventPhotoDto {
  @ApiProperty({ example: '/9j/4AAQSkZJRgAB...' })
  @IsString()
  base64: string;

  @ApiProperty({ example: 'portada.jpeg' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'events' })
  // Conjunto cerrado, no texto libre: `folder` es un segmento de ruta en disco.
  // La barrera real esta en resolveFolder() (src/utils/photosManagement.ts);
  // esto es el refuerzo en el borde.
  @IsIn(MEDIA_FOLDERS)
  folder: string;

  @ApiProperty({ enum: EventPhotoType, example: EventPhotoType.PROMO })
  @IsEnum(EventPhotoType)
  photoType: EventPhotoType;
}

export class AddEventPhotoDto {
  @ApiProperty({ type: [EventPhotoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventPhotoDto)
  images: EventPhotoDto[];
}

// ─── Crear evento ─────────────────────────────────────────────────────────────

export class CreateEventDto {
  @ApiProperty({ example: 'Exposición Semestral 2025' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example:
      'Exhibición de obras del semestre realizada en el auditorio central.',
  })
  @IsString()
  @MaxLength(1000)
  description: string;

  @ApiProperty({ enum: EventType, example: EventType.EXHIBITION })
  @IsEnum(EventType)
  eventType: EventType;

  @ApiProperty({ example: '2025-10-15T14:00:00.000Z' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ example: '2025-10-15T18:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 'https://maps.google.com/?q=...' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationUrl?: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isVirtual: boolean;

  @ApiPropertyOptional({ example: 'https://meet.google.com/abc-xyz' })
  @ValidateIf((o) => o.isVirtual === true)
  @IsString()
  @MaxLength(500)
  streamingUrl?: string;

  // UID del usuario que crea el evento (coordinador)
  @ApiProperty({ example: 'aa35ee0c-f81a-4739-aa4c-af4cdfa820d3' })
  @IsString()
  createdById: string;

  // Grupos propios del coordinador que participan (entran directo, sin invitación)
  @ApiProperty({ type: [String], example: ['uuid-grupo-1'] })
  @IsArray()
  @IsString({ each: true })
  groupIds: string[];

  @ApiPropertyOptional({ type: [String], example: ['uuid-obra-1'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  // Foto de portada inicial (opcional al crear)
  @ApiPropertyOptional({ type: EventPhotoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EventPhotoDto)
  coverPhoto?: EventPhotoDto;
}

// ─── Actualizar info general del evento ──────────────────────────────────────

export class UpdateEventDto {
  @ApiPropertyOptional({ example: 'Nuevo nombre del evento' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Nueva descripción.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: EventType })
  @IsOptional()
  @IsEnum(EventType)
  eventType?: EventType;

  @ApiPropertyOptional({ example: '2025-11-01T14:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2025-11-01T18:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 'https://maps.google.com/?q=...' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationUrl?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isVirtual?: boolean;

  @ApiPropertyOptional({ example: 'https://meet.google.com/abc-xyz' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  streamingUrl?: string;
}

// ─── Cambiar status del evento (admin) ───────────────────────────────────────

export class UpdateEventStatusDto {
  @ApiProperty({ enum: EventStatus, example: EventStatus.APPROVED })
  @IsEnum(EventStatus)
  status: EventStatus;

  @ApiPropertyOptional({
    example: 'La fecha del evento coincide con otro evento aprobado.',
  })
  @ValidateIf(
    (o) =>
      o.status === EventStatus.REJECTED || o.status === EventStatus.CANCELLED,
  )
  @IsString()
  @MaxLength(500)
  feedback?: string;
}

// ─── Actualizar obras del evento ──────────────────────────────────────────────

export class UpdateEventProductsDto {
  @ApiProperty({ type: [String], example: ['uuid-obra-1', 'uuid-obra-2'] })
  @IsArray()
  @IsString({ each: true })
  productIds: string[];

  // Grupo del profesor que actualiza (para reemplazar solo sus obras)
  @ApiProperty({ example: 'uuid-grupo' })
  @IsString()
  groupId: string;
}

// ─── Invitaciones ─────────────────────────────────────────────────────────────

export class SendInvitationDto {
  @ApiProperty({ example: 'uuid-grupo-invitado' })
  @IsString()
  groupId: string;
}

export class RespondInvitationDto {
  @ApiProperty({
    enum: [InvitationStatus.ACCEPTED, InvitationStatus.REJECTED],
    example: InvitationStatus.ACCEPTED,
  })
  @IsEnum(InvitationStatus)
  status: InvitationStatus.ACCEPTED | InvitationStatus.REJECTED;
}
