export type UserRole = 'admin' | 'operador';

export type PermissionAction =
  | 'create_empresa'
  | 'delete_empresa'
  | 'archive_empresa'
  | 'upload_doc'
  | 'delete_doc'
  | 'send_envio'
  | 'resolve_alerta'
  | 'resolve_all_alertas'
  | 'view_logs'
  | 'view_audit'
  | 'manage_settings';

const PERMISSION_MATRIX: Record<UserRole, PermissionAction[]> = {
  admin: [
    'create_empresa', 'delete_empresa', 'archive_empresa',
    'upload_doc', 'delete_doc', 'send_envio',
    'resolve_alerta', 'resolve_all_alertas',
    'view_logs', 'view_audit', 'manage_settings',
  ],
  operador: [
    'create_empresa', 'upload_doc', 'send_envio',
    'resolve_alerta', 'view_logs',
  ],
};

// Mock: returns admin for Phase 1
export function getCurrentRole(): UserRole {
  return 'admin';
}

export function canPerform(role: UserRole, action: PermissionAction): boolean {
  return PERMISSION_MATRIX[role]?.includes(action) ?? false;
}

export function requirePermission(action: PermissionAction): boolean {
  return canPerform(getCurrentRole(), action);
}
