type RoutePreloader = {
  path: string;
  preload: () => Promise<unknown>;
};

const routePreloaders: RoutePreloader[] = [
  { path: '/guias/fila', preload: () => import('@/pages/guias/Guias') },
  { path: '/guias/enviadas', preload: () => import('@/pages/guias/Guias') },
  { path: '/guias/excecoes', preload: () => import('@/pages/guias/Guias') },
  { path: '/guias', preload: () => import('@/pages/guias/Guias') },
  { path: '/empresas', preload: () => import('@/pages/Empresas') },
  { path: '/integracoes', preload: () => import('@/pages/guias/IntegracoesGuias') },
  { path: '/fator-r', preload: () => import('@/pages/FatorR') },
  { path: '/classifica', preload: () => import('@/pages/Classifica') },
  { path: '/whatsapp', preload: () => import('@/pages/admin/WhatsApp') },
  { path: '/configuracoes', preload: () => import('@/pages/Configuracoes') },
  { path: '/documentos', preload: () => import('@/pages/Documentos') },
  { path: '/envios', preload: () => import('@/pages/Envios') },
  { path: '/alertas', preload: () => import('@/pages/Alertas') },
  { path: '/logs', preload: () => import('@/pages/Logs') },
].sort((a, b) => b.path.length - a.path.length);

const routePromises = new Map<string, Promise<unknown>>();

function isRouteMatch(pathname: string, route: string) {
  if (route === '/') return pathname === route;
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function preloadRoute(pathname: string) {
  const match = routePreloaders.find((route) => isRouteMatch(pathname, route.path));
  if (!match || routePromises.has(match.path)) return;

  routePromises.set(
    match.path,
    match.preload().catch((error) => {
      routePromises.delete(match.path);
      console.warn('[navigation] route preload failed', match.path, error);
    }),
  );
}

export function preloadInitialAppRoutes() {
  [
    '/guias/fila',
    '/empresas',
    '/integracoes',
    '/fator-r',
    '/classifica',
    '/configuracoes',
  ].forEach(preloadRoute);
}
