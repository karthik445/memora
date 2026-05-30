import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { AuthUser } from '@/types/api'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  tenantId: string | null
  isAuthenticated: boolean
  isHydrated: boolean
}

interface AuthActions {
  setAuth: (user: AuthUser, accessToken: string, tenantId: string) => void
  setAccessToken: (token: string) => void
  clearAuth: () => void
  setHydrated: () => void
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  tenantId: null,
  isAuthenticated: false,
  isHydrated: false,
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    immer((set) => ({
      ...initialState,

      setAuth: (user, accessToken, tenantId) =>
        set(state => {
          state.user = user
          state.accessToken = accessToken
          state.tenantId = tenantId
          state.isAuthenticated = true
        }),

      setAccessToken: (token) =>
        set(state => { state.accessToken = token }),

      clearAuth: () =>
        set(state => {
          state.user = null
          state.accessToken = null
          state.tenantId = null
          state.isAuthenticated = false
        }),

      setHydrated: () =>
        set(state => { state.isHydrated = true }),
    })),
    {
      name: 'memora-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        tenantId: state.tenantId,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated()
      },
    },
  ),
)
