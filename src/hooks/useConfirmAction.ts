import { useState, useCallback } from 'react';

interface ConfirmState {
  isOpen: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
}

export function useConfirmAction() {
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const requestConfirm = useCallback((title: string, description: string, onConfirm: () => void) => {
    setConfirmState({ isOpen: true, title, description, onConfirm });
  }, []);

  const confirm = useCallback(() => {
    confirmState.onConfirm();
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  }, [confirmState]);

  const cancel = useCallback(() => {
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return { ...confirmState, requestConfirm, confirm, cancel };
}
