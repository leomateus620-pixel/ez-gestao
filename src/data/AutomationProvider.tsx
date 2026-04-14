import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import type {
  AutomationState, ConnectorRun, ExceptionItem, AutomationBatch,
  IntegrationHealthLog, Connector,
} from './automation-types';
import {
  mockConnectors, mockRuns, mockExceptions, mockBatches,
  mockHealthLogs, mockRetryPolicies, mockSchedulingRules,
} from './automationMockData';

type AutomationAction =
  | { type: 'ADD_RUN'; payload: ConnectorRun }
  | { type: 'UPDATE_RUN'; payload: ConnectorRun }
  | { type: 'ADD_EXCEPTION'; payload: ExceptionItem }
  | { type: 'RESOLVE_EXCEPTION'; payload: { id: string; resolvidoPor: string } }
  | { type: 'REQUEUE_EXCEPTION'; payload: string }
  | { type: 'DISCARD_EXCEPTION'; payload: string }
  | { type: 'UPDATE_CONNECTOR_STATUS'; payload: { id: string; status: Connector['status'] } }
  | { type: 'ADD_BATCH'; payload: AutomationBatch }
  | { type: 'UPDATE_BATCH'; payload: AutomationBatch }
  | { type: 'ADD_HEALTH_LOG'; payload: IntegrationHealthLog };

function automationReducer(state: AutomationState, action: AutomationAction): AutomationState {
  switch (action.type) {
    case 'ADD_RUN':
      return { ...state, runs: [action.payload, ...state.runs] };
    case 'UPDATE_RUN':
      return { ...state, runs: state.runs.map(r => r.id === action.payload.id ? action.payload : r) };
    case 'ADD_EXCEPTION':
      return { ...state, exceptions: [action.payload, ...state.exceptions] };
    case 'RESOLVE_EXCEPTION':
      return {
        ...state,
        exceptions: state.exceptions.map(e =>
          e.id === action.payload.id
            ? { ...e, statusExcecao: 'resolvida' as const, resolvidoEm: new Date().toISOString(), resolvidoPor: action.payload.resolvidoPor }
            : e
        ),
      };
    case 'REQUEUE_EXCEPTION':
      return {
        ...state,
        exceptions: state.exceptions.map(e =>
          e.id === action.payload ? { ...e, statusExcecao: 'pendente' as const } : e
        ),
      };
    case 'DISCARD_EXCEPTION':
      return {
        ...state,
        exceptions: state.exceptions.map(e =>
          e.id === action.payload ? { ...e, statusExcecao: 'descartada' as const } : e
        ),
      };
    case 'UPDATE_CONNECTOR_STATUS':
      return {
        ...state,
        connectors: state.connectors.map(c =>
          c.id === action.payload.id ? { ...c, status: action.payload.status } : c
        ),
      };
    case 'ADD_BATCH':
      return { ...state, batches: [action.payload, ...state.batches] };
    case 'UPDATE_BATCH':
      return { ...state, batches: state.batches.map(b => b.id === action.payload.id ? action.payload : b) };
    case 'ADD_HEALTH_LOG':
      return { ...state, healthLogs: [action.payload, ...state.healthLogs] };
    default:
      return state;
  }
}

interface AutomationContextValue {
  state: AutomationState;
  dispatch: React.Dispatch<AutomationAction>;
  addRun: (run: ConnectorRun) => void;
  updateRun: (run: ConnectorRun) => void;
  addException: (exc: ExceptionItem) => void;
  resolveException: (id: string, user: string) => void;
  requeueException: (id: string) => void;
  discardException: (id: string) => void;
  pendingExceptions: number;
}

const AutomationContext = createContext<AutomationContextValue | null>(null);

const initialState: AutomationState = {
  connectors: mockConnectors,
  runs: mockRuns,
  exceptions: mockExceptions,
  batches: mockBatches,
  healthLogs: mockHealthLogs,
  schedulingRules: mockSchedulingRules,
  retryPolicies: mockRetryPolicies,
};

export function AutomationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(automationReducer, initialState);

  const addRun = useCallback((run: ConnectorRun) => dispatch({ type: 'ADD_RUN', payload: run }), []);
  const updateRun = useCallback((run: ConnectorRun) => dispatch({ type: 'UPDATE_RUN', payload: run }), []);
  const addException = useCallback((exc: ExceptionItem) => dispatch({ type: 'ADD_EXCEPTION', payload: exc }), []);
  const resolveException = useCallback((id: string, user: string) => dispatch({ type: 'RESOLVE_EXCEPTION', payload: { id, resolvidoPor: user } }), []);
  const requeueException = useCallback((id: string) => dispatch({ type: 'REQUEUE_EXCEPTION', payload: id }), []);
  const discardException = useCallback((id: string) => dispatch({ type: 'DISCARD_EXCEPTION', payload: id }), []);

  const pendingExceptions = useMemo(() =>
    state.exceptions.filter(e => e.statusExcecao === 'pendente' || e.statusExcecao === 'em_analise').length
  , [state.exceptions]);

  const value = useMemo(() => ({
    state, dispatch, addRun, updateRun, addException, resolveException, requeueException, discardException, pendingExceptions,
  }), [state, addRun, updateRun, addException, resolveException, requeueException, discardException, pendingExceptions]);

  return <AutomationContext.Provider value={value}>{children}</AutomationContext.Provider>;
}

export function useAutomation() {
  const ctx = useContext(AutomationContext);
  if (!ctx) throw new Error('useAutomation must be used within AutomationProvider');
  return ctx;
}
