import type { ComponentType } from 'react';

type RouteModule<T = ComponentType<unknown>> = { default: T };
type RouteImport<T = ComponentType<unknown>> = () => Promise<RouteModule<T>>;

function cachedImport<T = ComponentType<unknown>>(factory: RouteImport<T>): RouteImport<T> {
  let promise: Promise<RouteModule<T>> | undefined;

  return () => {
    if (!promise) {
      promise = factory().catch((error) => {
        promise = undefined;
        throw error;
      });
    }

    return promise;
  };
}

export const loadEmpresas = cachedImport(() => import('@/pages/Empresas'));
export const loadEmpresaDetalhe = cachedImport(() => import('@/pages/EmpresaDetalhe'));
export const loadDocumentos = cachedImport(() => import('@/pages/Documentos'));
export const loadEnvios = cachedImport(() => import('@/pages/Envios'));
export const loadAlertas = cachedImport(() => import('@/pages/Alertas'));
export const loadLogs = cachedImport(() => import('@/pages/Logs'));
export const loadConfiguracoes = cachedImport(() => import('@/pages/Configuracoes'));
export const loadFatorR = cachedImport(() => import('@/pages/FatorR'));
export const loadReformaTributaria = cachedImport(() => import('@/pages/ReformaTributaria'));
export const loadClassifica = cachedImport(() => import('@/pages/Classifica'));
export const loadGuias = cachedImport(() => import('@/pages/guias/Guias'));
export const loadGuiaDetalhe = cachedImport(() => import('@/pages/guias/GuiaDetalhe'));
export const loadIntegracoesGuias = cachedImport(() => import('@/pages/guias/IntegracoesGuias'));
export const loadRevisaoManual = cachedImport(() => import('@/pages/guias/RevisaoManual'));
export const loadNotFound = cachedImport(() => import('@/pages/NotFound'));
export const loadWhatsAppPage = cachedImport(() => import('@/pages/admin/WhatsApp'));
