import { describe, expect, it } from 'vitest';
import { resolveContextualMenu, routeMatchesPath } from './contextual-menu-engine';

const counters = {
  guidesWaiting: 0,
  guideExceptions: 0,
  alerts: 0,
  legacyExceptions: 0,
};

describe('resolveContextualMenu', () => {
  it('marca Guias como ativo ao abrir o alias /guias diretamente', () => {
    const model = resolveContextualMenu({ pathname: '/guias', isMobile: false, counters });

    expect(model.activeMenuId).toBe('guias');
    expect(model.contextualChildren.map((item) => item.id)).toEqual(['guias-fila', 'guias-enviadas', 'guias-excecoes']);
  });

  it('mantem o modulo pai ativo em subrotas de Guias', () => {
    const model = resolveContextualMenu({ pathname: '/guias/enviadas', isMobile: false, counters });

    expect(model.activeMenuId).toBe('guias');
  });

  it('inclui as paginas operacionais principais no menu inteligente', () => {
    const model = resolveContextualMenu({ pathname: '/certidoes', isMobile: false, counters });

    expect(model.activeMenuId).toBe('certidoes');
    expect(model.visiblePrimary.map((item) => item.id)).toEqual(expect.arrayContaining(['envios', 'certidoes', 'automacao', 'alertas']));
  });

  it('nao trata prefixos parecidos como rota ativa', () => {
    expect(routeMatchesPath('/guias-antigas', '/guias')).toBe(false);
    expect(routeMatchesPath('/guias/fila', '/guias')).toBe(true);
  });
});
