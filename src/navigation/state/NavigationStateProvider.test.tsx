import { useEffect, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NavigationStateProvider, useNavigationUiState } from './NavigationStateProvider';

function StabilityProbe() {
  const { closeAllPanels, hoveredMenuId, setHoveredMenuId } = useNavigationUiState();
  const [effectRuns, setEffectRuns] = useState(0);

  useEffect(() => {
    setEffectRuns((current) => current + 1);
  }, [closeAllPanels]);

  return (
    <div>
      <output aria-label="effect-runs">{effectRuns}</output>
      <output aria-label="hovered-menu">{hoveredMenuId ?? 'none'}</output>
      <button type="button" onClick={() => setHoveredMenuId('empresas')}>
        Hover empresas
      </button>
    </div>
  );
}

describe('NavigationStateProvider', () => {
  it('keeps closeAllPanels stable when transient menu state changes', async () => {
    render(
      <NavigationStateProvider>
        <StabilityProbe />
      </NavigationStateProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('effect-runs')).toHaveTextContent('1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Hover empresas' }));

    expect(screen.getByLabelText('hovered-menu')).toHaveTextContent('empresas');
    expect(screen.getByLabelText('effect-runs')).toHaveTextContent('1');
  });
});
