import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Spinner } from './components/ui';
import Landing from './pages/Landing';
import NotFound from './pages/NotFound';

// Routes are split out: Chat pulls react-markdown.
const Chat = lazy(() => import('./pages/Chat'));
const Admin = lazy(() => import('./pages/Admin'));

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-muted">
      <Spinner label="Loading page" className="[&>svg]:size-6" />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
