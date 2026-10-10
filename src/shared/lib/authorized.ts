/**
 * Ejecuta una llamada con sesión: si el token venció lo renueva una vez y reintenta (`useAuth().authorized`).
 * Vive aquí para que los módulos de `features` reciban la función por parámetro sin importar de `features/auth`.
 */
export type Authorized = <T>(call: () => Promise<T>) => Promise<T>;
