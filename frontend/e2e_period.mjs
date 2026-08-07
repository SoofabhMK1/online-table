/* eslint-disable no-console */
// 二期验证：填报期间锁定 + 内容区数字校验
import puppeteer from 'puppeteer-core'
import axios from 'axios'

const BASE = 'http://localhost:5173'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const report = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`) }

async function main() {
  const admin = await axios.post(`${BASE}/api/auth/login`, { username: 'admin', password: 'admin123' })
  const ah = { Authorization: `Bearer ${admin.data.access_token}` }
  const op = await axios.post(`${BASE}/api/auth/login`, { username: 'op1', password: 'pw123' })
  const uh = { Authorization: `Bearer ${op.data.access_token}` }

  const lockPeriod = '2026-09'

  // ---------- 期间锁定 ----------
  // 初始应未锁定
  let list = (await axios.get(`${BASE}/api/workspace/templates?period=${lockPeriod}`, { headers: uh })).data
  report('锁定前该周期未锁定', list.every((t) => t.locked === false))

  // 管理员锁定
  await axios.put(`${BASE}/api/admin/periods/${lockPeriod}`, { locked: true }, { headers: ah })
  list = (await axios.get(`${BASE}/api/workspace/templates?period=${lockPeriod}`, { headers: uh })).data
  report('锁定后列表 locked=true', list.length > 0 && list.every((t) => t.locked === true))

  const tid = list[0].id
  const snap = { id: 'wb', name: 'x', sheetOrder: ['s1'], sheets: { s1: { id: 's1', cellData: {} } } }
  const saveLocked = await axios.post(`${BASE}/api/workspace/workbooks`,
    { template_id: tid, period: lockPeriod, snapshot: snap, action: 'save' },
    { headers: uh }).catch((e) => e.response)
  report('锁定期间保存被拒绝(400)', saveLocked.status === 400, `status=${saveLocked.status}`)

  // 浏览器：打开填报页应显示锁定横幅
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(3000)
  await page.type('#username', 'op1')
  await page.type('#password', 'pw123')
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 30000 })
  await page.goto(`${BASE}/workspace/templates/${tid}?period=${lockPeriod}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(3000)
  const bodyText = await page.evaluate(() => document.body.textContent)
  report('填报页显示锁定横幅', bodyText.includes('该周期已被管理员锁定'))

  // 普通用户不允许新建/删除/重命名工作表：检查工作表栏“新建工作表”按钮为禁用
  const addBtnDisabled = await page.evaluate(() => {
    const bars = Array.from(document.querySelectorAll('section')).filter((s) =>
      (s.className || '').toString().includes('grid-flow-col'))
    for (const bar of bars) {
      const btn = Array.from(bar.querySelectorAll('button')).find((b) => {
        const r = b.getBoundingClientRect()
        return r.width <= 40 && r.height <= 30
      })
      if (btn) return btn.hasAttribute('disabled')
    }
    return null
  })
  report('用户填报页“新建工作表”按钮被禁用', addBtnDisabled === true, `disabled=${addBtnDisabled}`)
  await browser.close()

  // 解锁后可保存
  await axios.put(`${BASE}/api/admin/periods/${lockPeriod}`, { locked: false }, { headers: ah })
  const saveOk = await axios.post(`${BASE}/api/workspace/workbooks`,
    { template_id: tid, period: lockPeriod, snapshot: snap, action: 'save' },
    { headers: uh }).catch((e) => e.response)
  report('解锁后保存成功(201)', saveOk.status === 201, `status=${saveOk.status}`)

  // ---------- 数字校验 ----------
  const numericSnap = { id: 'num_wb', name: 'x', sheetOrder: ['s1'], sheets: { s1: { id: 's1', rowCount: 10, columnCount: 6, cellData: {} } } }
  const tpl = await axios.post(`${BASE}/api/templates`, {
    name: `数字校验模板${Date.now().toString().slice(-5)}`,
    year: 2026,
    snapshot: numericSnap,
    row_label_cols: 1,
    col_label_rows: 1,
    content_rows: 2,
    content_cols: 2,
    content_numeric: true,
  }, { headers: ah })
  const ntid = tpl.data.id
  const roles = (await axios.get(`${BASE}/api/admin/roles`, { headers: ah })).data
  const opRole = roles.find((r) => r.name === '运营部')
  await axios.post(`${BASE}/api/admin/roles/${opRole.id}/templates`, { template_ids: [ntid] }, { headers: ah })

  const badSnap = JSON.parse(JSON.stringify(numericSnap))
  badSnap.sheets.s1.cellData['1'] = { '1': { v: 'abc' } } // 内容区 B2 填文字
  const bad = await axios.post(`${BASE}/api/workspace/workbooks`,
    { template_id: ntid, period: lockPeriod, snapshot: badSnap, action: 'submit' },
    { headers: uh }).catch((e) => e.response)
  report('数字模板提交文字被拦截(400)', bad.status === 400, `status=${bad.status}`)

  const goodSnap = JSON.parse(JSON.stringify(numericSnap))
  goodSnap.sheets.s1.cellData['1'] = { '1': { v: 100 } }
  const good = await axios.post(`${BASE}/api/workspace/workbooks`,
    { template_id: ntid, period: lockPeriod, snapshot: goodSnap, action: 'submit' },
    { headers: uh }).catch((e) => e.response)
  report('数字模板提交数字成功(201)', good.status === 201, `status=${good.status}`)

  console.log('total:', results.filter(Boolean).length, '/', results.length)
  if (results.some((r) => !r)) process.exit(1)
  console.log('PERIOD E2E ALL PASSED')
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1) })
