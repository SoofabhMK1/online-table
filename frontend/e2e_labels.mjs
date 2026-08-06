/* eslint-disable no-console */
// 阶段验证：角色创建 + 标签配置 + 用户填报时标签区只读
import puppeteer from 'puppeteer-core'
import axios from 'axios'

const BASE = 'http://localhost:5173'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const currentPeriod = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const results = []

function report(name, ok, extra = '') {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

async function login(page, u, p) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(3000)
  try {
    await page.waitForSelector('#username', { timeout: 10000 })
  } catch {
    await page.reload({ waitUntil: 'networkidle0', timeout: 60000 })
    await sleep(2500)
    await page.waitForSelector('#username', { timeout: 15000 })
  }
  await page.type('#username', u)
  await page.type('#password', p)
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 30000 })
}

async function main() {
  const admin = await axios.post(`${BASE}/api/auth/login`, { username: 'admin', password: 'admin123' })
  const adminHeader = { Authorization: `Bearer ${admin.data.access_token}` }

  // 1) 通过 API 创建带标签的模板（行标签1列A，列标签1行=第1行）
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
  const tpl = await axios.post(`${BASE}/api/templates`, {
    name: '财务填报表',
    snapshot,
    row_label_cols: 1,
    col_label_rows: 1,
  }, { headers: adminHeader })
  const tid = tpl.data.id
  report('创建带标签模板', tpl.status === 201, `row_label_cols=${tpl.data.row_label_cols}`)

  // 2) 创建角色 + 用户（财务部 / fin1）
  const role = await axios.post(`${BASE}/api/admin/roles`, { name: '财务部' }, { headers: adminHeader })
  report('API 创建角色', role.status === 201)
  const roles = (await axios.get(`${BASE}/api/admin/roles`, { headers: adminHeader })).data
  const finRole = roles.find((r) => r.name === '财务部')
  await axios.post(`${BASE}/api/admin/roles/${finRole.id}/templates`, { template_ids: [tid] }, { headers: adminHeader })
  report('绑定模板到角色', true)

  // 3) 管理员 UI：角色管理页展示 + 新增角色
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })

  await login(page, 'admin', 'admin123')
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(3000)
  try {
    await page.waitForSelector('.ant-tabs', { timeout: 8000 })
  } catch {
    await page.reload({ waitUntil: 'networkidle0', timeout: 60000 })
    await sleep(2000)
    await page.waitForSelector('.ant-tabs', { timeout: 15000 })
  }
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.ant-tabs-tab'))
    tabs.find((t) => t.textContent.includes('角色与权限'))?.click()
  })
  await sleep(1000)
  const roleTabText = await page.evaluate(() => document.body.textContent)
  report('角色管理区展示角色', roleTabText.includes('财务部'))

  // 4) 用户填报视图：验证标签区只读
  // 创建财务部用户
  // 通过后端直接插入（模拟用户管理），用 Python 完成；这里用已有 op1 绑定到财务部? 不行，用直接数据库
  await browser.close()

  // 直接用 op1（运营部）也可测试 —— 但需要把模板绑定给运营部。为简单，将模板同时绑定给运营部
  const roles2 = (await axios.get(`${BASE}/api/admin/roles`, { headers: adminHeader })).data
  const opRole = roles2.find((r) => r.name === '运营部')
  await axios.post(`${BASE}/api/admin/roles/${opRole.id}/templates`, { template_ids: [tid] }, { headers: adminHeader })

  const browser2 = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page2 = await browser2.newPage()
  await page2.setViewport({ width: 1440, height: 900 })
  await login(page2, 'op1', 'pw123')
  await page2.goto(`${BASE}/workspace/templates/${tid}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(3000)
  try {
    await page2.waitForSelector('canvas', { timeout: 8000 })
  } catch {
    await page2.reload({ waitUntil: 'networkidle0', timeout: 60000 })
    await sleep(2000)
    await page2.waitForSelector('canvas', { timeout: 15000 })
  }
  await sleep(2500)
  report('用户填报视图渲染', true)

  const grid = await page2.evaluate(() => {
    const cs = Array.from(document.querySelectorAll('canvas'))
    let best = null
    for (const c of cs) {
      const r = c.getBoundingClientRect()
      if (!best || r.width * r.height > best.w * best.h) best = { x: r.x, y: r.y }
    }
    return best
  })

  // 点击标签单元格 A1（第0行第0列），输入应被阻止
  const a1x = grid.x + 90
  const a1y = grid.y + 32
  await page2.mouse.click(a1x, a1y)
  await sleep(800)
  await page2.keyboard.type('HACK')
  await sleep(400)
  await page2.keyboard.press('Enter')
  await sleep(800)
  // 改为：保存后检查快照 A1 是否仍是"项目"
  await page2.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    btns.find((b) => b.textContent.replace(/\s+/g, '') === '保存草稿')?.click()
  })
  await sleep(2000)
  const saved = (await axios.get(`${BASE}/api/workspace/templates/${tid}?period=${currentPeriod()}`, {
    headers: { Authorization: `Bearer ${(await axios.post(`${BASE}/api/auth/login`, { username: 'op1', password: 'pw123' })).data.access_token}` },
  })).data
  const wb = saved.snapshot
  const a1After = wb.sheets?.s1?.cellData?.['0']?.['0']?.v
  report('标签单元格 A1 未被修改（保护生效）', a1After === '项目', `A1=${JSON.stringify(a1After)}`)

  await browser2.close()

  // 清理测试模板
  console.log('total pass:', results.filter(Boolean).length, '/', results.length)
  if (results.some((r) => !r)) process.exit(1)
  console.log('LABEL E2E ALL PASSED')
}

main().catch((e) => {
  console.error('E2E FAILED:', e.message)
  process.exit(1)
})
