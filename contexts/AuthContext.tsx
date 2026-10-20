// Powered by OnSpace.AI
// Global auth state backed by Supabase. Provider only (consumed via hooks/useAuth).
import React, { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as authService from '@/services/authService';
import type { AuthResult, RegistrationCharge } from '@/services/authService';
import type { CardInput, User } from '@/services/types';
import { registerForPushNotifications, unregisterPushToken } from '@/services/notificationsService';

type RegisterParams = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
};

type AuthContextType = {
  user: User | null;
  initializing: boolean;
  completeRegistration: (params: RegisterParams) => Promise<AuthResult>;
  chargeRegistrationFee: (card?: CardInput) => Promise<RegistrationCharge>;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  // Cached so logout() can unregister this device's token best-effort.
  const pushTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    authService.getCurrentUser().then((current) => {
      if (!mounted) return;
      setUser(current);
      setInitializing(false);
      // App boot with a restored session — register this device for push.
      if (current) {
        registerForPushNotifications(current.id).then((token) => {
          if (mounted) pushTokenRef.current = token;
        });
      }
    });

    // Keep state in sync with session changes (login, logout, token refresh).
    const unsubscribe = authService.subscribeToAuth((next) => {
      if (mounted) setUser(next);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const completeRegistration = useCallback(async (params: RegisterParams) => {
    const result = await authService.completeRegistration(params);
    if (result.success) {
      setUser(result.user);
      registerForPushNotifications(result.user.id).then((token) => {
        pushTokenRef.current = token;
      });
    }
    return result;
  }, []);

  const chargeRegistrationFee = useCallback(
    async (card?: CardInput) => {
      if (!user) return { success: false as const, error: 'Not signed in.' };
      return authService.chargeRegistrationFee({ user, card });
    },
    [user],
  );

  const login = useCallback(async (email: string, password: string) => {
    const result = await authService.login(email, password);
    if (result.success) {
      setUser(result.user);
      registerForPushNotifications(result.user.id).then((token) => {
        pushTokenRef.current = token;
      });
    }
    return result;
  }, []);

  const logout = useCallback(async () => {
    const signedOutUser = user;
    const token = pushTokenRef.current;
    if (signedOutUser && token) {
      unregisterPushToken(signedOutUser.id, token).catch(() => {});
    }
    pushTokenRef.current = null;
    await authService.logout();
    setUser(null);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{ user, initializing, completeRegistration, chargeRegistrationFee, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
