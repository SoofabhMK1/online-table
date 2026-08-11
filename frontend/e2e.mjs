// 阶段五全栈端到端测试：管理端建表 + 权限绑定 + 用户端填报保存。
import axios from 'axios'
import { Reporter, uniqueSuffix, currentPeriod, sleep, BASE } from './e2e_helpers.mjs'

const CREATE_MODAL = '.ant-modal:has(#name)'

async function main() {
  const r = new Reporter('E2E')
  const ah = await r.apiLogin('admin', 'admin123')

  const browser = await r.launchBrowser()
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  // 脚本唯一资源名（幂等：每次运行不冲突）
  const templateName = `测试模板${uniqueSuffix()}`

  try {
    // ---------- 管理端 ----------
    await r.login(page, 'admin', 'admin123')
    await r.gotoWithRetry(page, `${BASE}/admin/templates`, '.ant-menu')
    r.report('管理端登录并进入 /admin/templates', true)

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === '新建模板',
      )
      btn?.click()
    })
    await r.waitCanvas(page, CREATE_MODAL, 15000)
    const modalCanvas = await page.evaluate(
      (sel) => document.querySelector(sel)?.querySelectorAll('canvas').length ?? 0,
      CREATE_MODAL,
    )
    r.report('Modal 内 Univer 已渲染', modalCanvas > 0)

    await page.type('#name', templateName)
    await page.type('input[placeholder="如：B3"]', 'A1')
    await page.evaluate((sel) => {
      const modal = document.querySelector(sel)
      const btns = Array.from(modal?.querySelectorAll('.ant-modal-footer button') ?? [])
      btns.find((b) => b.textContent?.replace(/\s+/g, '') === '保存')?.click()
    }, CREATE_MODAL)
    await page.waitForFunction(
      (name) =>
        document.body.textContent.includes('模板创建成功') &&
        document.body.textContent.includes(name),
      { timeout: 20000 },
      templateName,
    )
    r.report('Modal 内在线建表并保存成功', true, `模板=${templateName}`)

    // 编辑弹窗可打开
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.ant-table-tbody button'))
      btns.forEach((b) => {
        if (b.textContent?.trim() === '编辑') b.click()
      })
    })
    await page.waitForSelector(CREATE_MODAL, { timeout: 15000 })
    await r.waitCanvas(page, CREATE_MODAL)
    await sleep(1000)
    r.report('编辑弹窗打开且 Univer 渲染', true)
    await r.clickByText(page, '取消', CREATE_MODAL)
    await sleep(800)

    // 通过 API 将模板绑定给 运营部 角色
    const roles = (await axios.get(`${BASE}/api/admin/roles`, { headers: ah })).data
    const opRole = roles.find((r) => r.name === '运营部')
    const templates = (await axios.get(`${BASE}/api/templates`, { headers: ah })).data
    const created = templates.find((t) => t.name === templateName)
    const bind = await axios.post(
      `${BASE}/api/admin/roles/${opRole.id}/templates`,
      { template_ids: [created.id] },
      { headers: ah },
    )
    r.report('API 绑定模板到运营部', bind.status === 200, `role=${opRole.name} tid=${created.id}`)

    // 权限配置 Tab：Transfer 渲染并反映绑定
    await r.clickByText(page, '模板权限')
    await page.waitForSelector('.ant-transfer', { timeout: 15000 })
    await sleep(800)
    await page.click('.ant-select-content')
    await page.waitForSelector('.ant-select-dropdown .ant-select-item-option', {
      timeout: 15000,
    })
    await page.evaluate(() => {
      const options = Array.from(
        document.querySelectorAll('.ant-select-dropdown .ant-select-item-option'),
      )
      const target = options.find((o) => o.textContent?.includes('运营部'))
      target?.click()
    })
    await sleep(1500)
    const transferText = await page.evaluate(
      () => document.querySelector('.ant-transfer')?.textContent ?? '',
    )
    r.report('Transfer 渲染且右列包含已绑定模板', transferText.includes(templateName))

    // ---------- 用户端 ----------
    await page.evaluate(() => localStorage.clear())
    await r.login(page, 'op1', 'pw123')
    await page.waitForFunction(() => location.pathname === '/workspace', { timeout: 20000 })
    await sleep(1500)
    const listText = await page.evaluate(() => document.body.textContent)
    r.report('用户端工作台展示有权限的模板', listText.includes(templateName))

    await page.evaluate((name) => {
      const cards = Array.from(document.querySelectorAll('.ant-card'))
      const target = cards.find((c) => c.textContent?.includes(name))
      target?.click()
    }, templateName)
    await page.waitForFunction(() => location.pathname.includes('/workspace/templates/'), {
      timeout: 15000,
    })
    await r.waitCanvas(page, 'body')
    await sleep(2000)
    r.report('用户填报视图全屏 Univer 渲染', true)

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      btns.find((b) => b.textContent?.replace(/\s+/g, '') === '保存草稿')?.click()
    })
    await page.waitForFunction(() => document.body.textContent.includes('草稿已保存'), {
      timeout: 20000,
    })
    r.report('用户保存填报草稿成功', true, `period=${currentPeriod()}`)

    if (pageErrors.length > 0) {
      console.log('页面 JS 异常:', pageErrors)
    }
    r.report('无未捕获 JS 异常', pageErrors.length === 0, `errors=${pageErrors.length}`)
  } finally {
    // 清理本脚本创建的模板（archive 替代 DELETE：保留绑定 + 历史，但本脚本不依赖）
    try {
      const tplList = (await axios.get(`${BASE}/api/templates`, { headers: ah })).data
      const t = tplList.find((x) => x.name === templateName)
      if (t) {
        await axios.post(
          `${BASE}/api/templates/${t.id}/archive`,
          {},
          { headers: ah },
        ).catch(() => {})
      }
    } catch { /* ignore */ }
    await browser.close()
  }

  r.finalize()
}

main().catch((e) => {
  console.error('E2E FAILED:', e.message)
  process.exit(1)
})