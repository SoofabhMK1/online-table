// 阶段验证：角色创建 + 标签配置 + 用户填报时标签区只读
import axios from 'axios'
import { Reporter, uniqueSuffix, currentPeriod, sleep, BASE } from './e2e_helpers.mjs'

async function main() {
  const r = new Reporter('LABEL E2E')
  const ah = await r.apiLogin('admin', 'admin123')
  const uh = await r.apiLogin('op1', 'pw123')

  const snapshot = {
    id: 'label_wb',
    appVersion: '0.25.1',
    locale: 'zhCN',
    name: '财务填报',
    styles: {},
    sheetOrder: ['s1'],
    sheets: {
      s1: {
        id: 's1',
        name: 'Sheet1',
        rowCount: 20,
        columnCount: 10,
        cellData: {
          '0': { '0': { v: '项目' }, '1': { v: '2024' }, '2': { v: '2025' } },
          '1': { '0': { v: '营收' } },
          '2': { '0': { v: '成本' } },
        },
      },
    },
  }
  const tplName = `财务填报表${uniqueSuffix()}`
  const roleName = `财务部${uniqueSuffix()}`

  // 1) 创建带标签的模板
  const tplResp = await axios.post(`${BASE}/api/templates`, {
    name: tplName,
    snapshot,
    row_label_cols: 1,
    col_label_rows: 1,
  }, { headers: ah })
  const tid = tplResp.data.id
  r.report('创建带标签模板', tplResp.status === 201, `row_label_cols=${tplResp.data.row_label_cols}`)

  // 2) 创建角色（带唯一后缀，幂等可重跑）
  const roleResp = await axios.post(`${BASE}/api/admin/roles`, { name: roleName }, { headers: ah })
  const finRoleId = roleResp.data.id
  r.report('API 创建角色', roleResp.status === 201)
  await axios.post(`${BASE}/api/admin/roles/${finRoleId}/templates`, { template_ids: [tid] }, { headers: ah })
  r.report('绑定模板到角色', true)

  let browser = await r.launchBrowser()
  let browser2 = null
  try {
    // 3) 管理员 UI：角色管理页展示
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    await r.login(page, 'admin', 'admin123')
    await page.goto(`${BASE}/admin/roles`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await r.gotoWithRetry(page, `${BASE}/admin/roles`, '.ant-menu')
    await sleep(1000)
    const roleTabText = await page.evaluate(() => document.body.textContent)
    r.report('角色管理区展示角色', roleTabText.includes(roleName))

    await browser.close()
    browser = null

    // 4) 用 op1 测试标签只读（把模板同时绑给 运营部 角色）
    const roles2 = (await axios.get(`${BASE}/api/admin/roles`, { headers: ah })).data
    const opRole = roles2.find((r) => r.name === '运营部')
    await axios.post(`${BASE}/api/admin/roles/${opRole.id}/templates`, { template_ids: [tid] }, { headers: ah })

    browser2 = await r.launchBrowser()
    const page2 = await browser2.newPage()
    await page2.setViewport({ width: 1440, height: 900 })
    await r.login(page2, 'op1', 'pw123')
    await page2.goto(`${BASE}/workspace/templates/${tid}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await r.waitCanvas(page2, 'body', 15000)
    await sleep(2500)
    r.report('用户填报视图渲染', true)

    // 点击标签单元格 A1（第0行第0列），输入应被阻止
    const grid = await page2.evaluate(() => {
      const cs = Array.from(document.querySelectorAll('canvas'))
      let best = null
      for (const c of cs) {
        const r = c.getBoundingClientRect()
        if (!best || r.width * r.height > best.w * best.h) best = { x: r.x, y: r.y, w: r.width, h: r.height }
      }
      return best
    })
    await page2.mouse.click(grid.x + 90, grid.y + 32)
    await sleep(800)
    await page2.keyboard.type('HACK')
    await sleep(400)
    await page2.keyboard.press('Enter')
    await sleep(800)
    await page2.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      btns.find((b) => b.textContent?.replace(/\s+/g, '') === '保存草稿')?.click()
    })
    await sleep(2000)
    const saved = (await axios.get(`${BASE}/api/workspace/templates/${tid}?period=${currentPeriod()}`, {
      headers: uh,
    })).data
    const wb = saved.snapshot
    const a1After = wb.sheets?.s1?.cellData?.['0']?.['0']?.v
    const hackFound = JSON.stringify(wb.sheets?.s1?.cellData ?? {}).includes('HACK')
    r.report(
      '标签单元格 A1 未被修改（保护生效）',
      a1After === '项目' && !hackFound,
      `A1=${JSON.stringify(a1After)} hackFound=${hackFound}`,
    )
  } finally {
    // 清理：归档模板（保留绑定 + 历史）+ 删本脚本创建的角色
    try {
      await axios.post(`${BASE}/api/templates/${tid}/archive`, {}, { headers: ah }).catch(() => {})
      await axios.delete(`${BASE}/api/admin/roles/${finRoleId}`, { headers: ah, data: { confirm_name: roleName } }).catch(() => {})
    } catch { /* ignore */ }
    if (browser) await browser.close()
    if (browser2) await browser2.close()
  }

  r.finalize()
}

main().catch((e) => {
  console.error('E2E FAILED:', e.message)
  process.exit(1)
})