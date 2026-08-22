/**
 * Catálogo de features de los planes de suscripción: slug → etiqueta legible.
 *
 * ⚠️ LOS SLUGS SON CONTRATO DE AUTORIZACIÓN, NO TEXTO DE UI.
 * FeatureGuard (src/guards/feature.guard.ts) compara el slug guardado en
 * SubscriptionPlan.features contra el de @RequireFeature('...'). Renombrar un
 * slug acá o en el seed no rompe el build: rompe la autorización en runtime,
 * en silencio, dejando pasar (o bloqueando) endpoints. Para cambiar el texto
 * que ve el usuario se cambia la etiqueta, nunca la clave.
 *
 * Hoy el único slug con guard activo es 'groups_create'. El resto todavía no
 * tiene @RequireFeature, pero se documentan igual porque el endpoint público
 * GET /subscription-plans los muestra como la promesa comercial del plan.
 */
export const FEATURE_LABELS: Record<string, string> = {
  profile: 'Perfil de artista',
  public_gallery: 'Galería pública',
  portfolio: 'Portafolio de obras',
  events_view: 'Ver eventos',
  groups_join: 'Unirse a grupos',
  groups_create: 'Crear grupos',
  products_submit: 'Publicar obras',
  events_create: 'Crear eventos',
  classes_attend: 'Asistencia a clases',
  schedule_view: 'Horarios de clases',
  certificates_receive: 'Certificados de participación',
  analytics: 'Estadísticas y reportes',
  content_requests: 'Solicitudes de contenido',
};

export interface PlanFeature {
  slug: string;
  label: string;
}

/**
 * Traduce la lista de slugs de un plan a pares { slug, label }.
 *
 * Un slug sin etiqueta cae de vuelta al propio slug en lugar de desaparecer:
 * un plan sembrado a mano con un feature nuevo se ve feo en la UI, pero se ve
 * — perderlo en silencio haría creer que el plan no lo incluye.
 *
 * `features` es una columna Json en el schema, así que llega tipada como
 * `Prisma.JsonValue`. Se valida en runtime en vez de castear.
 */
export function toPlanFeatures(features: unknown): PlanFeature[] {
  if (!Array.isArray(features)) return [];

  return features
    .filter((slug): slug is string => typeof slug === 'string')
    .map((slug) => ({ slug, label: FEATURE_LABELS[slug] ?? slug }));
}
