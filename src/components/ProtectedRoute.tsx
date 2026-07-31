import { Navigate, useLocation } from 'react-router-dom';
import { ROLE } from '../constants/status';

type UserRole = typeof ROLE[keyof typeof ROLE];

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

/**
 * ProtectedRoute component that checks JWT authentication and optional role-based access.
 * Redirects to /login if not authenticated, or to /dashboard if role doesn't match.
 */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const location = useLocation();

  // Check for JWT token in localStorage
  const token = localStorage.getItem('PMS_auth_token');
  
  // Get user role from localStorage (stored in PMS_user)
  const userStr = localStorage.getItem('PMS_user');
  let userRole: UserRole | undefined;
  
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      userRole = user.Role || user.role;
    } catch (e) {
      console.error('Failed to parse user from localStorage:', e);
    }
  }

  // Redirect to login if no token
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role-based access if allowedRoles are specified
  if (allowedRoles && allowedRoles.length > 0) {
    if (!userRole || !allowedRoles.includes(userRole as UserRole)) {
      // Redirect to dashboard if user doesn't have required role
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}
