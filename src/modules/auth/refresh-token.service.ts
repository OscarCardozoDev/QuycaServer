import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';

/**
 * Refresh tokens con rotación y detección de reuso sobre `redis-auth`.
 * Diseño completo: obsidian/Decisiones/Almacenamiento-de-Refresh-Tokens.md
 * Plan:   obsidian/Raw/Planes/2026-08-31-refresh-tokens.md
 *
 * Modelo de datos en Redis (TTL = REFRESH_TTL_SECONDS en las tres):
 *   rt:<sha256>       -> JSON RefreshPayload             (token vivo)
 *   rvk:<sha256>      -> JSON {fam, uid}                 (tumba: revocado pero recordado)
 *   famrvk:<familyId> -> '1'                             (interruptor de familia revocada)
 *
 * El token crudo (randomBytes(32) en base64url) nunca se guarda: solo su
 * SHA-256. Nunca escribas `where: { institutionId }` acá — este módulo no
 * pasa por el tenant, no aplica.
 */

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 7;
const REFRESH_TTL_SECONDS = REFRESH_TTL_DAYS * 24 * 60 * 60;

// El script vive acá y no en un .lua aparte a propósito: cargarlo desde disco
// obligaba a declararlo como asset en nest-cli.json y a resolver a mano la
// diferencia entre dist/src/... (tsc) y dist/... (copiador de assets). Son 34
// líneas; el costo de esa plomería era mayor que el de tenerlas inline.
//
// KEYS[1] = rt:<hashViejo>   KEYS[2] = rvk:<hashViejo>   KEYS[3] = rt:<hashNuevo>
// ARGV[1] = ttl segundos     ARGV[2] = iat nuevo, epoch en ms
//
// ARGV[2] es solo el iat, no el payload completo: el script ya tiene acá
// mismo el payload viejo decodificado, así que arma el payload nuevo con su
// propio uid/fam sin que el caller tenga que adivinarlos con una lectura
// previa no atómica (ver la nota en rotate() más abajo).
//
// El script arma `famrvk:<fam>` a partir del payload/tumba decodificados, así
// que esa clave NO está declarada en KEYS. Es válido en instancia única (la
// que usa este proyecto) y se rompería en Redis Cluster, que exige declarar
// todas las claves que toca un script para poder enrutarlas al slot
// correcto. Si algún día hay cluster: hash tag `rt:{<fam>}:<hash>` en todas
// las claves de una familia para forzar que caigan en el mismo slot.
const ROTATE_LUA = `
local payload = redis.call('GET', KEYS[1])

if payload then
  local old = cjson.decode(payload)
  local fam = old['fam']
  if redis.call('EXISTS', 'famrvk:' .. fam) == 1 then
    return {'REVOKED_FAMILY', ''}
  end
  redis.call('DEL', KEYS[1])
  -- tumba: revocado pero recordado, con uid para que el log de REUSE pueda
  -- decir a quién le robaron el token, no solo qué familia murió.
  redis.call('SET', KEYS[2], cjson.encode({fam = fam, uid = old['uid']}), 'EX', ARGV[1])
  local fresh = cjson.encode({uid = old['uid'], userTypeId = old['userTypeId'], fam = fam, iat = tonumber(ARGV[2])})
  redis.call('SET', KEYS[3], fresh, 'EX', ARGV[1])
  return {'OK', payload}
end

local tomb = redis.call('GET', KEYS[2])
if tomb then
  local t = cjson.decode(tomb)
  redis.call('SET', 'famrvk:' .. t['fam'], '1', 'EX', ARGV[1])
  return {'REUSE', tomb}
end

return {'UNKNOWN', ''}
`;

interface RefreshPayload {
  uid: string;
  userTypeId: string | null;
  fam: string;
  iat: number; // epoch en MILISEGUNDOS (Date.now()), nunca en segundos: se
  // compara contra Credentials.passwordChangedAt.getTime(), que es ms.
}

interface Tombstone {
  fam: string;
  uid: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

type RotateResult = ['OK' | 'REUSE' | 'REVOKED_FAMILY' | 'UNKNOWN', string];

// ioredis extendido con el comando cargado vía defineCommand en el
// constructor. `rotateRefresh` no existe en los tipos de la librería porque
// se define en runtime a partir de ROTATE_LUA.
type RedisWithRotate = Redis & {
  rotateRefresh(
    rtOld: string,
    rvkOld: string,
    rtNew: string,
    ttlSeconds: number,
    newIat: number,
  ): Promise<RotateResult>;
};

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  private readonly redis: RedisWithRotate;

  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
  ) {
    // defineCommand carga el script una vez y lo invoca por SHA (EVALSHA),
    // con recarga automática si Redis lo purga del cache de scripts. Sin
    // esto habría que manejar NOSCRIPT a mano en cada llamada.
    this.redisService.client.defineCommand('rotateRefresh', {
      numberOfKeys: 3,
      lua: ROTATE_LUA,
    });
    this.redis = this.redisService.client as RedisWithRotate;
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private signAccessToken(
    uid: string,
    userTypeId: string | null,
  ): Promise<string> {
    return this.jwtService.signAsync(
      { uid, userTypeId },
      { expiresIn: ACCESS_TTL },
    );
  }

  /**
   * Emite un par access/refresh nuevo. Sin `familyId` arranca una familia
   * nueva (login/register); con `familyId` continúa una existente (lo usa
   * `rotate()` internamente).
   */
  async issuePair(
    uid: string,
    userTypeId: string | null,
    familyId?: string,
  ): Promise<TokenPair> {
    const fam = familyId ?? randomUUID();
    const refreshToken = randomBytes(32).toString('base64url');
    const hash = this.sha256(refreshToken);
    const payload: RefreshPayload = { uid, userTypeId, fam, iat: Date.now() };

    await this.redis.set(
      `rt:${hash}`,
      JSON.stringify(payload),
      'EX',
      REFRESH_TTL_SECONDS,
    );

    const accessToken = await this.signAccessToken(uid, userTypeId);
    return { accessToken, refreshToken };
  }

  /**
   * Rota un refresh token. Traduce la salida de ROTATE_LUA:
   *   OK             -> valida passwordChangedAt y devuelve el par nuevo
   *   REUSE          -> la familia ya quedó revocada DENTRO del script -> 401 + log warn
   *   REVOKED_FAMILY -> 401
   *   UNKNOWN        -> 401 (token vencido o inexistente)
   *
   * Sin lectura previa (`GET`) del token viejo: el script ya decodifica el
   * payload que necesita (uid/userTypeId/fam) y arma el payload nuevo del
   * lado de Redis, así que el único dato que el caller aporta es el `iat`
   * fresco. Una lectura no atómica acá sería un round trip de más y una foto
   * que podría no coincidir con lo que el script termina decidiendo.
   *
   * ponytail: dos refresh en paralelo con el MISMO token viejo hacen que el
   * segundo caiga en REUSE y mate la familia de un usuario inocente. No hay
   * ventana de gracia y es deliberado (ver ADR): el single-flight del
   * frontend (tarea 5 del plan) es lo que lo previene en la práctica. Si
   * aparece en producción, la mejora es que la tumba guarde también el hash
   * nuevo y devuelva ese par dentro de una ventana de ~10s.
   */
  async rotate(rawToken: string): Promise<TokenPair> {
    const oldHash = this.sha256(rawToken);
    const newRawToken = randomBytes(32).toString('base64url');
    const newHash = this.sha256(newRawToken);

    const [status, data] = await this.redis.rotateRefresh(
      `rt:${oldHash}`,
      `rvk:${oldHash}`,
      `rt:${newHash}`,
      REFRESH_TTL_SECONDS,
      Date.now(),
    );

    if (status === 'OK') {
      const old = JSON.parse(data) as RefreshPayload;

      const credential = await this.prismaService.credentials.findUnique({
        where: { uid: old.uid },
        select: { passwordChangedAt: true },
      });

      if (credential && old.iat < credential.passwordChangedAt.getTime()) {
        throw new UnauthorizedException(
          'Refresh token invalidado por cambio de contraseña',
        );
      }

      const accessToken = await this.signAccessToken(old.uid, old.userTypeId);
      return { accessToken, refreshToken: newRawToken };
    }

    if (status === 'REUSE') {
      // data = tumba JSON {fam, uid}. Robo de token detectado, no un error
      // de usuario: dos partes presentaron el mismo refresh token ya
      // consumido. La tumba siempre trae el uid, sin "desconocido".
      const tomb = JSON.parse(data) as Tombstone;
      this.logger.warn(
        `Reuso de refresh token detectado, familia revocada: uid=${tomb.uid} familyId=${tomb.fam}`,
      );
      throw new UnauthorizedException('Refresh token reutilizado');
    }

    if (status === 'REVOKED_FAMILY') {
      throw new UnauthorizedException('Familia de refresh token revocada');
    }

    throw new UnauthorizedException('Refresh token desconocido o vencido');
  }

  /** Interruptor de familia. Lo usa `logout` (tarea 4). */
  async revokeFamily(familyId: string): Promise<void> {
    await this.redis.set(`famrvk:${familyId}`, '1', 'EX', REFRESH_TTL_SECONDS);
  }

  /**
   * Revoca la familia a la que pertenece este token, sin rotarlo. La usa
   * `logout`: cerrar sesión tiene que matar la cadena entera en el servidor,
   * no solo borrar la cookie del navegador —ese era el bug original que
   * motivó toda la fase—.
   *
   * Deliberadamente no mira la tumba `rvk:`: si el token ya fue rotado,
   * presentar el crudo es una señal de reuso y le corresponde a `rotate()`
   * decidir qué hacer, no a `logout`.
   *
   * Nunca lanza: un logout con cookie ausente, vencida o desconocida sigue
   * siendo un logout exitoso.
   */
  async revokeByToken(rawToken: string): Promise<void> {
    const payload = await this.redis.get(`rt:${this.sha256(rawToken)}`);
    if (!payload) return;

    const { fam } = JSON.parse(payload) as RefreshPayload;
    await this.revokeFamily(fam);
  }
}
