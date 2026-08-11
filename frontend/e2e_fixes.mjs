// 验证：#2 保存后重进加载已存数据；#4 退出登录按钮
import axios from 'axios'
import { Reporter, uniqueSuffix, currentPeriod, sleep, BASE } from './e2e_helpers.mjs'

async function main() {
  const r = new Reporter('FIXES E2E')
  const ah = await r.apiLogin('admin', 'admin123')
  const uh = await r.apiLogin('op1', 'pw123')

  const tplName = `保存测试表${uniqueSuffix()}`
  const snapshot = {
    id: 'save_wb', appVersion: '0.25.1', locale: 'zhCN', name: '保存测试',
    styles: {}, sheetOrder: ['s1'],
    sheets: { s1: { id: 's1', name: 'Sheet1', rowCount: 10, columnCount: 6,
      cellData: {
        '0': { '0': { v: '项目' }, '1': { v: '2024' }, '2': { v: '2025' } },
        '1': { '0': { v: '营收' } }, '2': { '0': { v: '成本' } },
      } } },
  }

  // 准备：模板(标签1,1) + 绑定运营部
  const tpl = await axios.post(`${BASE}/api/templates`, {
    name: tplName, snapshot, row_label_cols: 1, col_label_rows: 1,
  }, { headers: ah })
  const tid = tpl.data.id
  const roles = (await axios.get(`${BASE}/api/admin/roles`, { headers: ah })).data
  const op = roles.find((r) => r.name === '运营部')
  await axios.post(`${BASE}/api/admin/roles/${op.id}/templates`, { template_ids: [tid] }, { headers: ah })

  // 用户：先 POST 一份已填数据 → 内容区 B2="123"
  const filledSnapshot = JSON.parse(JSON.stringify(snapshot))
  filledSnapshot.sheets.s1.cellData['1']['1'] = { v: '123' }
  const saveResp = await axios.post(`${BASE}/api/workspace/workbooks`, {
    template_id: tid,
    period: currentPeriod(),
    snapshot: filledSnapshot,
    action: 'save',
  }, { headers: uh })
  r.report('POST 保存填报数据', saveResp.status === 201 || saveResp.status === 200, `period=${currentPeriod()}`)

  const browser = await r.launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    let wbResponse = null
    page.on('response', async (res) => {
      if (res.url().includes(`/api/workspace/templates/${tid}`) && res.request().method() === 'GET') {
        try { wbResponse = await res.json() } catch { wbResponse = { err: true } }
      }
    })

    await r.login(page, 'op1', 'pw123')
    await page.goto(`${BASE}/workspace/templates/${tid}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await r.waitCanvas(page, 'body', 15000)
    await sleep(2500)

    const b2Value = wbResponse ? JSON.stringify(wbResponse.snapshot?.sheets?.s1?.cellData?.['1']?.['1']?.v) : 'NO_RESPONSE'
    r.report('重新进入时加载用户已保存数据 (B2=123)', b2Value === '"123"', `B2=${b2Value}`)

    // #4 退出登录按钮
    const hasLogout = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.replace(/\s+/g, '').includes('退出登录')),
    )
    r.report('工作台有退出登录按钮', hasLogout)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      btns.find((b) => b.textContent?.replace(/\s+/g, '').includes('退出登录'))?.click()
    })
    await sleep(1500)
    const afterLogout = await page.evaluate(() => location.pathname)
    r.report('点击退出登录跳转 /login', afterLogout === '/login', `path=${afterLogout}`)
  } finally {
    await browser.close()
    // 清理本脚本创建的模板（archive 替代 DELETE：保留绑定 + 历史）
    try {
      await axios.post(`${BASE}/api/templates/${tid}/archive`, {}, { headers: ah }).catch(() => {})
    } catch { /* ignore */ }
  }

  r.finalize()
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1) })