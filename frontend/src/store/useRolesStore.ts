/**
 * 角色 + 组织架构全局状态 store。
 * 被 AdminPage 下所有 panel（RolePanel / PermissionPanel / OrgManager）共享，
 * 避免之前 useRoles hook 各 panel 独立 useState 导致的「新建角色后其它面板看不到」问题。
 */
import { create } from 'zustand'
import {
  createRole,
  deleteRole,
  fetchOrgTree,
  fetchRoles,
  resetRolePassword,
  updateRole,
} from '../api/admin'
import type { OrgTree, RoleCreateRequest, RoleItem } from '../api/types'

interface RolesState {
  roles: RoleItem[]
  orgTree: OrgTree
  loading: boolean
  orgLoading: boolean

  /** 拉取角色列表（覆盖式写入 store）。 */
  fetchRoles: () => Promise<void>
  /** 拉取组织架构树。 */
  fetchOrgTree: () => Promise<void>

  /** 创建角色后自动 refetch。 */
  create: (payload: RoleCreateRequest) => Promise<RoleItem>
  update: (id: number, payload: RoleCreateRequest) => Promise<RoleItem>
  /** 删除角色后自动 refetch。 */
  remove: (id: number, confirmName: string) => Promise<void>
  /** 重置默认账号密码（不需 refetch）。 */
  resetPassword: (id: number) => Promise<{ username: string; message: string }>
}

export const useRolesStore = create<RolesState>((set, get) => ({
  roles: [],
  orgTree: { segments: [], tags: [] },
  loading: false,
  orgLoading: false,

  fetchRoles: async () => {
    set({ loading: true })
    try {
      set({ roles: await fetchRoles() })
    } finally {
      set({ loading: false })
    }
  },

  fetchOrgTree: async () => {
    set({ orgLoading: true })
    try {
      set({ orgTree: await fetchOrgTree() })
    } finally {
      set({ orgLoading: false })
    }
  },

  create: async (payload) => {
    const created = await createRole(payload)
    await get().fetchRoles()
    return created
  },

  update: async (id, payload) => {
    const updated = await updateRole(id, payload)
    await get().fetchRoles()
    return updated
  },

  remove: async (id, confirmName) => {
    await deleteRole(id, confirmName)
    await get().fetchRoles()
  },

  resetPassword: async (id) => {
    return resetRolePassword(id)
  },
}))