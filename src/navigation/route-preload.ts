import {
  loadAlertas,
  loadClassifica,
  loadConfiguracoes,
  loadDocumentos,
  loadEmpresas,
  loadEnvios,
  loadFatorR,
  loadReformaTributaria,
  loadGuias,
  loadIntegracoesGuias,
  loadLogs,
  loadWhatsAppPage,
} from '@/navigation/route-loaders';

type RoutePreloader = {
  path: string;
  preload: () => Promise<unknown>;
};

const routePreloaders: RoutePreloader[] = [
  { path: '/guias/fila', preload: loadGuias },
  { path: '/guias/enviadas', preload: loadGuias },
  { path: '/guias/excecoes', preload: loadGuias },
  { path: '/guias', preload: loadGuias },
  { path: '/empresas', preload: loadEmpresas },
  { path: '/integracoes', preload: loadIntegracoesGuias },
  { path: '/fator-r', preload: loadFatorR },
  { path: '/reforma-tributaria', preload: loadReformaTributaria },
  { path: '/classifica', preload: loadClassifica },
  { path: '/whatsapp', preload: loadWhatsAppPage },
  { path: '/configuracoes', preload: loadConfiguracoes },
  { path: '/documentos', preload: loadDocumentos },
  { path: '/envios', preload: loadEnvios },
  { path: '/alertas', preload: loadAlertas },
  { path: '/logs', preload: loadLogs },
].sort((a, b) => b.path.length - a.path.length);

const routePromises = new Map<string, Promise<unknown>>();

function isRouteMatch(pathname: string, route: string) {
  if (route === '/') return pathname === route;
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function preloadRoute(pathname: string) {
  const match = routePreloaders.find((route) => isRouteMatch(pathname, route.path));
  if (!match) return undefined;

  const cached = routePromises.get(match.path);
  if (cached) return cached;

  const promise = match.preload().catch((error) => {
    routePromises.delete(match.path);
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      console.warn('[navigation] route preload failed', match.path, error);
    }
    throw error;
  });
  routePromises.set(match.path, promise);
  return promise;
}

export function preloadInitialAppRoutes() {
  ['/guias/fila', '/empresas'].forEach((route, index) => {
    window.setTimeout(() => {
      void preloadRoute(route)?.catch(() => undefined);
    }, index * 250);
  });
}
