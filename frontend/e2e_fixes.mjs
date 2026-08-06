/* eslint-disable no-console */
// 验证：#2 保存后重进加载已存数据；#4 退出登录按钮
import puppeteer from 'puppeteer-core'
import axios from 'axios'

const BASE = 'http://localhost:5173'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const report = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`) }

async function main() {
  // 准备：模板(标签1,1) + 绑定运营部
  const admin = await axios.post(`${BASE}/api/auth/login`, { username: 'admin', password: 'admin123' })
  const h = { Authorization: `Bearer ${admin.data.access_token}` }
  const snapshot = {
    id: 'save_wb', appVersion: '0.25.1', locale: 'zhCN', name: '保存测试',
    styles: {}, sheetOrder: ['s1'],
    sheets: { s1: { id: 's1', name: 'Sheet1', rowCount: 10, columnCount: 6,
      cellData: {
        '0': { '0': { v: '项目' }, '1': { v: '2024' }, '2': { v: '2025' } },
        '1': { '0': { v: '营收' } }, '2': { '0': { v: '成本' } },
      } } },
  }
  const tpl = await axios.post(`${BASE}/api/templates`, { name: '保存测试表', snapshot, row_label_cols: 1, col_label_rows: 1 }, { headers: h })
  const tid = tpl.data.id
  const roles = (await axios.get(`${BASE}/api/admin/roles`, { headers: h })).data
  const op = roles.find((r) => r.name === '运营部')
  await axios.post(`${BASE}/api/admin/roles/${op.id}/templates`, { template_ids: [tid] }, { headers: h })

  // 用户：先 POST 一份已填数据（模拟点击保存）→ 内容区 B2="123"
  const opLogin = await axios.post(`${BASE}/api/auth/login`, { username: 'op1', password: 'pw123' })
  const opH = { Authorization: `Bearer ${opLogin.data.access_token}` }
  const filledSnapshot = JSON.parse(JSON.stringify(snapshot))
  filledSnapshot.sheets.s1.cellData['1']['1'] = { v: '123' } // B2
  await axios.post(`${BASE}/api/workspace/workbooks`, { template_id: tid, snapshot: filledSnapshot }, { headers: opH })
  report('POST 保存填报数据', true)

  // 浏览器：用户打开填报视图，拦截模板详情接口（现返回用户已保存数据）
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  let wbResponse = null
  page.on('response', async (res) => {
    if (res.url().includes(`/api/workspace/templates/${tid}`) && res.request().method() === 'GET') {
      try { wbResponse = await res.json() } catch { wbResponse = { err: true } }
    }
  })

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(3000)
  try { await page.waitForSelector('#username', { timeout: 10000 }) } catch {
    await page.reload({ waitUntil: 'networkidle0', timeout: 60000 }); await sleep(2500); await page.waitForSelector('#username', { timeout: 15000 })
  }
  await page.type('#username', 'op1')
  await page.type('#password', 'pw123')
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 30000 })
  await page.goto(`${BASE}/workspace/templates/${tid}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(3000)
  try { await page.waitForSelector('canvas', { timeout: 8000 }) } catch {
    await page.reload({ waitUntil: 'networkidle0', timeout: 60000 }); await sleep(2000); await page.waitForSelector('canvas', { timeout: 15000 })
  }
  await sleep(2500)

  const b2Value = wbResponse ? JSON.stringify(wbResponse.snapshot?.sheets?.s1?.cellData?.['1']?.['1']?.v) : 'NO_RESPONSE'
  report('重新进入时加载用户已保存数据 (B2=123)', b2Value === '"123"', `B2=${b2Value}`)

  // #4 退出登录按钮
  const hasLogout = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).some((b) => b.textContent.replace(/\s+/g, '').includes('退出登录')),
  )
  report('工作台有退出登录按钮', hasLogout)
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    btns.find((b) => b.textContent.replace(/\s+/g, '').includes('退出登录'))?.click()
  })
  await sleep(1500)
  const afterLogout = await page.evaluate(() => location.pathname)
  report('点击退出登录跳转 /login', afterLogout === '/login', `path=${afterLogout}`)

  await browser.close()
  console.log('total:', results.filter(Boolean).length, '/', results.length)
  if (results.some((r) => !r)) process.exit(1)
  console.log('FIXES E2E ALL PASSED')
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1) })
