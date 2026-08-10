// 二期验证：填报期间锁定 + 内容区数字校验
import axios from 'axios'
import { Reporter, uniqueSuffix, sleep, BASE } from './e2e_helpers.mjs'

async function main() {
  const r = new Reporter('PERIOD E2E')
  const ah = await r.apiLogin('admin', 'admin123')
  const uh = await r.apiLogin('op1', 'pw123')

  // 创建带 content_numeric 的模板（年度 = 明年，避免被实际数据污染）
  const year = new Date().getFullYear() + 1
  const lockPeriod = `${year}-09`  // 未来月份，确保从未被自动锁
  const tplName = `数字校验模板${uniqueSuffix()}`
  const snapshot = {
    id: 'period_wb', appVersion: '0.25.1', locale: 'zhCN', name: tplName,
    styles: {}, sheetOrder: ['s1'],
    sheets: { s1: { id: 's1', name: 'Sheet1', rowCount: 10, columnCount: 6, cellData: {
      '0': { '0': { v: '项目' }, '1': { v: 'A' }, '2': { v: 'B' } },
    } } },
  }
  const tpl = await axios.post(`${BASE}/api/templates`, {
    name: tplName, year, snapshot,
    row_label_cols: 1, col_label_rows: 1,
    content_rows: 3, content_cols: 2,
    content_numeric: true,
  }, { headers: ah })
  const tid = tpl.data.id
  const roles = (await axios.get(`${BASE}/api/admin/roles`, { headers: ah })).data
  const op = roles.find((r) => r.name === '运营部')
  await axios.post(`${BASE}/api/admin/roles/${op.id}/templates`, { template_ids: [tid] }, { headers: ah })

  let browser = null
  try {
    // ---------- 期间锁定 ----------
    let list = (await axios.get(`${BASE}/api/workspace/templates?period=${lockPeriod}`, { headers: uh })).data
    if (list.length === 0) {
      throw new Error(`脚本未绑定模板到 ${lockPeriod}（list 为空），跳过锁定检查`)
    }
    r.report('锁定前该周期未锁定', list.every((t) => t.locked === false))

    // 管理员锁定
    await axios.put(`${BASE}/api/admin/periods/${lockPeriod}`, { locked: true }, { headers: ah })
    list = (await axios.get(`${BASE}/api/workspace/templates?period=${lockPeriod}`, { headers: uh })).data
    r.report('锁定后列表 locked=true', list.length > 0 && list.every((t) => t.locked === true))

    const snap = { id: 'wb', name: 'x', sheetOrder: ['s1'], sheets: { s1: { id: 's1', cellData: {} } } }
    const saveLocked = await axios.post(`${BASE}/api/workspace/workbooks`,
      { template_id: tid, period: lockPeriod, snapshot: snap, action: 'save' },
      { headers: uh }).catch((e) => e.response)
    r.report('锁定期间保存被拒绝(400)', saveLocked?.status === 400, `status=${saveLocked?.status}`)

    // 浏览器：打开填报页应显示锁定横幅
    browser = await r.launchBrowser()
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    await r.login(page, 'op1', 'pw123')
    await page.goto(`${BASE}/workspace/templates/${tid}?period=${lockPeriod}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await r.waitCanvas(page, 'body', 15000)
    const bodyText = await page.evaluate(() => document.body.textContent)
    r.report('填报页显示锁定横幅', bodyText.includes('该周期已被管理员锁定'))

    // 解锁后可保存
    await axios.put(`${BASE}/api/admin/periods/${lockPeriod}`, { locked: false }, { headers: ah })
    const saveOk = await axios.post(`${BASE}/api/workspace/workbooks`,
      { template_id: tid, period: lockPeriod, snapshot: snap, action: 'save' },
      { headers: uh }).catch((e) => e.response)
    r.report('解锁后保存成功', saveOk?.status === 201 || saveOk?.status === 200, `status=${saveOk?.status}`)

    // ---------- 内容区数字校验 ----------
    // 保持解锁状态，测试内容区数字校验（不应被锁定拦截）
    const invalidSnap = JSON.parse(JSON.stringify(snap))
    invalidSnap.sheets.s1.cellData = { '1': { '1': { v: 'abc' } } }  // 内容区 B2 = 非数字
    const submit = await axios.post(`${BASE}/api/workspace/workbooks`,
      { template_id: tid, period: lockPeriod, snapshot: invalidSnap, action: 'submit' },
      { headers: uh }).catch((e) => e.response)
    const submitMsg = typeof submit?.data?.detail === 'string' ? submit.data.detail : ''
    r.report('内容区非数字被拒(400)', submit?.status === 400 && submitMsg.includes('需为数字'), `msg=${submitMsg}`)

    // 测试结束后解锁，避免影响其它测试
    await axios.put(`${BASE}/api/admin/periods/${lockPeriod}`, { locked: false }, { headers: ah })

    // ---------- 工作表按钮禁用 ----------
    await browser.close()
    browser = await r.launchBrowser()
    const page2 = await browser.newPage()
    await page2.setViewport({ width: 1440, height: 900 })
    await r.login(page2, 'op1', 'pw123')
    await page2.goto(`${BASE}/workspace/templates/${tid}?period=${lockPeriod}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await r.waitCanvas(page2, 'body', 15000)
    await sleep(1500)
    // antd 6 的 sheet tab 加号按钮已因权限点关闭；如果还存在说明权限点未生效
    const addSheetBtn = await page2.evaluate(() => {
      const el = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((b) => b.getAttribute?.('aria-label')?.includes('新增') || b.title?.includes('新增'))
      return !!el
    })
    r.report('工作表「+」按钮被禁用', !addSheetBtn)
  } finally {
    if (browser) await browser.close()
    // 清理：解锁 + 删模板（连带 role_template_mapping）
    try {
      await axios.put(`${BASE}/api/admin/periods/${lockPeriod}`, { locked: false }, { headers: ah }).catch(() => {})
      await axios.delete(`${BASE}/api/templates/${tid}`, { headers: ah }).catch(() => {})
    } catch { /* ignore */ }
  }

  r.finalize()
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1) })