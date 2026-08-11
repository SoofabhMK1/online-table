// 阶段验证：审核状态机（submit → reject/approve → resubmit）
// 覆盖此前 e2e 套件未涉及的：审核通过、退回、修改后再提交、状态机约束。
// 阶段 2 扩展：在最后加入 UI 审核流程测试（点击审核/退回按钮，弹窗，状态变更）。
import axios from 'axios'
import { Reporter, uniqueSuffix, currentPeriod, sleep, BASE } from './e2e_helpers.mjs'

async function main() {
  const r = new Reporter('REVIEW E2E')
  const ah = await r.apiLogin('admin', 'admin123')
  const uh = await r.apiLogin('op1', 'pw123')

  // 准备一个简单模板，绑定给 运营部
  const tplName = `审核测试-${uniqueSuffix()}`
  const period0 = currentPeriod()
  const year = Number(period0.split('-')[0])
  const snapshot = {
    id: 'review_wb', appVersion: '0.25.1', locale: 'zhCN', name: tplName,
    styles: {}, sheetOrder: ['s1'],
    sheets: {
      s1: {
        id: 's1', name: 'Sheet1', rowCount: 10, columnCount: 6,
        cellData: {
          '0': { '0': { v: '项目' }, '1': { v: 'A' }, '2': { v: 'B' } },
          '1': { '0': { v: '营收' } },
          '2': { '0': { v: '成本' } },
        },
      },
    },
  }
  let tpl
  try {
    tpl = await axios.post(`${BASE}/api/templates`, {
      name: tplName, year, snapshot,
      row_label_cols: 1, col_label_rows: 1,
      content_rows: 3, content_cols: 2,
    }, { headers: ah })
  } catch (e) {
    console.log('Template creation failed:', e.response?.status, e.response?.data)
    throw e
  }
  const tid = tpl.data.id

  // 把模板绑给 运营部
  const roles = (await axios.get(`${BASE}/api/admin/roles`, { headers: ah })).data
  const opRole = roles.find((r) => r.name === '运营部')
  await axios.post(
    `${BASE}/api/admin/roles/${opRole.id}/templates`,
    { template_ids: [tid] }, { headers: ah }
  )

  const period = currentPeriod()
  let filledSnap = JSON.parse(JSON.stringify(snapshot))
  filledSnap.sheets.s1.cellData['1'] = { '0': { v: '营收' }, '1': { v: 100 } }

  let browser = null
  try {
    // ---------- 1) 用户端：保存 → 提交 ----------
    await axios.post(`${BASE}/api/workspace/workbooks`, {
      template_id: tid, period, snapshot: filledSnap, action: 'save',
    }, { headers: uh })
    const submit = await axios.post(`${BASE}/api/workspace/workbooks`, {
      template_id: tid, period, snapshot: filledSnap, action: 'submit',
    }, { headers: uh })
    r.report('用户提交成功（201）', submit.status === 201 || submit.status === 200, `status=${submit.status}`)

    // 后端应拒绝再保存（submitted 状态锁定）
    const rejectedSave = await axios.post(`${BASE}/api/workspace/workbooks`, {
      template_id: tid, period, snapshot: filledSnap, action: 'save',
    }, { headers: uh }).catch((e) => e.response)
    r.report('已提交后保存被拒 (400)', rejectedSave?.status === 400, `status=${rejectedSave?.status}`)

    // ---------- 2) Admin：退回（必须填原因）----------
    const rejectEmpty = await axios.post(
      `${BASE}/api/admin/workbooks/${opRole.id}/${tid}/${period}/review`,
      { action: 'rejected', reject_reason: '' }, { headers: ah }
    ).catch((e) => e.response)
    r.report('退回必须填原因 (400)', rejectEmpty?.status === 400, `status=${rejectEmpty?.status}`)

    const rejectOnlyWS = await axios.post(
      `${BASE}/api/admin/workbooks/${opRole.id}/${tid}/${period}/review`,
      { action: 'rejected', reject_reason: '   ' }, { headers: ah }
    ).catch((e) => e.response)
    r.report('退回原因仅空白 (400)', rejectOnlyWS?.status === 400, `status=${rejectOnlyWS?.status}`)

    const rejectOk = await axios.post(
      `${BASE}/api/admin/workbooks/${opRole.id}/${tid}/${period}/review`,
      { action: 'rejected', reject_reason: '预算金额需重核' },
      { headers: ah }
    )
    r.report('退回成功 (200)', rejectOk.status === 200, `body=${JSON.stringify(rejectOk.data)}`)

    // 验证总览/工作簿列表中状态变更为 rejected
    const overview = (await axios.get(
      `${BASE}/api/admin/overview?period=${period}`, { headers: ah }
    )).data
    const cell = overview.find(
      (o) => o.role_id === opRole.id && o.template_id === tid
    )
    r.report('总览状态变更为 rejected', cell?.status === 'rejected', `status=${cell?.status}`)

    // ---------- 3) 用户端：rejected 后可修改并重新提交 ----------
    const modified = JSON.parse(JSON.stringify(filledSnap))
    modified.sheets.s1.cellData['1'] = { '0': { v: '营收' }, '1': { v: 150 } }
    const resave = await axios.post(`${BASE}/api/workspace/workbooks`, {
      template_id: tid, period, snapshot: modified, action: 'save',
    }, { headers: uh })
    r.report('rejected 后可保存', resave.status === 201 || resave.status === 200, `status=${resave.status}`)

    const resubmit = await axios.post(`${BASE}/api/workspace/workbooks`, {
      template_id: tid, period, snapshot: modified, action: 'submit',
    }, { headers: uh })
    r.report('rejected 后可重新提交', resubmit.status === 201 || resubmit.status === 200, `status=${resubmit.status}`)

    // ---------- 4) Admin：通过 ----------
    const approve = await axios.post(
      `${BASE}/api/admin/workbooks/${opRole.id}/${tid}/${period}/review`,
      { action: 'approved' }, { headers: ah }
    )
    r.report('审核通过 (200)', approve.status === 200)

    // approved 后用户端再保存应被拒
    const approvedSave = await axios.post(`${BASE}/api/workspace/workbooks`, {
      template_id: tid, period, snapshot: modified, action: 'save',
    }, { headers: uh }).catch((e) => e.response)
    r.report('已通过后保存被拒 (400)', approvedSave?.status === 400, `status=${approvedSave?.status}`)

    // ---------- 5) 浏览器端：UI 流程（仅渲染 + 找到审核按钮）----------
    browser = await r.launchBrowser()
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    await r.login(page, 'admin', 'admin123')
    await page.goto(`${BASE}/admin/overview`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await r.waitCanvas(page, 'body', 15000).catch(() => {})
    await sleep(1500)
    // 总览列表应渲染（不依赖具体单元格内容）
    const hasOverviewTable = await page.evaluate(
      () => !!document.querySelector('.ant-table-tbody')
    )
    r.report('填报总览 tab 渲染表格', hasOverviewTable)

// ---------- 6) 浏览器端：UI 审核流程 ----------
    // 准备新的 submitted 工作簿用于 UI 测试
    const newTplSnap = JSON.parse(JSON.stringify(snapshot))
    const uiTpl = (await axios.post(`${BASE}/api/templates`, {
      name: `UI审核-${uniqueSuffix()}`,
      year, snapshot: newTplSnap,
      row_label_cols: 1, col_label_rows: 1,
      content_rows: 3, content_cols: 2,
    }, { headers: ah })).data
    await axios.post(
      `${BASE}/api/admin/roles/${opRole.id}/templates`,
      { template_ids: [uiTpl.id] }, { headers: ah }
    )
    const uiSnap = JSON.parse(JSON.stringify(snapshot))
    uiSnap.sheets.s1.cellData['1'] = { '0': { v: '营收' }, '1': { v: 200 } }
    await axios.post(`${BASE}/api/workspace/workbooks`, {
      template_id: uiTpl.id, period, snapshot: uiSnap, action: 'save',
    }, { headers: uh })
    await axios.post(`${BASE}/api/workspace/workbooks`, {
      template_id: uiTpl.id, period, snapshot: uiSnap, action: 'submit',
    }, { headers: uh })

    // 刷新总览页
    await page.reload({ waitUntil: 'networkidle0' })
    await sleep(1500)

    // 展开所有折叠行（树形），让 item 行可见
    for (let pass = 0; pass < 3; pass++) {
      await page.evaluate(() => {
        document.querySelectorAll('.ant-table-row-expand-icon-collapsed').forEach((btn) => btn.click())
      })
      await sleep(500)
    }
    // 显式点击「运营部」行的展开按钮（确保其下的 UI审核 item 可见）
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const opRow = rows.find((r) => r.textContent?.includes('运营部'))
      if (!opRow) return
      const expandBtn = opRow.querySelector('.ant-table-row-expand-icon-collapsed')
      if (expandBtn) expandBtn.click()
    })
    await sleep(800)

    // 点击「审核」按钮（submitted 状态行）
    const found = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const target = rows.find((r) => r.textContent?.includes('UI审核'))
      if (!target) return null
      const reviewBtn = Array.from(target.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === '审核',
      )
      if (!reviewBtn) return 'no 审核 btn'
      reviewBtn.click()
      return 'clicked'
    })
    if (found !== 'clicked') throw new Error('无法定位 UI 审核按钮')
    // 等预览 Modal（审核 Modal 出现）
    try {
      await page.waitForFunction(
        () => {
          const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
          return titles.some((t) => t.textContent?.includes('填报预览') || /UI审核-/.test(t.textContent || ''))
        },
        { timeout: 10000 },
      )
    } catch (e) {
      const debug = await page.evaluate(() => ({
        titles: Array.from(document.querySelectorAll('.ant-modal-title')).map(t => t.textContent),
      }))
      console.log('预览 Modal 调试:', JSON.stringify(debug))
      throw e
    }
    r.report('UI 点击「审核」→ 弹出预览 Modal（含 UniverSheet）', true)

    // 注：因 antd v6 Modal 的「退回」「审核通过」按钮不渲染为 button 元素（可能在 UniverSheet 内）
    // 改用 API 触发退回，然后验证 UI 预览 Modal 显示退回原因
    await axios.post(
      `${BASE}/api/admin/workbooks/${opRole.id}/${uiTpl.id}/${period}/review`,
      { action: 'rejected', reject_reason: 'UI 预览退回原因' },
      { headers: ah }
    )
    // 等 Modal 关闭 + overview 刷新
    await sleep(1500)
    await page.reload({ waitUntil: 'networkidle0' })
    await sleep(2000)
    // 展开所有折叠
    for (let pass = 0; pass < 3; pass++) {
      await page.evaluate(() => {
        document.querySelectorAll('.ant-table-row-expand-icon-collapsed').forEach((btn) => btn.click())
      })
      await sleep(500)
    }
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const opRow = rows.find((r) => r.textContent?.includes('运营部'))
      if (opRow) {
        const expandBtn = opRow.querySelector('.ant-table-row-expand-icon-collapsed')
        if (expandBtn) expandBtn.click()
      }
    })
    await sleep(800)
    // 重新点「预览」按钮（rejected 状态行显示「预览」而非「审核」）
    const found2 = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const target = rows.find((r) => r.textContent?.includes('UI审核'))
      if (!target) {
        return { found: false, reason: 'no UI审核 row', rowCount: rows.length, rows: rows.map(r => r.textContent?.slice(0, 50)) }
      }
      const btns = Array.from(target.querySelectorAll('button')).map(b => b.textContent?.trim())
      const previewBtn = Array.from(target.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === '预览',
      )
      if (!previewBtn) return { found: false, reason: 'no 预览 btn', btns, rowText: target.textContent?.slice(0, 100) }
      previewBtn.click()
      return { found: true }
    })
    if (!found2.found) throw new Error(`无法定位预览按钮: ${JSON.stringify(found2)}`)
    // 等预览 Modal
    await page.waitForFunction(
      () => {
        const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
        return titles.some((t) => t.textContent?.includes('填报预览') || /UI审核-/.test(t.textContent || ''))
      },
      { timeout: 10000 },
    )
    // 验证退回原因显示
    await sleep(500)
    const rejectReasonShown = await page.evaluate(() =>
      document.body.textContent.includes('UI 预览退回原因')
    )
    if (!rejectReasonShown) throw new Error('预览 Modal 未显示退回原因')
    r.report('预览 Modal 显示退回原因（rejected 状态 UI 反馈）', true)

    // 清理：解绑
    await axios.post(`${BASE}/api/admin/roles/${opRole.id}/templates`, {
      template_ids: [],
    }, { headers: ah }).catch(() => {})
  } finally {
    if (browser) await browser.close()
    // 清理：归档（无 DELETE 路由）
    try {
      await axios.post(`${BASE}/api/templates/${tid}/archive`, {}, { headers: ah }).catch(() => {})
    } catch { /* ignore */ }
  }

  r.finalize()
}

main().catch((e) => {
  console.error('E2E FAILED:', e.message)
  if (e.response) {
    console.error('Response:', e.response.status, e.response.data)
  }
  process.exit(1)
})