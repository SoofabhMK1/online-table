// 阶段二：归档模板绑定规则端到端测试。
// 覆盖：归档后从工作台/active 列表消失 / 已绑定保留 / 尝试绑定新角色失败
import axios from 'axios'
import { Reporter, uniqueSuffix, BASE, sleep, currentPeriod } from './e2e_helpers.mjs'

async function main() {
  const r = new Reporter('ARCHIVED')
  const ah = await r.apiLogin('admin', 'admin123')

  const browser = await r.launchBrowser()
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const tplName = `ARC模板${uniqueSuffix()}`
  const period = currentPeriod()
  let tplId, roleId1, roleId2
  try {
    // 创建模板 + 角色 1（绑定）
    tplId = (await axios.post(`${BASE}/api/templates`, {
      name: tplName,
      year: new Date().getFullYear(),
      snapshot: { sheets: { s1: { id: 's1', cellData: {} } } },
    }, { headers: ah })).data.id
    roleId1 = (await axios.post(`${BASE}/api/admin/roles`, { name: `ARC角色1${uniqueSuffix()}` }, { headers: ah })).data.id
    roleId2 = (await axios.post(`${BASE}/api/admin/roles`, { name: `ARC角色2${uniqueSuffix()}` }, { headers: ah })).data.id
    await axios.post(`${BASE}/api/admin/roles/${roleId1}/templates`, {
      template_ids: [tplId],
    }, { headers: ah })
    r.report('API 预置模板 + 角色1绑定', true, `tpl=${tplId}`)

    // ---------- 浏览器：进入模板管理，归档 ----------
    await r.login(page, 'admin', 'admin123')
    await r.gotoWithRetry(page, `${BASE}/admin/templates`, '.ant-table')
    await page.waitForFunction(
      (n) => document.body.textContent.includes(n),
      { timeout: 10000 },
      tplName,
    )
    r.report('模板管理页展示模板', true)

    // 归档
    await sleep(500)
    const archiveBtnInfo = await page.evaluate((tplId) => {
      const row = document.querySelector(`tr[data-row-key="${tplId}"]`)
      if (!row) return { ok: false, reason: 'no row' }
      const btns = Array.from(row.querySelectorAll('button')).map(b => b.textContent?.trim())
      const archiveBtn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.trim() === '归档')
      if (!archiveBtn) return { ok: false, reason: 'no archive btn', btns }
      archiveBtn.click()
      return { ok: true, btns }
    }, tplId)
    console.log('归档按钮点击:', JSON.stringify(archiveBtnInfo))
    await sleep(500)
    // Popconfirm 二次确认
    await page.evaluate(() => {
      const popBtns = Array.from(document.querySelectorAll('.ant-popover button, .ant-popconfirm button'))
      const allPrimary = popBtns.filter((b) => b.classList.contains('ant-btn-primary'))
      const target = allPrimary[allPrimary.length - 1] || popBtns[popBtns.length - 1]
      target.click()
    })
    try {
      await page.waitForFunction(
        () => document.body.textContent.includes('已归档'),
        { timeout: 10000 },
      )
    } catch (e) {
      const debug = await page.evaluate(() => ({
        bodyHasArchived: document.body.textContent.includes('已归档'),
        bodyTail: document.body.textContent.slice(-400),
      }))
      console.log('归档调试:', JSON.stringify(debug))
      throw e
    }
    r.report('UI 归档模板成功', true)

    // 验证：从 active 列表消失
    await sleep(500)
    const stillActive = await page.evaluate((tplId) => {
      return !!document.querySelector(`tr[data-row-key="${tplId}"]`)
    }, tplId)
    if (stillActive) throw new Error('归档后仍出现在 active 列表')
    r.report('归档后从 active 模板列表消失', true)

    // ---------- 进入归档模板页验证 ----------
    await r.gotoWithRetry(page, `${BASE}/admin/archived`, '.ant-table')
    await page.waitForFunction(
      (n) => document.body.textContent.includes(n),
      { timeout: 10000 },
      tplName,
    )
    r.report('归档模板在「归档模板」页可见', true)

    // ---------- 验证用户工作台不可见归档模板 ----------
    // 用 op1 登录看工作台
    await page.evaluate(() => localStorage.clear())
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('#username', { timeout: 10000 })
    // 清空 username + password 后再输入
    await page.evaluate(() => {
      const u = document.querySelector('#username')
      const p = document.querySelector('#password')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(u, '')
      u.dispatchEvent(new Event('input', { bubbles: true }))
      setter.call(p, '')
      p.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.click('#username')
    await page.keyboard.type('op1')
    await page.click('#password')
    await page.keyboard.type('pw123')
    await page.click('button[type="submit"]')
    await page.waitForFunction(() => location.pathname !== '/login', { timeout: 30000 })
    await sleep(1500)
    // 直接 goto workspace
    await page.goto(`${BASE}/workspace`, { waitUntil: 'networkidle0', timeout: 30000 })
    await sleep(1500)
    // 工作台按当前月份 + 角色已绑定模板展示
    const op1WorkspaceHasTpl = await page.evaluate((n) =>
      document.body.textContent.includes(n)
    , tplName)
    if (op1WorkspaceHasTpl) {
      throw new Error('归档模板在工作台仍可见')
    }
    r.report('归档后用户工作台不可见', true)

    // ---------- 验证尝试绑定新角色被 API 拒绝 ----------
    let bindErr = null
    try {
      await axios.post(`${BASE}/api/admin/roles/${roleId2}/templates`, {
        template_ids: [tplId],
      }, { headers: ah })
    } catch (e) {
      bindErr = e
    }
    if (!bindErr || bindErr.response?.status !== 400) {
      throw new Error(`绑定归档模板应返回 400，实际 ${bindErr?.response?.status}`)
    }
    if (!bindErr.response?.data?.detail?.includes('已归档')) {
      throw new Error(`绑定归档模板 detail 应含「已归档」，实际 ${JSON.stringify(bindErr.response?.data)}`)
    }
    r.report('API 尝试绑定归档模板 → 400 + 「已归档」提示', true)

    // ---------- 验证已绑定的角色 1 仍保留绑定 ----------
    const role1Bindings = (await axios.get(`${BASE}/api/admin/roles/${roleId1}/templates`, { headers: ah })).data
    if (!role1Bindings.includes(tplId)) {
      throw new Error('归档模板失去原有绑定')
    }
    r.report('归档模板对原有角色保留绑定（历史数据）', true)

    if (pageErrors.length > 0) console.log('JS 错误:', pageErrors)
    r.report('无未捕获 JS 异常', pageErrors.length === 0)
  } finally {
    // 清理：归档的角色无其他用户，可尝试删除（confirm_name 不对会被拒，跳过）
    await browser.close()
  }

  r.finalize()
}

main().catch((e) => {
  console.error('E2E FAILED:', e.message, e.stack)
  process.exit(1)
})