import { createBrowserRouter } from 'react-router-dom';
import { buildRoutes } from './routeTable';

/** `/componentes` solo existe en desarrollo; en producción cae en el 404 y no se empaqueta. */
export const router = createBrowserRouter(buildRoutes({ dev: import.meta.env.DEV }));
