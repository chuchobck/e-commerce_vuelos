import { createBrowserRouter } from 'react-router-dom';
import { buildRoutes } from './routeTable';

/**
 * Opciones de React Router v7 ya activas (la v6 avisa en consola mientras no se acepten). Esta app no usa loaders,
 * actions ni fetchers y sus enlaces son rutas absolutas (`routes.*`), así que cambiarlas no altera nada de lo que se ve.
 */
export const routerFuture = {
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_partialHydration: true,
  v7_relativeSplatPath: true,
  v7_skipActionErrorRevalidation: true,
} as const;

/** `/componentes` solo existe en desarrollo; en producción cae en el 404 y no se empaqueta. */
export const router = createBrowserRouter(buildRoutes({ dev: import.meta.env.DEV }), { future: routerFuture });
