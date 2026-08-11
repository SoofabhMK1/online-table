// 阶段二：模板复制 UI 端到端测试。
// 覆盖 TemplatesPage 复制 Modal：默认 copy_bindings / 不勾选 / 复制后新模板独立
import axios from 'axios'
import { Reporter, uniqueSuffix, BASE, sleep } from './e2e_helpers.mjs'

async function main() {
  const r = new Reporter('DUPLICATE')
  const ah = await r.apiLogin('admin', 'admin123')

  const browser = await r.launchBrowser()
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  // API 预置模板 + 角色 + 绑定
  const tplName = `DUP原模板${uniqueSuffix()}`
  const targetYear = 2035
  let tplId, roleId
  try {
    tplId = (await axios.post(`${BASE}/api/templates`, {
      name: tplName,
      year: 2026,
      snapshot: { sheets: { s1: { id: 's1', cellData: { 0: { 0: { v: 'A1' } } } } } },
      row_label_cols: 1,
      col_label_rows: 1,
      content_rows: 2,
      content_cols: 2,
      content_numeric: true,
    }, { headers: ah })).data.id
    roleId = (await axios.post(`${BASE}/api/admin/roles`, { name: `DUP部门${uniqueSuffix()}` }, { headers: ah })).data.id
    await axios.post(`${BASE}/api/admin/roles/${roleId}/templates`, {
      template_ids: [tplId],
    }, { headers: ah })
    r.report('API 预置原模板 + 绑定角色', true, `tpl=${tplId} role=${roleId}`)

    // ---------- 浏览器 ----------
    await r.login(page, 'admin', 'admin123')
    await r.gotoWithRetry(page, `${BASE}/admin/templates`, '.ant-table')
    // 表格加载完成
    await page.waitForFunction(
      (n) => document.body.textContent.includes(n),
      { timeout: 10000 },
      tplName,
    )
    r.report('进入模板管理，原模板展示', true)

    // ---------- 点击复制按钮 ----------
    await sleep(500)
    await page.evaluate((tplId) => {
      const row = document.querySelector(`tr[data-row-key="${tplId}"]`)
      const copyBtn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.trim() === '复制')
      copyBtn.click()
    }, tplId)
    await page.waitForSelector('.ant-modal-title', { timeout: 5000 })
    // 等待 Modal 完整渲染
    await sleep(800)
    r.report('点击复制按钮 → 复制 Modal 打开', true)

    // ---------- 默认 copy_bindings=True 复制 ----------
    // 目标年份默认是当前年+1（2027），需改为 targetYear（2035）
    // 用 keyboard ArrowUp 触发 InputNumber +1（每次聚焦后按 ArrowUp）
    const initialYear = await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
      const targetTitle = titles.find((t) => t.textContent?.includes('复制模板'))
      let container = targetTitle.parentElement
      while (container && !container.querySelector('.ant-modal-footer') && container !== document.body) {
        container = container.parentElement
      }
      const inp = container.querySelector('input.ant-input-number-input')
      return inp?.value
    })
    console.log('初始年份:', initialYear)
    const baseYear = parseInt(initialYear)
    if (isNaN(baseYear)) throw new Error('无法读取初始年份')
    const clicksNeeded = targetYear - baseYear
    if (clicksNeeded < 0) throw new Error(`targetYear (${targetYear}) < 初始年份 (${baseYear})，无法用上箭头达到`)
    // 先点击 input 聚焦
    await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
      const targetTitle = titles.find((t) => t.textContent?.includes('复制模板'))
      let container = targetTitle.parentElement
      while (container && !container.querySelector('.ant-modal-footer') && container !== document.body) {
        container = container.parentElement
      }
      const inp = container.querySelector('input.ant-input-number-input')
      inp.focus()
    })
    for (let i = 0; i < clicksNeeded; i++) {
      await page.keyboard.press('ArrowUp')
      await sleep(50)
    }
    await sleep(300)
    const yearVal = await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
      const targetTitle = titles.find((t) => t.textContent?.includes('复制模板'))
      let container = targetTitle.parentElement
      while (container && !container.querySelector('.ant-modal-footer') && container !== document.body) {
        container = container.parentElement
      }
      const inp = container.querySelector('input.ant-input-number-input')
      return inp?.value
    })
    console.log('Year input value:', yearVal)
    if (yearVal !== String(targetYear)) {
      throw new Error(`InputNumber 未正确设置为 ${targetYear}，实际 ${yearVal}`)
    }
    // 确认 checkbox 默认勾选
    const checkboxChecked = await page.evaluate(() => {
      const cbs = document.querySelectorAll('.ant-modal .ant-checkbox-input')
      return cbs[0]?.checked
    })
    if (!checkboxChecked) throw new Error('默认 copy_bindings 应为 true')
    r.report('复制 Modal 默认 copy_bindings=True', true)

    // 点复制（用所有 modal 类名搜索）
    const copyBtnInfo = await page.evaluate(() => {
      // 找包含「复制模板」title 的容器
      const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
      const targetTitle = titles.find((t) => t.textContent?.includes('复制模板'))
      if (!targetTitle) return { ok: false, reason: 'no 复制 modal title' }
      // 向上找包含 footer 的容器
      let container = targetTitle.parentElement
      while (container && !container.querySelector('.ant-modal-footer') && container !== document.body) {
        container = container.parentElement
      }
      if (!container || container === document.body) {
        return { ok: false, reason: 'no modal container with footer' }
      }
      const okBtn = Array.from(container.querySelectorAll('.ant-modal-footer button'))
        .find((b) => b.textContent?.replace(/\s+/g, '') === '复制')
      if (!okBtn) return { ok: false, reason: 'no 复制 btn' }
      okBtn.click()
      return { ok: true }
    })
    console.log('复制按钮点击:', JSON.stringify(copyBtnInfo))
    // 等「复制模板」Modal 真正关闭（display:none）
    try {
      await page.waitForFunction(
        () => {
          const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
          return !titles.some((t) => {
            if (!t.textContent?.includes('复制模板')) return false
            const wrapper = t.closest('.ant-modal-wrap, .ant-modal')
            return wrapper && getComputedStyle(wrapper).display !== 'none'
          })
        },
        { timeout: 10000 },
      )
    } catch (e) {
      const debug = await page.evaluate(() => {
        const titles = Array.from(document.querySelectorAll('.ant-modal-title')).map(t => {
          const wrap = t.closest('.ant-modal-wrap, .ant-modal')
          return { text: t.textContent, display: wrap ? getComputedStyle(wrap).display : 'no-wrap' }
        })
        return { titles }
      })
      console.log('Modal 关闭调试:', JSON.stringify(debug))
      throw e
    }
    r.report('UI 复制（默认 copy_bindings）成功 → Modal 关闭', true)

    // 验证 API：新年份模板存在 + 绑定已复制（给 fetchActive 一点时间）
    await sleep(1500)
    const dupName = `${tplName} (${targetYear})`
    const tplsAfter = (await axios.get(`${BASE}/api/templates`, { headers: ah })).data
    const newTpl = tplsAfter.find((t) => t.name === dupName)
    if (!newTpl) {
      const allNames = tplsAfter.map(t => `${t.id}:${t.name}`).join(', ')
      throw new Error(`新模板未创建（API 返回 ${tplsAfter.length} 模板: ${allNames}）`)
    }
    if (newTpl.year !== targetYear) throw new Error(`年份不对：${newTpl.year}`)
    if (newTpl.content_numeric !== true) throw new Error('content_numeric 未复制')
    const bindings = (await axios.get(`${BASE}/api/admin/roles/${roleId}/templates`, { headers: ah })).data
    if (!bindings.includes(newTpl.id)) throw new Error('绑定未复制')
    r.report('复制 → API 持久化（绑定已复制）', true, `new_tpl=${newTpl.id}`)

    // ---------- 不勾选 copy_bindings 复制 ----------
    const dupName2 = `${tplName} (${targetYear + 1})`
    await sleep(800)
    await page.evaluate((tplId) => {
      const row = document.querySelector(`tr[data-row-key="${tplId}"]`)
      const copyBtn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.trim() === '复制')
      copyBtn.click()
    }, tplId)
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.ant-modal-title')).some(
        (t) => t.textContent?.includes('复制模板')
      ),
      { timeout: 5000 },
    )
    await sleep(800)
    // 改年份 + 取消勾选
    const initialYear2 = await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
      const targetTitle = titles.find((t) => t.textContent?.includes('复制模板'))
      let container = targetTitle.parentElement
      while (container && !container.querySelector('.ant-modal-footer') && container !== document.body) {
        container = container.parentElement
      }
      return container.querySelector('input.ant-input-number-input')?.value
    })
    const baseYear2 = parseInt(initialYear2)
    const targetYear2 = targetYear + 1
    const clicksNeeded2 = targetYear2 - baseYear2
    await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
      const targetTitle = titles.find((t) => t.textContent?.includes('复制模板'))
      let container = targetTitle.parentElement
      while (container && !container.querySelector('.ant-modal-footer') && container !== document.body) {
        container = container.parentElement
      }
      const inp = container.querySelector('input.ant-input-number-input')
      inp.focus()
    })
    for (let i = 0; i < clicksNeeded2; i++) {
      await page.keyboard.press('ArrowUp')
      await sleep(50)
    }
    await sleep(300)
    await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
      const targetTitle = titles.find((t) => t.textContent?.includes('复制模板'))
      let container = targetTitle.parentElement
      while (container && !container.querySelector('.ant-modal-footer') && container !== document.body) {
        container = container.parentElement
      }
      const cb = container.querySelector('.ant-checkbox-wrapper')
      if (cb) cb.click()
    })
    await sleep(500)
    await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
      const targetTitle = titles.find((t) => t.textContent?.includes('复制模板'))
      let container = targetTitle.parentElement
      while (container && !container.querySelector('.ant-modal-footer') && container !== document.body) {
        container = container.parentElement
      }
      const okBtn = Array.from(container.querySelectorAll('.ant-modal-footer button'))
        .find((b) => b.textContent?.replace(/\s+/g, '') === '复制')
      if (okBtn) okBtn.click()
    })
    try {
      await page.waitForFunction(
        () => {
          const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
          return !titles.some((t) => {
            if (!t.textContent?.includes('复制模板')) return false
            const wrapper = t.closest('.ant-modal-wrap, .ant-modal')
            return wrapper && getComputedStyle(wrapper).display !== 'none'
          })
        },
        { timeout: 10000 },
      )
    } catch (e) {
      const debug = await page.evaluate(() => ({
        titles: Array.from(document.querySelectorAll('.ant-modal-title')).map(t => t.textContent),
      }))
      console.log('第二次 Modal 关闭调试:', JSON.stringify(debug))
      throw e
    }
    // 验证：新模板未绑定到原角色
    const newTpl2 = (await axios.get(`${BASE}/api/templates`, { headers: ah })).data
      .find((t) => t.name === dupName2)
    if (!newTpl2) throw new Error('第二次复制模板未创建')
    const bindings2 = (await axios.get(`${BASE}/api/admin/roles/${roleId}/templates`, { headers: ah })).data
    if (bindings2.includes(newTpl2.id)) {
      throw new Error('不勾选 copy_bindings 时仍复制了绑定')
    }
    // 原模板仍在绑定中
    if (!bindings2.includes(tplId)) throw new Error('原模板绑定丢失')
    r.report('复制（不勾选 copy_bindings）→ 仅复制模板不复制绑定', true)

    if (pageErrors.length > 0) console.log('JS 错误:', pageErrors)
    r.report('无未捕获 JS 异常', pageErrors.length === 0)
  } finally {
    // 清理：尝试删除新模板 + 角色
    try {
      const tpls = (await axios.get(`${BASE}/api/templates`, { headers: ah })).data
      for (const t of tpls) {
        if (t.name.startsWith('DUP原模板')) {
          // 没有 DELETE 路由，只能 archive
          await axios.post(`${BASE}/api/templates/${t.id}/archive`, {}, { headers: ah }).catch(() => {})
        }
      }
    } catch {}
    try { await axios.delete(`${BASE}/api/admin/roles/${roleId}`, { headers: ah, data: { confirm_name: '' } }).catch(() => {}) } catch {}
    await browser.close()
  }

  r.finalize()
}

main().catch((e) => {
  console.error('E2E FAILED:', e.message, e.stack)
  process.exit(1)
})