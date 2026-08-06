import type { ILocales, LocaleType } from '@univerjs/core'
import designZhCN from '@univerjs/design/locale/zh-CN'
import docsUiZhCN from '@univerjs/docs-ui/locale/zh-CN'
import sheetsZhCN from '@univerjs/sheets/locale/zh-CN'
import sheetsFormulaZhCN from '@univerjs/sheets-formula/locale/zh-CN'
import sheetsFormulaUiZhCN from '@univerjs/sheets-formula-ui/locale/zh-CN'
import sheetsNumfmtUiZhCN from '@univerjs/sheets-numfmt-ui/locale/zh-CN'
import sheetsUiZhCN from '@univerjs/sheets-ui/locale/zh-CN'
import uiZhCN from '@univerjs/ui/locale/zh-CN'

/**
 * 聚合 UniverSheetsCorePreset 所包含插件的简体中文语言包。
 */
export function buildLocales(locale: LocaleType): ILocales {
  return {
    [locale]: {
      ...designZhCN,
      ...uiZhCN,
      ...docsUiZhCN,
      ...sheetsZhCN,
      ...sheetsUiZhCN,
      ...sheetsFormulaZhCN,
      ...sheetsFormulaUiZhCN,
      ...sheetsNumfmtUiZhCN,
    },
  }
}