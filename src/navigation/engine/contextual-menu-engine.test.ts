import { describe, expect, it } from 'vitest';
import { resolveContextualMenu, routeMatchesPath } from './contextual-menu-engine';

const counters = {
  guidesWaiting: 0,
  guideExceptions: 0,
  alerts: 0,
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

  it('inclui as paginas operacionais restantes no menu inteligente', () => {
    const model = resolveContextualMenu({ pathname: '/envios', isMobile: false, counters });

    expect(model.activeMenuId).toBe('envios');
    expect(model.visiblePrimary.map((item) => item.id)).toEqual(expect.arrayContaining(['envios', 'alertas', 'whatsapp']));
  });

  it('nao trata prefixos parecidos como rota ativa', () => {
    expect(routeMatchesPath('/guias-antigas', '/guias')).toBe(false);
    expect(routeMatchesPath('/guias/fila', '/guias')).toBe(true);
  });
});
