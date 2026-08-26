import { PrismaClient } from 'src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from 'dotenv';
import { promises as fs } from 'fs';
import * as path from 'path';
import { decodeAudioBase64, buildAudioFileName } from 'src/utils/audioDecoder';
import { photoManagement, AUDIO_ROOT } from 'src/utils/photosManagement';

// Integración: ejercita el camino real de escritura del audio —decodificar,
// escribir el archivo, guardar la ruta en `Products.audioUrl`— contra la base
// y el disco reales. Lo que NO cubre es la capa HTTP (guards y DTO), que no
// cambió de forma para este campo.
config({ path: 'env/development.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const raw = new PrismaClient({ adapter: new PrismaPg(pool) });

/** mp3 mínimo con tag ID3, suficiente para pasar la validación de firma. */
function mp3DataUrl(): string {
  const buf = Buffer.alloc(256, 0);
  buf.write('ID3', 0, 'ascii');
  return `data:audio/mpeg;base64,${buf.toString('base64')}`;
}

let groupId: string;
let institutionId: string;
let productId: string | null = null;
let writtenFile: string | null = null;

beforeAll(async () => {
  const group = await raw.groups.findFirstOrThrow({
    where: { groupCategory: { slug: 'musica' }, isActive: true },
    select: { uid: true, institutionId: true },
  });
  groupId = group.uid;
  institutionId = group.institutionId;
});

afterAll(async () => {
  if (productId) {
    await raw.products.delete({ where: { uid: productId } }).catch(() => {});
  }
  if (writtenFile) {
    await fs.unlink(writtenFile).catch(() => {});
  }
  await raw.$disconnect();
  await pool.end();
});

describe('audio de una obra — camino de escritura real', () => {
  it('decodifica, escribe el archivo y guarda la ruta en audioUrl', async () => {
    const { buffer, extension } = decodeAudioBase64(mp3DataUrl());
    expect(extension).toBe('mp3');

    const saved = await photoManagement.save({
      fileBuffer: buffer,
      fileName: buildAudioFileName(extension),
      folderPath: 'products',
      root: AUDIO_ROOT,
    });

    // La ruta que se persiste tiene que ser la pública de audio, no la de
    // imágenes: es lo que después pide el <audio> del frontend.
    expect(saved.url).toMatch(/^\/audio\/products\/[0-9a-f-]+\.mp3$/);

    writtenFile = path.join(process.cwd(), 'public', saved.url);
    await expect(fs.access(writtenFile)).resolves.toBeUndefined();

    const created = await raw.products.create({
      data: {
        name: 'Obra de prueba — audio',
        description: 'Creada por Product.audio.spec.ts',
        madeAt: new Date(),
        groupId,
        institutionId,
        audioUrl: saved.url,
        status: 'APPROVED',
      },
      select: { uid: true, audioUrl: true },
    });
    productId = created.uid;

    expect(created.audioUrl).toBe(saved.url);
  });

  it('una obra sin audio guarda null, no rompe nada', async () => {
    const sinAudio = await raw.products.create({
      data: {
        name: 'Obra de prueba — sin audio',
        description: 'Creada por Product.audio.spec.ts',
        madeAt: new Date(),
        groupId,
        institutionId,
      },
      select: { uid: true, audioUrl: true },
    });

    expect(sinAudio.audioUrl).toBeNull();
    await raw.products.delete({ where: { uid: sinAudio.uid } });
  });
});
