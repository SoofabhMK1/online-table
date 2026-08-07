/**
 * 模板列表数据 hook：管理 active + archived 两份模板列表，提供归档/恢复/刷新等共享操作。
 * TemplatePanel 与 ArchivedTemplatePanel 共用此 hook 以保持两侧状态一致。
 */
import { useCallback, useEffect, useState } from 'react'
import { archiveTemplate, fetchTemplates, unarchiveTemplate } from '../../../api/admin'
import type { TemplateItem } from '../../../api/types'

export function useTemplates() {
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [archivedTemplates, setArchivedTemplates] = useState<TemplateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [archivedLoading, setArchivedLoading] = useState(false)

  const reloadActive = useCallback(async () => {
    setLoading(true)
    try {
      setTemplates(await fetchTemplates(false))
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadArchived = useCallback(async () => {
    setArchivedLoading(true)
    try {
      setArchivedTemplates(await fetchTemplates(true))
    } finally {
      setArchivedLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadActive()
  }, [reloadActive])

  useEffect(() => {
    void reloadArchived()
  }, [reloadArchived])

  const archive = useCallback(
    async (id: number) => {
      await archiveTemplate(id)
      await Promise.all([reloadActive(), reloadArchived()])
    },
    [reloadActive, reloadArchived],
  )

  const unarchive = useCallback(
    async (id: number) => {
      await unarchiveTemplate(id)
      await Promise.all([reloadActive(), reloadArchived()])
    },
    [reloadActive, reloadArchived],
  )

  return {
    templates,
    archivedTemplates,
    loading,
    archivedLoading,
    reloadActive,
    reloadArchived,
    archive,
    unarchive,
  }
}