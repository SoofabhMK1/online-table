import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  userId: number | null
  username: string | null
  roleId: number | null
  roleName: string | null
  isAuthenticated: boolean
  setAuth: (payload: {
    token: string
    userId: number
    username: string
    roleId: number
    roleName: string
  }) => void
  setUsername: (username: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      username: null,
      roleId: null,
      roleName: null,
      isAuthenticated: false,
      setAuth: ({ token, userId, username, roleId, roleName }) =>
        set({ token, userId, username, roleId, roleName, isAuthenticated: true }),
      setUsername: (username) => set({ username }),
      logout: () =>
        set({
          token: null,
          userId: null,
          username: null,
          roleId: null,
          roleName: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        userId: state.userId,
        username: state.username,
        roleId: state.roleId,
        roleName: state.roleName,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)