/**
 * e2e 脚本共享辅助：登录、报告、Chrome 启动、可变 BASE、清理。
 * 设计原则：
 * - BASE 优先取自 E2E_BASE 环境变量（CI 可换端口），缺省 5173。
 * - 所有资源（角色、模板）使用 Date.now() 后缀避免互踩。
 * - report 收集成功/失败，最后统一打印 + 非零退出。
 * - launch() 返回的 browser 必须在 finally 中 close。
 */
import puppeteer from 'puppeteer-core'
import axios from 'axios'

export const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
export const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
export const HEADLESS = process.env.CI === 'true' ? true : 'new'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const currentPeriod = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 在脚本运行期内全局唯一的资源名前缀（避免与已有数据冲突）。 */
export const uniqueSuffix = () => Date.now().toString(36).slice(-6)

/** 报告收集器：所有断言通过 report(...) 注册，最后统一打印并设置退出码。 */
export class Reporter {
  constructor(label = 'E2E') {
    this.label = label
    this.results = []
  }
  report(name, ok, extra = '') {
    this.results.push({ name, ok, extra })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
  }
  async login(page, username, password) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: 60000 })
    await page.waitForSelector('#username', { timeout: 30000 })
    await page.type('#username', username)
    await page.type('#password', password)
    await page.click('button[type="submit"]')
    await page.waitForFunction(() => location.pathname !== '/login', { timeout: 30000 })
  }
  /** 后端登录，拿到 Bearer header 用于后续 axios 调用。 */
  async apiLogin(username, password) {
    const res = await axios.post(`${BASE}/api/auth/login`, { username, password })
    return { Authorization: `Bearer ${res.data.access_token}` }
  }
  /** 浏览器打开 URL，自动重试以规避 Vite 首次依赖优化的 504。 */
  async gotoWithRetry(page, url, selector, timeout = 60000) {
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
  /** 等待容器/页面内出现 canvas（Univer 渲染标记）。 */
  async waitCanvas(page, containerSelector = 'body', timeout = 30000) {
    await page.waitForFunction(
      (sel) => {
        const root = sel ? document.querySelector(sel) : document
        return !!root?.querySelectorAll('canvas').length
      },
      { timeout },
      containerSelector,
    )
  }
  /** 通过文本点击按钮/元素；找不到抛错。 */
  async clickByText(page, text, containerSel = 'body') {
    const clicked = await page.evaluate(
      (t, sel) => {
        const root = sel === 'body' ? document.body : document.querySelector(sel)
        const els = Array.from(root?.querySelectorAll('button, a, span, div') ?? [])
        const target = els.find(
          (el) => el.textContent?.replace(/\s+/g, '') === t.replace(/\s+/g, ''),
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
  /** 启动 puppeteer；HEADLESS 由环境变量决定。 */
  async launchBrowser() {
    return puppeteer.launch({
      executablePath: CHROME,
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
  /** 打印汇总并以 0/1 退出。 */
  finalize(exit = true) {
    const pass = this.results.filter((r) => r.ok).length
    const total = this.results.length
    console.log(`\n${this.label}: total pass: ${pass} / ${total}`)
    if (!exit) return this.results.some((r) => !r.ok)
    if (this.results.some((r) => !r.ok)) process.exit(1)
    console.log(`${this.label} ALL PASSED`)
    process.exit(0)
  }
}