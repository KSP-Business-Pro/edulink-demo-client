// src/hooks/usePermissions.ts
// Hook React pour accéder aux permissions de l'utilisateur connecté

import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { getPermissions, can, getVisibleModules } from '../services/permissions';
import type { Permissions } from '../services/permissions';
import type { UserRole } from '../types/auth.types';

export function usePermissions() {
  const { user } = useAuth();
  const role = (user?.role ?? 'anon') as UserRole;

  const permissions = useMemo(() => getPermissions(role), [role]);
  const visibleModules = useMemo(() => getVisibleModules(role), [role]);

  return {
    permissions,
    visibleModules,
    can: (action: keyof Permissions) => can(role, action),
    role,
  };
}
