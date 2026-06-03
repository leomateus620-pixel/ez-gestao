import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type TopbarPanel = 'search' | 'notifications' | 'profile';

interface NavigationUiState {
  hoveredMenuId?: string;
  activeTopbarPanel?: TopbarPanel;
  isDesktop: boolean;
  setHoveredMenuId: (value?: string) => void;
  setActiveTopbarPanel: (value?: TopbarPanel) => void;
  closeAllPanels: () => void;
}

const NavigationStateContext = createContext<NavigationUiState | null>(null);

export function NavigationStateProvider({ children }: { children: React.ReactNode }) {
  const [hoveredMenuId, setHoveredMenuId] = useState<string>();
  const [activeTopbarPanel, setActiveTopbarPanel] = useState<TopbarPanel>();

  const closeAllPanels = useCallback(() => {
    setHoveredMenuId(undefined);
    setActiveTopbarPanel(undefined);
  }, []);

  const value = useMemo(
    () => ({
      hoveredMenuId,
      activeTopbarPanel,
      isDesktop: true,
      setHoveredMenuId,
      setActiveTopbarPanel,
      closeAllPanels,
    }),
    [hoveredMenuId, activeTopbarPanel, closeAllPanels],
  );

  return <NavigationStateContext.Provider value={value}>{children}</NavigationStateContext.Provider>;
}

export function useNavigationUiState() {
  const ctx = useContext(NavigationStateContext);
  if (!ctx) throw new Error('useNavigationUiState must be used within NavigationStateProvider');
  return ctx;
}
