/**
 * 角色管理 hook：维护角色列表与组织架构树，提供 CRUD / 重置密码等共享操作。
 * RolePanel 与 PermissionPanel 共用此 hook 以保持选中角色与列表一致。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  createRole,
  deleteRole,
  fetchOrgTree,
  fetchRoles,
  resetRolePassword,
  updateRole,
} from '../../../api/admin'
import type { OrgTree, RoleCreateRequest, RoleItem } from '../../../api/types'

export function useRoles() {
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [orgTree, setOrgTree] = useState<OrgTree>({ segments: [], tags: [] })
  const [loading, setLoading] = useState(false)
  const [orgLoading, setOrgLoading] = useState(false)

  const reloadRoles = useCallback(async () => {
    setLoading(true)
    try {
      setRoles(await fetchRoles())
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadOrgTree = useCallback(async () => {
    setOrgLoading(true)
    try {
      setOrgTree(await fetchOrgTree())
    } finally {
      setOrgLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadRoles()
  }, [reloadRoles])

  const create = useCallback(
    async (payload: RoleCreateRequest) => {
      await createRole(payload)
      await reloadRoles()
    },
    [reloadRoles],
  )

  const update = useCallback(
    async (id: number, payload: RoleCreateRequest) => {
      await updateRole(id, payload)
      await reloadRoles()
    },
    [reloadRoles],
  )

  const remove = useCallback(
    async (id: number, confirmName: string) => {
      await deleteRole(id, confirmName)
      await reloadRoles()
    },
    [reloadRoles],
  )

  const resetPassword = useCallback(async (id: number) => {
    return resetRolePassword(id)
  }, [])

  return {
    roles,
    orgTree,
    loading,
    orgLoading,
    reloadRoles,
    reloadOrgTree,
    create,
    update,
    remove,
    resetPassword,
  }
}