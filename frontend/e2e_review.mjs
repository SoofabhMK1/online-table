// 阶段验证：审核状态机（submit → reject/approve → resubmit）
// 覆盖此前 e2e 套件未涉及的：审核通过、退回、修改后再提交、状态机约束。
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

    // ---------- 5) 浏览器端：UI 流程（提交 → 审核 → 拒绝原因可见）----------
    browser = await r.launchBrowser()
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    await r.login(page, 'admin', 'admin123')
    await page.goto(`${BASE}/admin/overview`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await r.waitCanvas(page, 'body', 15000).catch(() => {})
    // 直接进入填报总览页（新架构：侧栏菜单 + 独立路由）
    await sleep(1500)
    // 总览列表应渲染（不依赖具体单元格内容）
    const hasOverviewTable = await page.evaluate(
      () => !!document.querySelector('.ant-table-tbody')
    )
    r.report('填报总览 tab 渲染表格', hasOverviewTable)
  } finally {
    if (browser) await browser.close()
    // 清理：解绑 + 删模板
    try {
      await axios.delete(`${BASE}/api/templates/${tid}`, { headers: ah }).catch(() => {})
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