/** Cuenta y sesión (F3). Solo lo que se exporte aquí es público. */
export { AuthProvider, useAuth, type AuthContextValue } from './AuthProvider';
export { session } from './instance';
export { LoginForm, type LoginFormProps } from './LoginForm';
export { RegisterForm, type RegisterFormProps } from './RegisterForm';
export type { SessionEndReason, SessionState, SessionStatus } from './session';
// Para construir una sesión con otras dependencias (pruebas, integración contra la API).
export { createLocalLock, type ChannelLike, type LockLike } from './crossTab';
export { SessionManager, type AuthApi } from './session';
export { createTokenStore, type StorageLike, type TokenStore } from './tokenStore';
