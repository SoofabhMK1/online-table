/* eslint-disable no-console */
// 阶段五全栈端到端测试：管理端建表 + 权限绑定 + 用户端填报保存。
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

async function waitCanvas(page, containerSelector, timeout = 30000) {
  await page.waitForFunction(
    (sel) => {
      const root = sel ? document.querySelector(sel) : document
      return !!root.querySelectorAll('canvas').length
    },
    { timeout },
    containerSelector,
  )
}

/** 页面加载并重试一次以规避 Vite 首次依赖优化的 504。 */
async function gotoWithRetry(page, url, selector, timeout = 60000) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
  await sleep(2500)
  try {
    await page.waitForSelector(selector, { timeout: 8000 })
  } catch {
    await page.reload({ waitUntil: 'networkidle0', timeout })
    await sleep(1500)
    await page.waitForSelector(selector, { timeout: 15000 })
  }
}

async function clickByText(page, text, containerSel = 'body') {
  const clicked = await page.evaluate(
    (t, sel) => {
      const root = sel === 'body' ? document.body : document.querySelector(sel)
      const els = Array.from(root.querySelectorAll('button, a, span, div'))
      const target = els.find(
        (el) => el.textContent.replace(/\s+/g, '') === t.replace(/\s+/g, ''),
      )
      if (target) {
        target.click()
        return true
      }
      return false
    },
    text,
    containerSel,
  )
  if (!clicked) throw new Error(`未找到按钮/元素: ${text}`)
}

async function login(page, username, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.type('#username', username)
  await page.type('#password', password)
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 30000 })
}

async function main() {
  // admin token 用于直接调用后端做权限绑定
  const adminLogin = await axios.post(`${BASE}/api/auth/login`, {
    username: 'admin',
    password: 'admin123',
  })
  const adminToken = adminLogin.data.access_token
  const adminHeader = { Authorization: `Bearer ${adminToken}` }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  // ---------- 管理端 ----------
  await login(page, 'admin', 'admin123')
  await gotoWithRetry(page, `${BASE}/admin`, '.ant-tabs')
  report('管理端登录并进入 /admin', true)

  // 新建模板（:has(#name) 限定“新建/编辑模板”弹窗，规避 forceRender 的预览弹窗）
  const CREATE_MODAL = '.ant-modal:has(#name)'
  await page.click('.ant-btn-primary')
  await sleep(2000)
  await page.waitForSelector(CREATE_MODAL, { timeout: 15000 })
  await sleep(1500)
  await waitCanvas(page, CREATE_MODAL)
  await sleep(2000)
  const modalCanvas = await page.evaluate(
    (sel) => document.querySelector(sel)?.querySelectorAll('canvas').length ?? 0,
    CREATE_MODAL,
  )
  report('Modal 内 Univer 已渲染', modalCanvas > 0)

  const templateName = `测试模板${Date.now().toString().slice(-6)}`
  await page.type('#name', templateName)
  await page.type('input[placeholder="如：B3"]', 'A1')
  await page.evaluate((sel) => {
    const modal = document.querySelector(sel)
    const btns = Array.from(modal?.querySelectorAll('.ant-modal-footer button') ?? [])
    btns.find((b) => b.textContent.replace(/\s+/g, '') === '保存')?.click()
  }, CREATE_MODAL)
  await page.waitForFunction(
    (name) =>
      document.body.textContent.includes('模板创建成功') &&
      document.body.textContent.includes(name),
    { timeout: 20000 },
    templateName,
  )
  report('Modal 内在线建表并保存成功', true, `模板=${templateName}`)

  // 编辑弹窗可打开
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.ant-table-tbody button'))
    btns.forEach((b) => {
      if (b.textContent.trim() === '编辑') b.click()
    })
  })
  await page.waitForSelector(CREATE_MODAL, { timeout: 15000 })
  await waitCanvas(page, CREATE_MODAL)
  await sleep(1000)
  report('编辑弹窗打开且 Univer 渲染', true)
  await clickByText(page, '取消', CREATE_MODAL)
  await sleep(800)

  // 通过 API 将模板绑定给 运营部 角色
  const roles = (await axios.get(`${BASE}/api/admin/roles`, { headers: adminHeader })).data
  const opRole = roles.find((r) => r.name === '运营部')
  const templates = (await axios.get(`${BASE}/api/templates`, { headers: adminHeader })).data
  const created = templates.find((t) => t.name === templateName)
  const bind = await axios.post(
    `${BASE}/api/admin/roles/${opRole.id}/templates`,
    { template_ids: [created.id] },
    { headers: adminHeader },
  )
  report('API 绑定模板到运营部', bind.status === 200, `role=${opRole.name} tid=${created.id}`)

  // 权限配置 Tab：Transfer 渲染并反映绑定
  await clickByText(page, '模板权限')
  await page.waitForSelector('.ant-transfer', { timeout: 15000 })
  await sleep(800)
  // 切换角色到 运营部
  await page.click('.ant-select-content')
  await page.waitForSelector('.ant-select-dropdown .ant-select-item-option', {
    timeout: 15000,
  })
  await page.evaluate(() => {
    const options = Array.from(
      document.querySelectorAll('.ant-select-dropdown .ant-select-item-option'),
    )
    const target = options.find((o) => o.textContent.includes('运营部'))
    target?.click()
  })
  await sleep(1500)
  const transferText = await page.evaluate(
    () => document.querySelector('.ant-transfer')?.textContent ?? '',
  )
  report('Transfer 渲染且右列包含已绑定模板', transferText.includes(templateName))

  // ---------- 用户端 ----------
  await page.evaluate(() => localStorage.clear())
  await login(page, 'op1', 'pw123')
  await page.waitForFunction(() => location.pathname === '/workspace', { timeout: 20000 })
  await sleep(1500)
  const listText = await page.evaluate(() => document.body.textContent)
  report('用户端工作台展示有权限的模板', listText.includes(templateName))

  await page.evaluate((name) => {
    const cards = Array.from(document.querySelectorAll('.ant-card'))
    const target = cards.find((c) => c.textContent.includes(name))
    target?.click()
  }, templateName)
  await page.waitForFunction(() => location.pathname.includes('/workspace/templates/'), {
    timeout: 15000,
  })
  await waitCanvas(page, 'body')
  await sleep(2000)
  report('用户填报视图全屏 Univer 渲染', true)

  // 填几个单元格再保存（通过 evaluate 点击表格区域较复杂，直接点保存草稿验证接口即可）
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    btns.find((b) => b.textContent.replace(/\s+/g, '') === '保存草稿')?.click()
  })
  await page.waitForFunction(() => document.body.textContent.includes('草稿已保存'), {
    timeout: 20000,
  })
  report('用户保存填报草稿成功', true, `period=${currentPeriod()}`)

  await browser.close()
  if (pageErrors.length > 0) {
    console.log('页面 JS 异常:', pageErrors)
  }
  if (results.some((r) => !r) || pageErrors.length > 0) {
    console.log('\nE2E 存在失败项')
    process.exit(1)
  }
  console.log('\nE2E ALL PASSED')
}

main().catch((e) => {
  console.error('E2E FAILED:', e.message)
  process.exit(1)
})

