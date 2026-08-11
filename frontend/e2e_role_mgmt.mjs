// 阶段二：角色管理 UI 端到端测试。
// 覆盖 RolesPage：UI 编辑（改名）/ UI 重置密码 / UI 删除（ConfirmDialog 错名拒 + 对名成功）
// 新增角色用 API 准备（级联 Select 交互复杂），UI 部分聚焦列表操作。
import axios from 'axios'
import { Reporter, uniqueSuffix, BASE, sleep } from './e2e_helpers.mjs'

async function main() {
  const r = new Reporter('ROLE')
  const ah = await r.apiLogin('admin', 'admin123')

  const browser = await r.launchBrowser()
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  // 唯一前缀避免重跑冲突
  const roleName = `E2E角色${uniqueSuffix()}`
  const renamed = `${roleName}_改名`

  // API 预置组织（让重置密码后改密可登录的对比）
  const segName = `E2E板块${uniqueSuffix()}`
  const entName = `E2E主体${uniqueSuffix()}`
  const deptName = `E2E部门${uniqueSuffix()}`
  const tagName = `E2E标签${uniqueSuffix()}`

  let segId, entId, deptId, tagId, roleId
  try {
    segId = (await axios.post(`${BASE}/api/admin/org/segments`, { name: segName }, { headers: ah })).data.id
    entId = (await axios.post(`${BASE}/api/admin/org/entities`, { name: entName, segment_id: segId }, { headers: ah })).data.id
    deptId = (await axios.post(`${BASE}/api/admin/org/departments`, { name: deptName, entity_id: entId }, { headers: ah })).data.id
    tagId = (await axios.post(`${BASE}/api/admin/org/tags`, { name: tagName }, { headers: ah })).data.id
    // API 创建角色（替代 UI 新增 Modal 的级联选择）
    const created = (await axios.post(`${BASE}/api/admin/roles`, {
      name: roleName,
      department_id: deptId,
      function_tag_id: tagId,
    }, { headers: ah })).data
    roleId = created.id
    r.report('API 预置角色（含组织分类）', true, `id=${roleId} ${roleName}`)

    // ---------- 浏览器 ----------
    await r.login(page, 'admin', 'admin123')
    await r.gotoWithRetry(page, `${BASE}/admin/roles`, '.ant-card')
    // 等表格加载
    await page.waitForFunction(
      (n) => document.body.textContent.includes(n),
      { timeout: 10000 },
      roleName,
    )
    r.report('角色列表展示预置角色', true)

    // ---------- 编辑角色（改名）----------
    await sleep(500)
    const editClickInfo = await page.evaluate((roleId) => {
      const row = document.querySelector(`tr[data-row-key="${roleId}"]`)
      if (!row) return { ok: false, reason: 'no row', roleId }
      const btns = Array.from(row.querySelectorAll('button')).map(b => b.textContent?.trim())
      const editBtn = btns.find((t) => t === '编辑')
      if (!editBtn) return { ok: false, reason: 'no edit btn', btns }
      const btn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.trim() === '编辑')
      btn.click()
      return { ok: true }
    }, roleId)
    console.log('编辑按钮点击:', JSON.stringify(editClickInfo))
    await page.waitForSelector('.ant-modal-title', { timeout: 5000 })
    await sleep(800)
    // 清空 input（用 evaluate 直接 set value + 触发 React onChange）
    await page.evaluate((newName) => {
      const inp = Array.from(document.querySelectorAll('.ant-modal input'))
        .find((i) => i.placeholder === '例如：预算编制')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(inp, '')
      inp.dispatchEvent(new Event('input', { bubbles: true }))
      // 再设置新值（让 React state 接收）
      setter.call(inp, newName)
      inp.dispatchEvent(new Event('input', { bubbles: true }))
      // blur 触发 antd 表单同步
      inp.dispatchEvent(new Event('blur', { bubbles: true }))
    }, renamed)
    await sleep(500)
    const inputVal = await page.evaluate(() => {
      const i = document.querySelector('.ant-modal input[placeholder="例如：预算编制"]')
      return i?.value
    })
    console.log('input value after type:', inputVal)
    if (inputVal !== renamed) {
      throw new Error(`输入框值未正确：期望 ${renamed}，实际 ${inputVal}`)
    }
    await page.evaluate(() => {
      const okBtn = Array.from(document.querySelectorAll('.ant-modal-footer button'))
        .find((b) => b.textContent?.replace(/\s+/g, '') === '保存')
      if (okBtn) okBtn.click()
    })
    try {
      await page.waitForFunction(
        (n) => document.body.textContent.includes('角色已更新') && document.body.textContent.includes(n),
        { timeout: 10000 },
        renamed,
      )
    } catch (e) {
      const debugState = await page.evaluate(() => ({
        modalExists: !!document.querySelector('.ant-modal'),
        modalTitle: document.querySelector('.ant-modal-title')?.textContent,
        bodyHasUpdate: document.body.textContent.includes('角色已更新'),
        bodyTail: document.body.textContent.slice(-400),
      }))
      console.log('编辑失败调试:', JSON.stringify(debugState))
      throw e
    }
    r.report('UI 编辑角色（改名）成功', true, renamed)

    // ---------- 重置密码 ----------
    await sleep(800)
    await page.evaluate((roleId) => {
      const row = document.querySelector(`tr[data-row-key="${roleId}"]`)
      const resetBtn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('重置密码'))
      resetBtn.click()
    }, roleId)
    await sleep(500)
    // Popconfirm 确认
    await page.evaluate(() => {
      const popBtns = Array.from(document.querySelectorAll('.ant-popconfirm button, .ant-popover button'))
      const okBtn = popBtns.find((b) => b.classList.contains('ant-btn-primary'))
      if (okBtn) okBtn.click()
    })
    await page.waitForFunction(
      () => document.body.textContent.includes('密码已重置'),
      { timeout: 10000 },
    )
    // 验证重置：默认账号可用 123456 登录
    const defaultUsername = created.default_username
    const loginRes = await axios.post(`${BASE}/api/auth/login`, {
      username: defaultUsername,
      password: '123456',
    })
    if (loginRes.status !== 200) {
      throw new Error('重置密码后默认密码登录失败')
    }
    r.report('UI 重置密码 → 默认账号 123456 可登', true, defaultUsername)

    // ---------- 删除角色 ConfirmDialog 错名 → 拒 ----------
    await sleep(800)
    const delClickInfo = await page.evaluate((roleId) => {
      const row = document.querySelector(`tr[data-row-key="${roleId}"]`)
      if (!row) return { ok: false, reason: 'no row' }
      const btns = Array.from(row.querySelectorAll('button')).map(b => b.textContent?.trim())
      const delBtn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.trim() === '删除')
      if (!delBtn) return { ok: false, reason: 'no del btn', btns }
      delBtn.click()
      return { ok: true }
    }, roleId)
    console.log('删除按钮点击:', JSON.stringify(delClickInfo))
    // 等 ConfirmDialog（带 confirm 名称输入框）
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.ant-modal input')).some(
        (i) => i.placeholder && i.placeholder.length > 0
      ),
      { timeout: 5000 },
    )
    await sleep(500)
    // 输错名字
    await page.evaluate(() => {
      const ph = document.querySelector('.ant-modal strong')?.textContent
      const inp = Array.from(document.querySelectorAll('.ant-modal input'))
        .find((i) => i.placeholder === ph)
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(inp, '错名')
      inp.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await sleep(300)
    await page.evaluate(() => {
      const okBtn = Array.from(document.querySelectorAll('.ant-modal-footer button'))
        .find((b) => b.textContent?.replace(/\s+/g, '') === '确认删除')
      if (okBtn) okBtn.click()
    })
    await sleep(2000)
    const rolesAfterWrong = (await axios.get(`${BASE}/api/admin/roles`, { headers: ah })).data
    if (!rolesAfterWrong.find((r) => r.id === roleId)) {
      throw new Error('错名也删了，ConfirmDialog 校验失败')
    }
    r.report('删除角色 ConfirmDialog 错名 → 拒绝（角色仍在）', true)

    // ---------- 取消 ConfirmDialog，输对名，确认删除 ----------
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('.ant-modal-footer button'))
        .find((b) => b.textContent?.replace(/\s+/g, '') === '取消')
      if (cancelBtn) cancelBtn.click()
    })
    await sleep(500)
    await page.evaluate((roleId) => {
      const row = document.querySelector(`tr[data-row-key="${roleId}"]`)
      const delBtn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.trim() === '删除')
      delBtn.click()
    }, roleId)
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.ant-modal input')).some(
        (i) => i.placeholder && i.placeholder.length > 0
      ),
      { timeout: 5000 },
    )
    await sleep(500)
    const correctNameInfo = await page.evaluate((correctName) => {
      const ph = document.querySelector('.ant-modal strong')?.textContent
      const inp = Array.from(document.querySelectorAll('.ant-modal input'))
        .find((i) => i.placeholder === ph)
      if (!inp) return { ok: false, reason: 'no input', ph }
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(inp, correctName)
      inp.dispatchEvent(new Event('input', { bubbles: true }))
      return { ok: true, value: inp.value, ph }
    }, renamed)
    console.log('输对名:', JSON.stringify(correctNameInfo))
    await page.evaluate(() => {
      const okBtn = Array.from(document.querySelectorAll('.ant-modal-footer button'))
        .find((b) => b.textContent?.replace(/\s+/g, '') === '确认删除')
      if (okBtn) okBtn.click()
    })
    try {
      await page.waitForFunction(
        () => document.body.textContent.includes('角色已删除'),
        { timeout: 10000 },
      )
    } catch (e) {
      const debugState = await page.evaluate(() => ({
        bodyHasDeleted: document.body.textContent.includes('角色已删除'),
        bodyHasFailure: document.body.textContent.includes('删除失败'),
        modalOpen: !!document.querySelector('.ant-modal'),
        bodyTail: document.body.textContent.slice(-400),
      }))
      console.log('删除失败调试:', JSON.stringify(debugState))
      throw e
    }
    const rolesFinal = (await axios.get(`${BASE}/api/admin/roles`, { headers: ah })).data
    if (rolesFinal.find((r) => r.id === roleId)) {
      throw new Error('角色未真删')
    }
    r.report('UI 删除角色（ConfirmDialog 对名）→ API 持久化', true)

    if (pageErrors.length > 0) console.log('JS 错误:', pageErrors)
    r.report('无未捕获 JS 异常', pageErrors.length === 0)
  } finally {
    try { await axios.delete(`${BASE}/api/admin/org/departments/${deptId}`, { headers: ah }) } catch {}
    try { await axios.delete(`${BASE}/api/admin/org/entities/${entId}`, { headers: ah }) } catch {}
    try { await axios.delete(`${BASE}/api/admin/org/segments/${segId}`, { headers: ah }) } catch {}
    try { await axios.delete(`${BASE}/api/admin/org/tags/${tagId}`, { headers: ah }) } catch {}
    await browser.close()
  }

  r.finalize()
}

main().catch((e) => {
  console.error('E2E FAILED:', e.message)
  process.exit(1)
})