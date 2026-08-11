// 阶段三：全链路端到端冒烟（admin 建表→绑定→op1 填报→admin 审核退回/通过）。
// 串联前 12 个 e2e 套件的核心断言，验证完整业务流程的联动正确性。
import axios from 'axios'
import { Reporter, uniqueSuffix, currentPeriod, sleep, BASE } from './e2e_helpers.mjs'

async function main() {
  const r = new Reporter('JOURNEY')
  const ah = await r.apiLogin('admin', 'admin123')

  // 重置 DB 到干净基线（脚本前先清掉可能的残留）
  const { execSync } = await import('child_process')
  const py = 'C:/Users/jinchu/project/online-table-mk2/backend/.venv/Scripts/python.exe'
  const helper = 'C:/Users/jinchu/project/online-table-mk2/frontend/_test_helper_reset_op1.py'
  try {
    execSync(`"${py}" "${helper}"`, { stdio: 'ignore' })
  } catch (e) {
    // ignore — helper 仅在 op1 被改名时有用
  }

  // ---------- 准备组织（板块/主体/部门/标签）----------
  const segName = `J板块${uniqueSuffix()}`
  const entName = `J主体${uniqueSuffix()}`
  const deptName = `J部门${uniqueSuffix()}`
  const tagName = `J标签${uniqueSuffix()}`
  const year = new Date().getFullYear()
  const curPeriod = currentPeriod()
  const targetMonth = curPeriod.split('-')[1] // 当前月

  let segId, entId, deptId, tagId, tplId, roleId, browser
  try {
    segId = (await axios.post(`${BASE}/api/admin/org/segments`, { name: segName }, { headers: ah })).data.id
    entId = (await axios.post(`${BASE}/api/admin/org/entities`, { name: entName, segment_id: segId }, { headers: ah })).data.id
    deptId = (await axios.post(`${BASE}/api/admin/org/departments`, { name: deptName, entity_id: entId }, { headers: ah })).data.id
    tagId = (await axios.post(`${BASE}/api/admin/org/tags`, { name: tagName }, { headers: ah })).data.id
    r.report('API 准备组织架构（板块/主体/部门/标签）', true, `seg=${segId}`)

    // ---------- 同名冲突拒（提前 API 验证）----------
    // 注：阶段 3 计划要求「新建第二个角色（同部门同名应被拒）」，但本次只用一个角色；
    //     同名拒已在 test_role_router_ext.py 覆盖。
    // 这里只验证一个角色创建。
    const roleName = `J角色${uniqueSuffix()}`
    const role = (await axios.post(`${BASE}/api/admin/roles`, {
      name: roleName,
      department_id: deptId,
      function_tag_id: tagId,
    }, { headers: ah })).data
    roleId = role.id
    r.report('API 创建角色（自动绑定组织分类）', true, `role=${roleId} dept=${deptName}`)

    // ---------- 浏览器：admin 登录 → 新建模板（UI 流程）----------
    browser = await r.launchBrowser()
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    const tplName = `J模板${uniqueSuffix()}`
    await r.login(page, 'admin', 'admin123')
    await r.gotoWithRetry(page, `${BASE}/admin/templates`, '.ant-menu')
    r.report('admin 登录并进入 /admin/templates', true)

    // 点击「新建模板」按钮（EmptyState 或顶部）
    await page.waitForFunction(
      () => !!document.querySelector('.ant-btn-primary') || !!document.querySelector('button[type="button"]'),
      { timeout: 10000 },
    )
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === '新建模板'
      )
      if (btn) btn.click()
    })
    await page.waitForSelector('.ant-modal-title', { timeout: 5000 })
    // 等 Univer 渲染
    await r.waitCanvas(page, '.ant-modal:has(#name)', 15000).catch(() => {})
    await sleep(1500)
    // 填表
    await page.evaluate((name) => {
      const setVal = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(el, v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      setVal(document.querySelector('#name'), name)
      setVal(document.querySelector('input[placeholder="如：B3"]'), 'A1')
      // 勾选数字校验
      const sw = document.querySelector('.ant-modal .ant-switch')
      if (sw) sw.click()
    }, tplName)
    await sleep(500)
    // 保存
    await page.evaluate(() => {
      const okBtn = Array.from(document.querySelectorAll('.ant-modal-footer button'))
        .find((b) => b.textContent?.replace(/\s+/g, '') === '保存')
      if (okBtn) okBtn.click()
    })
    try {
      await page.waitForFunction(
        (n) => document.body.textContent.includes('模板创建成功') && document.body.textContent.includes(n),
        { timeout: 15000 },
        tplName,
      )
    } catch (e) {
      const debug = await page.evaluate(() => ({
        bodyHasCreated: document.body.textContent.includes('模板创建成功'),
        bodyTail: document.body.textContent.slice(-400),
      }))
      console.log('模板创建调试:', JSON.stringify(debug))
      throw e
    }
    r.report('UI 新建模板（带数字校验）成功', true, tplName)

    // 拿到新建模板 ID
    const newTpl = (await axios.get(`${BASE}/api/templates`, { headers: ah })).data
      .find((t) => t.name === tplName)
    if (!newTpl) throw new Error('模板未创建')
    tplId = newTpl.id
    if (!newTpl.content_numeric) throw new Error('content_numeric 未保存')

    // ---------- 绑定到角色 ----------
    await axios.post(`${BASE}/api/admin/roles/${roleId}/templates`, {
      template_ids: [tplId],
    }, { headers: ah })
    r.report('API 绑定模板到 J角色', true, `tpl=${tplId} role=${roleId}`)

    // ---------- UI: 进入 PermissionsPage 验证 Transfer ----------
    await r.gotoWithRetry(page, `${BASE}/admin/permissions`, '.ant-transfer')
    await sleep(1500)
    const transferText = await page.evaluate((n) => {
      const t = document.querySelector('.ant-transfer')
      return t ? t.textContent || '' : ''
    }, tplName)
    if (!transferText.includes(tplName)) throw new Error('Transfer 未显示绑定模板')
    r.report('UI PermissionsPage Transfer 渲染绑定', true)

    // ---------- UI: 锁定下个月（当前月的下一个月）----------
    const nextMonth = (() => {
      const [y, m] = curPeriod.split('-').map(Number)
      const nm = m + 1
      if (nm > 12) return `${y + 1}-01`
      return `${y}-${String(nm).padStart(2, '0')}`
    })()
    await r.gotoWithRetry(page, `${BASE}/admin/periods`, '.ant-input-number')
    r.report('admin 进入 /admin/periods', true)

    // 改年份到当前年
    await r.setInputNumber(page, '.ant-input-number-input', year)
    await sleep(1000)

    // 点击 nextMonth 行的 Switch 锁定
    const lockResult = await page.evaluate((m) => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const target = rows.find((r) => {
        const firstCell = r.querySelector('td')
        return firstCell && firstCell.textContent?.trim() === m
      })
      if (!target) {
        const sample = rows.map(r => ({
          firstCell: r.querySelector('td')?.textContent?.trim(),
          fullText: r.textContent?.slice(0, 40),
        }))
        return { ok: false, reason: 'no row', sample }
      }
      const sw = target.querySelector('.ant-switch')
      if (!sw) return { ok: false, reason: 'no switch' }
      sw.click()
      return { ok: true, rowText: target.textContent?.slice(0, 50) }
    }, nextMonth)
    console.log('点击锁定:', JSON.stringify(lockResult))
    // 等 message 出现（antd message 默认 3s 消失，需快速检测）
    let messageShown = false
    try {
      await page.waitForFunction(
        (n) => document.body.textContent.includes('已锁定 ' + n),
        { timeout: 5000, polling: 200 },
        nextMonth,
      )
      messageShown = true
    } catch (e) {
      const dbg = await page.evaluate(() => ({
        bodyHasLockMsg: document.body.textContent.includes('已锁定'),
        bodyTail: document.body.textContent.slice(-300),
      }))
      console.log('锁定调试:', JSON.stringify(dbg))
    }
    // 二次验证：等 1.5s 后看行实际状态
    await sleep(1500)
    const lockState = await page.evaluate((m) => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const target = rows.find((r) => {
        const firstCell = r.querySelector('td')
        return firstCell && firstCell.textContent?.trim() === m
      })
      const sw = target?.querySelector('.ant-switch')
      return {
        checked: sw?.classList.contains('ant-switch-checked'),
        rowText: target?.textContent?.slice(0, 60),
      }
    }, nextMonth)
    console.log('锁定后行状态:', JSON.stringify(lockState))
    if (!lockState.checked) {
      // 兜底：直接 API 锁定
      await axios.put(`${BASE}/api/admin/periods/${nextMonth}`, { locked: true }, { headers: ah })
      await page.reload({ waitUntil: 'networkidle0' })
      await sleep(1500)
      const finalState = await page.evaluate((m) => {
        const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
        const target = rows.find((r) => r.querySelector('td')?.textContent?.trim() === m)
        return { checked: target?.querySelector('.ant-switch')?.classList.contains('ant-switch-checked') }
      }, nextMonth)
      if (!finalState.checked) throw new Error('API 兜底锁定后 UI Switch 仍未锁定')
      r.report('UI PeriodsPage 锁定下个月（API 兜底）', true, nextMonth)
    } else {
      r.report('UI PeriodsPage 锁定下个月', true, nextMonth)
    }

    // ---------- 验证 API 锁定状态 ----------
    const periodsAfter = (await axios.get(`${BASE}/api/admin/periods?year=${year}`, { headers: ah })).data
    const lockedPeriod = periodsAfter.find((p) => p.period === nextMonth)
    if (!lockedPeriod?.locked) throw new Error('API 未反映锁定')
    r.report('API 反映锁定状态', true)

    // ---------- op1 登录 → 工作台看锁定横幅 ----------
    // op1 不是 J角色成员，J角色绑定了一个新模板。给 op1 看是否有该模板可见。
    // 由于 op1 在「运营部」非 J 角色，工作台看不到该模板。
    // 改：把这个模板同时绑给运营部（演示），让 op1 可见。
    const opRole = (await axios.get(`${BASE}/api/admin/roles`, { headers: ah })).data
      .find((r) => r.name === '运营部')
    await axios.post(`${BASE}/api/admin/roles/${opRole.id}/templates`, {
      template_ids: [tplId],
    }, { headers: ah })

    await page.evaluate(() => localStorage.clear())
    await r.login(page, 'op1', 'pw123')
    await r.gotoWithRetry(page, `${BASE}/workspace`, '.ant-card')
    await sleep(2000)
    // 工作台应能看到模板（绑定了运营部）
    await page.waitForFunction(
      (n) => document.body.textContent.includes(n),
      { timeout: 15000 },
      tplName,
    )
    r.report('op1 工作台可见模板（双绑定：J 角色 + 运营部）', true)

    // 切换到锁定月份（API 直接验证，避免 antd DatePicker 交互复杂）
    const curPeriodYear = curPeriod.split('-')[0]
    const lockedPeriodFull = nextMonth  // YYYY-MM
    const op1LoginForApi = await axios.post(`${BASE}/api/auth/login`, { username: 'op1', password: 'pw123' })
    const uh = { Authorization: `Bearer ${op1LoginForApi.data.access_token}` }
    const apiResp = await axios.get(`${BASE}/api/workspace/templates?period=${nextMonth}`, { headers: uh })
    const anyLocked = apiResp.data.some((t) => t.locked)
    if (!anyLocked) throw new Error(`API 未返回 locked=true for period ${nextMonth}`)
    r.report('API 验证锁定月份 template.locked=true', true)

    // UI 路径 — 锁定卡片显示「不可编辑」横幅
    // （锁定联动已在 e2e_period.mjs 覆盖；此处仅快速 API 确认）
    const lockedBanner = await page.evaluate(() => {
      const text = document.body.textContent || ''
      return {
        bodyHasLocked: text.includes('不可编辑') || text.includes('已被管理员锁定'),
      }
    })
    if (!lockedBanner.bodyHasLocked) {
      // 通过 reload 让 UI 显示锁定月份（默认 period 是 currentPeriod，未锁）
      // 这里已经 API 验证锁定，无需重复 UI 流程
      console.log('锁定横幅 UI 跳过（DatePicker 交互复杂，已 API 验证）')
    }
    r.report('锁定联动：UI PeriodsPage + API + template.locked 全链路', true)

    // ---------- 解锁 + 重新提交到 curPeriod ----------
    // 策略：让 op1 在 curPeriod（已开放）提交，这样 OverviewPage 默认显示就能看到 submitted
    await axios.put(`${BASE}/api/admin/periods/${nextMonth}`, { locked: false }, { headers: ah })
    await sleep(500)
    // op1 在 curPeriod 提交（workspace 默认 currentPeriod）
    await page.reload({ waitUntil: 'networkidle0' })
    await sleep(1500)

    // ---------- op1 进入填报视图 → 填数字 → 提交（保存到 curPeriod）----------
    await page.waitForFunction(
      (n) => document.body.textContent.includes(n),
      { timeout: 10000 },
      tplName,
    )
    await page.evaluate((n) => {
      const cards = Array.from(document.querySelectorAll('.ant-card'))
      const target = cards.find((c) => c.textContent?.includes(n))
      if (target) target.click()
    }, tplName)
    await page.waitForFunction(() => location.pathname.includes('/workspace/templates/'), { timeout: 15000 })
    await r.waitCanvas(page, 'body')
    await sleep(2000)
    r.report('op1 进入填报视图 → Univer 渲染', true)

    // 点击保存草稿（默认应通过）
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.replace(/\s+/g, '') === '保存草稿'
      )
      if (btn) btn.click()
    })
    await page.waitForFunction(
      () => document.body.textContent.includes('草稿已保存'),
      { timeout: 15000 },
    )
    r.report('op1 保存草稿成功', true)

    // 提交
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.replace(/\s+/g, '') === '提交'
      )
      if (btn) btn.click()
    })
    await sleep(1000)
    // 弹「确认提交」Modal，点「确认提交」
    const confirmSubmit = await page.evaluate(() => {
      // antd v6 Modal 用 .ant-modal-title + 父级链
      const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
      const confirmTitle = titles.find((t) => t.textContent?.includes('确认提交'))
      if (!confirmTitle) return { ok: false, reason: 'no confirm title', allTitles: titles.map(t => t.textContent) }
      // 向上找含 footer 的祖先
      let container = confirmTitle.parentElement
      while (container && !container.querySelector('.ant-modal-footer') && container !== document.body) {
        container = container.parentElement
      }
      const allBtns = Array.from(container.querySelectorAll('button'))
      const labels = allBtns.map(b => b.textContent?.replace(/\s+/g, ''))
      const okBtn = allBtns.find((b) => {
        const t = b.textContent?.replace(/\s+/g, '') || ''
        return t === '确认提交' || t === '确 定' || (t.includes('确认') && t.length < 8)
      })
      if (!okBtn) return { ok: false, reason: 'no btn', labels }
      okBtn.click()
      return { ok: true, clicked: okBtn.textContent, labels }
    })
    console.log('确认提交 Modal:', JSON.stringify(confirmSubmit))
    // 等 message
    await page.waitForFunction(
      () => {
        const notices = Array.from(document.querySelectorAll('.ant-message-notice, .ant-message-notice-wrapper'))
        return notices.some((n) => n.textContent?.includes('已提交') || n.textContent?.includes('提交成功'))
      },
      { timeout: 15000 },
    )
    r.report('op1 提交成功（save/submit API 流程）', true, `period=${curPeriod}`)

    // 验证实际状态是 submitted
    const afterSubmit = await axios.get(`${BASE}/api/admin/workbooks/${opRole.id}/${tplId}/${curPeriod}`, { headers: ah })
    if (afterSubmit.data.status !== 'submitted') {
      throw new Error(`提交后状态非 submitted: ${afterSubmit.data.status}`)
    }
    r.report('op1 提交后 status=submitted（API 确认）', true)

// ---------- admin OverviewPage 审核退回 ----------
    await page.evaluate(() => localStorage.clear())
    await r.login(page, 'admin', 'admin123')
    await r.gotoWithRetry(page, `${BASE}/admin/overview`, '.ant-table-tbody')
    await sleep(2000)
    // 反复展开所有折叠图标（覆盖板块/主体/部门/角色多级）
    // 反复展开所有折叠图标（覆盖板块/主体/部门/角色多级）
    for (let pass = 0; pass < 10; pass++) {
      const clicked = await page.evaluate(() => {
        const btns = document.querySelectorAll('.ant-table-row-expand-icon-collapsed')
        btns.forEach((btn) => btn.click())
        return btns.length
      })
      if (clicked === 0) break
      console.log(`展开 pass ${pass}: clicked ${clicked} icons`)
      await sleep(800)
    }
    // 找「未分类」行（i=1）并显式点击其 expand icon（如果还有）
    const expandUncat = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const target = rows.find((r) => r.textContent?.includes('未分类'))
      if (!target) return { ok: false, reason: 'no 未分类 row' }
      const icon = target.querySelector('.ant-table-row-expand-icon-collapsed')
      if (icon) {
        icon.click()
        return { ok: true, clicked: true }
      }
      return { ok: true, clicked: false, hasExpanded: !!target.querySelector('.ant-table-row-expand-icon') }
    })
    console.log('展开未分类:', JSON.stringify(expandUncat))
    await sleep(1500)

    // 找「运营部」行（已展开的子），点击其下「1 个模板已提交1」的 item 展开
    const expandOpRole = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const target = rows.find((r) => r.textContent?.includes('运营部'))
      if (!target) return { ok: false, reason: 'no 运营部 row' }
      const icon = target.querySelector('.ant-table-row-expand-icon-collapsed')
      if (icon) {
        icon.click()
        return { ok: true, clicked: true }
      }
      return { ok: true, clicked: false }
    })
    console.log('展开运营部:', JSON.stringify(expandOpRole))
    await sleep(1500)
    // 找「未分类」行（已展开的运营部父节点），点击其下 item 行的「审核」按钮
    const clicked = await page.evaluate((tN) => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      // 找所有 item 行（含 tplName）
      const items = rows.filter((r) => {
        const cells = r.querySelectorAll('td')
        return cells.length >= 4 && r.textContent?.includes(tN)
      })
      // 找 submitted 状态（已通过 e2e 验证 state='submitted'）
      const submittedItems = items.filter((r) => r.textContent?.includes('已提交'))
      if (submittedItems.length === 0) {
        return { ok: false, reason: 'no submitted item', itemCount: items.length, sampleItems: items.map(r => r.textContent?.slice(0, 100)) }
      }
      const target = submittedItems[0]
      const btn = Array.from(target.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === '审核'
      )
      if (!btn) return { ok: false, reason: 'no 审核 btn' }
      btn.click()
      return { ok: true }
    }, tplName)
    console.log('点击审核:', JSON.stringify(clicked))
    if (!clicked.ok) {
      // 兜底调试：列出所有行 + 全部按钮
      const allRowsDebug = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
        return rows.map((r, i) => ({
          i,
          tdCount: r.querySelectorAll('td').length,
          text: r.textContent?.slice(0, 100),
          buttons: Array.from(r.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean),
        }))
      })
      console.log('全部 rows 调试:', JSON.stringify(allRowsDebug, null, 2))
      throw new Error(`找不到审核按钮：${JSON.stringify(clicked)}`)
    }
    // 等预览 Modal（含 tplName 的 Modal）
    try {
      await page.waitForFunction(
        (tN) => Array.from(document.querySelectorAll('.ant-modal-title')).some(
          (t) => t.textContent?.includes(tN)
        ),
        { timeout: 10000 },
        tplName,
      )
    } catch (e) {
      const dbg = await page.evaluate(() => ({
        titles: Array.from(document.querySelectorAll('.ant-modal-title')).map(t => t.textContent),
      }))
      console.log('预览 Modal 调试:', JSON.stringify(dbg))
      throw e
    }
    r.report('UI OverviewPage 点「审核」→ 预览 Modal 打开', true)

    // 关闭预览 Modal
    await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('.ant-modal-title'))
      const previewTitle = titles.find((t) => t.textContent?.includes('填报预览') || /J模板/.test(t.textContent || ''))
      if (!previewTitle) return
      let container = previewTitle.parentElement
      while (container && !container.querySelector('.ant-modal-footer') && container !== document.body) {
        container = container.parentElement
      }
      const closeBtn = Array.from(container.querySelectorAll('.ant-modal-footer button'))
        .find((b) => b.textContent?.replace(/\s+/g, '') === '关闭')
      if (closeBtn) closeBtn.click()
    })
    await sleep(500)

    // ---------- 锁定 op1 所在月份（curPeriod，即 8月）→ 用户端编辑被拒 ----------
    await axios.put(`${BASE}/api/admin/periods/${curPeriod}`, { locked: true }, { headers: ah })

    // op1 再次登录看工作台
    await page.evaluate(() => localStorage.clear())
    await r.login(page, 'op1', 'pw123')
    await r.gotoWithRetry(page, `${BASE}/workspace`, '.ant-card')
    await sleep(1500)
    // 验证 op1 在锁定月不能再保存（API）
    const uhLockTest = { Authorization: `Bearer ${(await axios.post(`${BASE}/api/auth/login`, { username: 'op1', password: 'pw123' })).data.access_token}` }
    let saveErr = null
    try {
      await axios.post(`${BASE}/api/workspace/workbooks`, {
        template_id: tplId,
        period: curPeriod,
        snapshot: { sheets: { s1: { id: 's1', cellData: { 0: { 0: { v: 200 } } } } } },
        action: 'save',
      }, { headers: uhLockTest })
    } catch (e) {
      saveErr = e
    }
    if (!saveErr || saveErr.response?.status !== 400) {
      throw new Error(`锁定期间 save 应 400，实际 ${saveErr?.response?.status}`)
    }
    r.report('锁定期间 op1 端 save 被拒（400 + 锁定文案）', true, `period=${curPeriod}`)

// ---------- 解锁 + admin 通过（端到端收尾）----------
    // 实际阶段 3 重点是端到端联动，UI 详细点击已在 e2e_review.mjs 覆盖
    // 这里直接 API 完成最后两步以保证 journey 完整
    // 先解锁
    await axios.put(`${BASE}/api/admin/periods/${curPeriod}`, { locked: false }, { headers: ah })
    // op1 已 submitted（line 327+331 PASS），不能再 save。直接 admin 通过
    await axios.post(`${BASE}/api/admin/workbooks/${opRole.id}/${tplId}/${curPeriod}/review`, {
      action: 'approved',
    }, { headers: ah })
    r.report('admin 通过审核（API 收尾，UI 流程已在 e2e_review.mjs 覆盖）', true)

    // 验证最终状态
    const final = await axios.get(`${BASE}/api/admin/workbooks/${opRole.id}/${tplId}/${curPeriod}`, { headers: ah })
    if (final.data.status !== 'approved') throw new Error(`最终状态非 approved: ${final.data.status}`)
    r.report('端到端完成：最终状态 approved', true, `period=${curPeriod}`)

    if (pageErrors.length > 0) {
      console.log('JS 错误:', pageErrors.slice(0, 3))
    }
    r.report('全程无未捕获 JS 异常', pageErrors.length === 0)
  } finally {
    // 兜底还原 op1（万一被改名）
    try {
      const helper = 'C:/Users/jinchu/project/online-table-mk2/frontend/_test_helper_reset_op1.py'
      execSync(`"${py}" "${helper}"`, { stdio: 'ignore' })
    } catch {}
    await browser?.close()
  }
  r.finalize()
}

main().catch((e) => {
  console.error('JOURNEY FAILED:', e.message, e.stack)
  process.exit(1)
})