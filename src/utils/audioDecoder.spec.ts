import { BadRequestException } from '@nestjs/common';
import {
  decodeAudioBase64,
  buildAudioFileName,
  MAX_AUDIO_BYTES,
} from './audioDecoder';

// ── Ayudas para armar payloads con firma real ────────────────────────────────

/** MP3 con tag ID3 y relleno hasta `size` bytes. */
function mp3(size = 64): Buffer {
  const b = Buffer.alloc(size, 0);
  b.write('ID3', 0, 'ascii');
  return b;
}

function wav(): Buffer {
  const b = Buffer.alloc(64, 0);
  b.write('RIFF', 0, 'ascii');
  b.write('WAVE', 8, 'ascii');
  return b;
}

function ogg(): Buffer {
  const b = Buffer.alloc(64, 0);
  b.write('OggS', 0, 'ascii');
  return b;
}

function m4a(): Buffer {
  const b = Buffer.alloc(64, 0);
  b.write('ftyp', 4, 'ascii');
  return b;
}

const dataUrl = (mime: string, buf: Buffer) =>
  `data:${mime};base64,${buf.toString('base64')}`;

describe('decodeAudioBase64', () => {
  describe('acepta los formatos de la whitelist', () => {
    it.each([
      { mime: 'audio/mpeg', buf: mp3(), ext: 'mp3' },
      { mime: 'audio/wav', buf: wav(), ext: 'wav' },
      { mime: 'audio/ogg', buf: ogg(), ext: 'ogg' },
      { mime: 'audio/mp4', buf: m4a(), ext: 'm4a' },
    ])('$mime → .$ext', ({ mime, buf, ext }) => {
      const res = decodeAudioBase64(dataUrl(mime, buf));

      expect(res.extension).toBe(ext);
      expect(res.buffer.equals(buf)).toBe(true);
    });
  });

  describe('rechaza lo que no es audio', () => {
    // El bug que se evita: Photos.service, ante un string sin prefijo, asume
    // jpeg y escribe igual. Acá no se asume nada.
    it('sin prefijo data: → 400, no adivina el formato', () => {
      expect(() => decodeAudioBase64(mp3().toString('base64'))).toThrow(
        BadRequestException,
      );
    });

    it('un MIME fuera de la whitelist → 400', () => {
      expect(() => decodeAudioBase64(dataUrl('text/html', mp3()))).toThrow(
        /no permitido/i,
      );
    });

    it('una imagen disfrazada de audio → 400', () => {
      expect(() => decodeAudioBase64(dataUrl('image/jpeg', mp3()))).toThrow(
        BadRequestException,
      );
    });

    it('string vacío → 400', () => {
      expect(() => decodeAudioBase64('')).toThrow(BadRequestException);
    });

    // El MIME lo declara el cliente y puede mentir; los bytes no.
    it('HTML con un MIME de audio mentido → 400', () => {
      const html = Buffer.from('<html><script>alert(1)</script></html>');

      expect(() => decodeAudioBase64(dataUrl('audio/mpeg', html))).toThrow(
        /no corresponde a un audio/i,
      );
    });

    it('sobre el tope de tamaño → 400', () => {
      const grande = mp3(MAX_AUDIO_BYTES + 1);

      expect(() => decodeAudioBase64(dataUrl('audio/mpeg', grande))).toThrow(
        /supera el máximo/i,
      );
    });

    it('justo en el tope todavía pasa', () => {
      const justo = mp3(MAX_AUDIO_BYTES);

      expect(decodeAudioBase64(dataUrl('audio/mpeg', justo)).extension).toBe(
        'mp3',
      );
    });
  });

  it('la extensión sale del MIME, nunca del nombre que manda el cliente', () => {
    // El cliente diría "cancion.exe"; el resultado depende solo del MIME.
    const res = decodeAudioBase64(dataUrl('audio/mpeg', mp3()));

    expect(res.extension).toBe('mp3');
    expect(res.mime).toBe('audio/mpeg');
  });
});

describe('buildAudioFileName', () => {
  it('es <uuid>.<ext> y descarta cualquier nombre del cliente', () => {
    const name = buildAudioFileName('mp3');

    expect(name).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$/,
    );
  });

  it('no arrastra recorrido de rutas', () => {
    const name = buildAudioFileName('mp3');

    expect(name).not.toContain('..');
    expect(name).not.toContain('/');
    expect(name).not.toContain('\\');
  });

  it('dos llamadas no colisionan', () => {
    expect(buildAudioFileName('mp3')).not.toBe(buildAudioFileName('mp3'));
  });
});
