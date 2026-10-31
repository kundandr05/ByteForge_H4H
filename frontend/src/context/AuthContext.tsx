import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type UserRole = 'admin' | 'technician' | 'user';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  technicianId?: string;
  phone?: string;
  skills?: string[];
  serviceZones?: string[];
  isFirstTime?: boolean;
}

interface AuthContextType {
  user: AuthUser;
  role: UserRole;
  isAuthenticated: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  updateUser: (partial: Partial<AuthUser>) => void;
  switchRole: (role: UserRole) => void;
}

const DEFAULT_ADMIN: AuthUser = {
  id: 'admin-1',
  name: 'Operations Dispatcher',
  email: 'dispatcher@dispatchgrid.internal',
  role: 'admin',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'dispatch_auth_user_v1';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return DEFAULT_ADMIN;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch {
      // ignore
    }
  }, [user]);

  const login = (newUser: AuthUser) => {
    setUser(newUser);
  };

  const logout = () => {
    setUser(DEFAULT_ADMIN);
  };

  const updateUser = (partial: Partial<AuthUser>) => {
    setUser((prev) => ({ ...prev, ...partial }));
  };

  const switchRole = (newRole: UserRole) => {
    if (newRole === 'admin') {
      setUser(DEFAULT_ADMIN);
    } else if (newRole === 'user') {
      setUser({
        id: 'client-sarah',
        name: 'Sarah Jenkins',
        email: 'sarah.jenkins@example.com',
        role: 'user',
        phone: '+1 (555) 382-9901',
      });
    } else if (newRole === 'technician') {
      setUser({
        id: 'tech-demo',
        name: 'Carlos Mendez',
        email: 'carlos.mendez@dispatchgrid.internal',
        role: 'technician',
        phone: '+1 (555) 781-4420',
        skills: ['HVAC', 'ELECTRICAL'],
        serviceZones: ['ZONE_NORTH', 'ZONE_EAST'],
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user.role,
        isAuthenticated: !!user,
        login,
        logout,
        updateUser,
        switchRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

const DEFAULT_AUTH_CONTEXT: AuthContextType = {
  user: DEFAULT_ADMIN,
  role: 'admin',
  isAuthenticated: true,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
  switchRole: () => {},
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    return DEFAULT_AUTH_CONTEXT;
  }
  return context;
};

export default AuthContext;
