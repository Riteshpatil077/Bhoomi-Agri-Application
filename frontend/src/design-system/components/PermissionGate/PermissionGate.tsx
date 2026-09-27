import React from "react";

// ============================================================================
// CRITICAL ARCHITECTURAL NOTICE:
//
// IMPORTANT: PermissionGate is a convenience display layer only, NOT a security boundary.
// It conditionally hides or disables UI elements to improve user experience.
//
// ALL authorization, access control, and ownership checks MUST be strictly
// enforced on the backend via @platform_role_required, @permission_required,
// and database ownership queries. Never rely on frontend gates for security.
// ============================================================================

export interface PermissionGateProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Required permission code (e.g. 'crops.manage', 'verification.review') */
  permission?: string;
  /** Single required platform role (e.g. 'admin', 'super_admin') */
  role?: string;
  /** Allowed platform roles list */
  allowedRoles?: string[];
  /** Current user's platform role */
  userRole?: string;
  /** Current user's granted permissions */
  userPermissions?: string[];
  /** Direct boolean override condition */
  condition?: boolean;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  children,
  fallback = null,
  permission,
  role,
  allowedRoles,
  userRole,
  userPermissions = [],
  condition,
}) => {
  // If direct boolean condition is supplied, it takes priority
  if (condition !== undefined) {
    return condition ? <>{children}</> : <>{fallback}</>;
  }

  // Check specific role
  if (role && userRole !== role) {
    return <>{fallback}</>;
  }

  // Check allowed roles array
  if (allowedRoles && (!userRole || !allowedRoles.includes(userRole))) {
    return <>{fallback}</>;
  }

  // Check permission code
  if (permission && !userPermissions.includes(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
