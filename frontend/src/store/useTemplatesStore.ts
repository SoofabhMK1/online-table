/**
 * 模板（active + archived）全局状态 store。
 * 被 TemplatePanel / ArchivedTemplatePanel / PermissionPanel 共用，
 * 解决之前 useTemplates hook 各 panel 独立 state 导致的「新建模板后其它面板看不到」问题。
 */
import { create } from 'zustand'
import { archiveTemplate, fetchTemplates, unarchiveTemplate } from '../api/admin'
import type { TemplateItem } from '../api/types'

interface TemplatesState {
  templates: TemplateItem[]
  archivedTemplates: TemplateItem[]
  loading: boolean
  archivedLoading: boolean

  /** 拉取未归档模板。 */
  fetchActive: () => Promise<void>
  /** 拉取已归档模板。 */
  fetchArchived: () => Promise<void>
  /** 拉取两份（用于初始化）。 */
  fetchAll: () => Promise<void>

  /** 归档：调用 API + 双列表 refetch。 */
  archive: (id: number) => Promise<void>
  /** 恢复：调用 API + 双列表 refetch。 */
  unarchive: (id: number) => Promise<void>
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  templates: [],
  archivedTemplates: [],
  loading: false,
  archivedLoading: false,

  fetchActive: async () => {
    set({ loading: true })
    try {
      set({ templates: await fetchTemplates(false) })
    } finally {
      set({ loading: false })
    }
  },

  fetchArchived: async () => {
    set({ archivedLoading: true })
    try {
      set({ archivedTemplates: await fetchTemplates(true) })
    } finally {
      set({ archivedLoading: false })
    }
  },

  fetchAll: async () => {
    await Promise.all([get().fetchActive(), get().fetchArchived()])
  },

  archive: async (id) => {
    await archiveTemplate(id)
    await get().fetchAll()
  },

  unarchive: async (id) => {
    await unarchiveTemplate(id)
    await get().fetchAll()
  },
}))