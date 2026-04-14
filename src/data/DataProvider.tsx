import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import type { Empresa, CNDItem, Documento, Envio, Alerta, LogAcesso, AuditEntry, RegimeTributario } from '@/data/types';
import { mockEmpresas, mockCNDItems, mockDocumentos, mockEnvios, mockAlertas, mockLogs } from '@/data/mockData';
import { recalcularTodosStatus } from '@/lib/status-utils';

interface DataState {
  empresas: Empresa[];
  cnds: CNDItem[];
  documentos: Documento[];
  envios: Envio[];
  alertas: Alerta[];
  logs: LogAcesso[];
  auditTrail: AuditEntry[];
}

type DataAction =
  | { type: 'ADD_EMPRESA'; payload: Empresa }
  | { type: 'UPDATE_EMPRESA'; payload: Empresa }
  | { type: 'ADD_CND'; payload: CNDItem }
  | { type: 'UPDATE_CND'; payload: CNDItem }
  | { type: 'RECALCULATE_STATUS' }
  | { type: 'ADD_DOCUMENTO'; payload: Documento }
  | { type: 'ADD_ENVIO'; payload: Envio }
  | { type: 'ADD_LOG'; payload: LogAcesso }
  | { type: 'ADD_ALERTA'; payload: Alerta }
  | { type: 'RESOLVE_ALERTA'; payload: string }
  | { type: 'MARK_ALERTA_LIDO'; payload: string }
  | { type: 'RESOLVE_ALL_ALERTAS' }
  | { type: 'MARK_ALL_ALERTAS_LIDOS' }
  | { type: 'SET_ALERTAS'; payload: Alerta[] };

function createAuditEntry(action: string, entityType: AuditEntry['entityType'], entityId: string, details: string): AuditEntry {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    userId: 'admin',
    action,
    entityType,
    entityId,
    details,
  };
}

function dataReducer(state: DataState, action: DataAction): DataState {
  switch (action.type) {
    case 'ADD_EMPRESA': {
      const exists = state.empresas.some(e => e.cnpj.replace(/\D/g, '') === action.payload.cnpj.replace(/\D/g, ''));
      if (exists) return state;
      return {
        ...state,
        empresas: [...state.empresas, action.payload],
        auditTrail: [...state.auditTrail, createAuditEntry('create', 'empresa', action.payload.id, `Empresa ${action.payload.nomeFantasia} criada`)],
      };
    }
    case 'UPDATE_EMPRESA':
      return {
        ...state,
        empresas: state.empresas.map(e => e.id === action.payload.id ? action.payload : e),
        auditTrail: [...state.auditTrail, createAuditEntry('update', 'empresa', action.payload.id, `Empresa ${action.payload.nomeFantasia} atualizada`)],
      };
    case 'ADD_CND':
      return {
        ...state,
        cnds: [...state.cnds, action.payload],
        auditTrail: [...state.auditTrail, createAuditEntry('create', 'cnd', action.payload.id, `CND ${action.payload.tipo} adicionada`)],
      };
    case 'UPDATE_CND':
      return {
        ...state,
        cnds: state.cnds.map(c => c.id === action.payload.id ? action.payload : c),
        auditTrail: [...state.auditTrail, createAuditEntry('update', 'cnd', action.payload.id, `CND ${action.payload.tipo} atualizada`)],
      };
    case 'RECALCULATE_STATUS':
      return { ...state, cnds: recalcularTodosStatus(state.cnds) };
    case 'ADD_DOCUMENTO': {
      const dup = state.documentos.some(d => d.id === action.payload.id);
      if (dup) return state;
      return {
        ...state,
        documentos: [...state.documentos, action.payload],
        auditTrail: [...state.auditTrail, createAuditEntry('create', 'documento', action.payload.id, `Documento ${action.payload.nome} enviado`)],
      };
    }
    case 'ADD_ENVIO':
      return {
        ...state,
        envios: [...state.envios, action.payload],
        auditTrail: [...state.auditTrail, createAuditEntry('create', 'envio', action.payload.id, `Envio para ${action.payload.destinatario}`)],
      };
    case 'ADD_LOG':
      return { ...state, logs: [...state.logs, action.payload] };
    case 'ADD_ALERTA': {
      const key = `${action.payload.empresaId}-${action.payload.cndItemId}-${action.payload.tipo}`;
      const dup = state.alertas.some(a => !a.resolvido && `${a.empresaId}-${a.cndItemId}-${a.tipo}` === key);
      if (dup) return state;
      return { ...state, alertas: [...state.alertas, action.payload] };
    }
    case 'RESOLVE_ALERTA':
      return {
        ...state,
        alertas: state.alertas.map(a => a.id === action.payload ? { ...a, resolvido: true } : a),
        auditTrail: [...state.auditTrail, createAuditEntry('resolve', 'alerta', action.payload, 'Alerta resolvido')],
      };
    case 'MARK_ALERTA_LIDO':
      return { ...state, alertas: state.alertas.map(a => a.id === action.payload ? { ...a, lido: true } : a) };
    case 'RESOLVE_ALL_ALERTAS':
      return {
        ...state,
        alertas: state.alertas.map(a => a.resolvido ? a : { ...a, resolvido: true }),
        auditTrail: [...state.auditTrail, createAuditEntry('resolve_all', 'alerta', '*', 'Todos alertas resolvidos')],
      };
    case 'MARK_ALL_ALERTAS_LIDOS':
      return { ...state, alertas: state.alertas.map(a => ({ ...a, lido: true })) };
    case 'SET_ALERTAS':
      return { ...state, alertas: action.payload };
    default:
      return state;
  }
}

interface DataContextValue {
  state: DataState;
  dispatch: React.Dispatch<DataAction>;
  addEmpresa: (empresa: Empresa) => boolean;
  updateEmpresa: (empresa: Empresa) => void;
  addDocumento: (doc: Documento) => void;
  addEnvio: (envio: Envio) => void;
  addLog: (log: LogAcesso) => void;
  resolveAlerta: (id: string) => void;
  markAlertaLido: (id: string) => void;
  resolveAllAlertas: () => void;
  markAllAlertasLidos: () => void;
  cnpjExists: (cnpj: string, excludeId?: string) => boolean;
  generateChecklistForRegime: (empresaId: string, regime: RegimeTributario, responsavel: string) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

const initialState: DataState = {
  empresas: mockEmpresas,
  cnds: recalcularTodosStatus(mockCNDItems),
  documentos: mockDocumentos,
  envios: mockEnvios,
  alertas: mockAlertas,
  logs: mockLogs,
  auditTrail: [],
};

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(dataReducer, initialState);

  const cnpjExists = useCallback((cnpj: string, excludeId?: string) => {
    const normalized = cnpj.replace(/\D/g, '');
    return state.empresas.some(e => e.cnpj.replace(/\D/g, '') === normalized && e.id !== excludeId);
  }, [state.empresas]);

  const addEmpresa = useCallback((empresa: Empresa): boolean => {
    if (cnpjExists(empresa.cnpj)) return false;
    dispatch({ type: 'ADD_EMPRESA', payload: empresa });
    return true;
  }, [cnpjExists]);

  const updateEmpresa = useCallback((empresa: Empresa) => {
    dispatch({ type: 'UPDATE_EMPRESA', payload: empresa });
  }, []);

  const addDocumento = useCallback((doc: Documento) => {
    dispatch({ type: 'ADD_DOCUMENTO', payload: doc });
  }, []);

  const addEnvio = useCallback((envio: Envio) => {
    dispatch({ type: 'ADD_ENVIO', payload: envio });
  }, []);

  const addLog = useCallback((log: LogAcesso) => {
    dispatch({ type: 'ADD_LOG', payload: log });
  }, []);

  const resolveAlerta = useCallback((id: string) => {
    dispatch({ type: 'RESOLVE_ALERTA', payload: id });
  }, []);

  const markAlertaLido = useCallback((id: string) => {
    dispatch({ type: 'MARK_ALERTA_LIDO', payload: id });
  }, []);

  const resolveAllAlertas = useCallback(() => {
    dispatch({ type: 'RESOLVE_ALL_ALERTAS' });
  }, []);

  const markAllAlertasLidos = useCallback(() => {
    dispatch({ type: 'MARK_ALL_ALERTAS_LIDOS' });
  }, []);

  const generateChecklistForRegime = useCallback((empresaId: string, regime: RegimeTributario, responsavel: string) => {
    const baseTypes: Array<{ tipo: CNDItem['tipo'] }> = [
      { tipo: 'receita_federal' },
      { tipo: 'fgts' },
      { tipo: 'trabalhista' },
    ];
    if (regime !== 'mei') {
      baseTypes.push({ tipo: 'sefaz' });
      baseTypes.push({ tipo: 'municipal' });
    }
    baseTypes.forEach((bt, i) => {
      dispatch({
        type: 'ADD_CND',
        payload: {
          id: `cnd-${Date.now()}-${i}`,
          empresaId,
          tipo: bt.tipo,
          status: 'pendente',
          dataEmissao: null,
          dataVencimento: null,
          origem: '',
          arquivoId: null,
          observacao: '',
          responsavel,
          historico: [],
        },
      });
    });
  }, []);

  const value = useMemo(() => ({
    state,
    dispatch,
    addEmpresa,
    updateEmpresa,
    addDocumento,
    addEnvio,
    addLog,
    resolveAlerta,
    markAlertaLido,
    resolveAllAlertas,
    markAllAlertasLidos,
    cnpjExists,
    generateChecklistForRegime,
  }), [state, addEmpresa, updateEmpresa, addDocumento, addEnvio, addLog, resolveAlerta, markAlertaLido, resolveAllAlertas, markAllAlertasLidos, cnpjExists, generateChecklistForRegime]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDataStore() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useDataStore must be used within DataProvider');
  return ctx;
}
