// En qué ambiente corre esta copia de la app. Lo decide el destino al publicar (ambientes.json y
// tools/publicar/publicar.cjs); sin esas variables, la app se comporta como producción.

/** true: esta dirección es el ambiente de pruebas, con su propia base de datos. */
export const IS_TEST_ENV = process.env.EXPO_PUBLIC_APP_ENV === 'test';

/** Dirección nueva de la app cuando esta copia avisa de una mudanza; null si no hay mudanza. */
export const MOVED_TO: string | null = process.env.EXPO_PUBLIC_MOVED_TO || null;

/** La dirección sin «https://» ni la barra final, para mostrarla. */
export const shortAddress = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
