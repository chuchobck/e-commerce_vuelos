import { RouterProvider } from 'react-router-dom';
import { AuthProvider, session } from '@/features/auth';
import { ThemeProvider } from './providers/ThemeProvider';
import { router } from './router';

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider manager={session}>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </AuthProvider>
    </ThemeProvider>
  );
}
