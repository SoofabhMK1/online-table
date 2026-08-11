// 阶段二：组织架构 UI CRUD 端到端测试。
// 覆盖 OrgPage：新增标签（UI） / 删除空标签（UI） / 删除有子级主体（UI 错误反馈）。
// 策略：
// 1. API 预置「业务板块 + 主体 + 部门」（测「删除有子级应失败」）
// 2. 浏览器进入 OrgPage
// 3. 点选预置板块 → UI 操作新增空标签
// 4. UI 删除空标签 → 验证 API 真删
// 5. UI 尝试删除该有子级主体 → 验证 UI 显示「删除失败」消息
import axios from 'axios'
import { Reporter, uniqueSuffix, BASE, sleep } from './e2e_helpers.mjs'

async function main() {
  const r = new Reporter('ORG')
  const ah = await r.apiLogin('admin', 'admin123')

  const browser = await r.launchBrowser()
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  // API 预置：板块 + 主体 + 部门（用于测「删除有子级」失败）
  const segName = `E2E板块${uniqueSuffix()}`
  const entName = `E2E主体${uniqueSuffix()}`
  const deptName = `E2E部门${uniqueSuffix()}`

  let segId, entId, deptId
  try {
    const segRes = await axios.post(`${BASE}/api/admin/org/segments`, { name: segName }, { headers: ah })
    segId = segRes.data.id
    const entRes = await axios.post(
      `${BASE}/api/admin/org/entities`, { name: entName, segment_id: segId }, { headers: ah }
    )
    entId = entRes.data.id
    const deptRes = await axios.post(
      `${BASE}/api/admin/org/departments`, { name: deptName, entity_id: entId }, { headers: ah }
    )
    deptId = deptRes.data.id

    // ---------- 浏览器：进入组织架构页 ----------
    await r.login(page, 'admin', 'admin123')
    await r.gotoWithRetry(page, `${BASE}/admin/organization`, '.ant-card')
    r.report('进入组织架构页', true)

    // 强制刷新以绕过 useCachedFetch 5s 缓存
    await page.reload({ waitUntil: 'networkidle0' })
    await sleep(1500)

    // ---------- 新增空职能标签（UI 操作）----------
    const tagName = `E2E空标签${uniqueSuffix()}`
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('input')).some(
        (i) => i.placeholder === '新增职能标签'
      ),
      { timeout: 5000 },
    )
    await page.evaluate((name) => {
      const inp = Array.from(document.querySelectorAll('input'))
        .find((i) => i.placeholder === '新增职能标签')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(inp, name)
      inp.dispatchEvent(new Event('input', { bubbles: true }))
      inp.closest('.ant-space-compact').querySelector('button').click()
    }, tagName)
    await page.waitForFunction(
      (n) => document.body.textContent.includes('已新增'),
      { timeout: 10000 },
      tagName,
    )
    r.report('UI 新增职能标签成功', true, tagName)

    // 验证 API 真的入库
    const orgAfter1 = (await axios.get(`${BASE}/api/admin/org`, { headers: ah })).data
    if (!orgAfter1.tags.find((t) => t.name === tagName)) {
      throw new Error('标签未入库')
    }
    r.report('新增标签 → API 持久化', true)

    // ---------- 删除空标签（UI 操作）----------
    // 找到 tagName 对应的行（该行包含删除按钮）
    await page.evaluate((name) => {
      const rows = Array.from(document.querySelectorAll('div')).filter(
        (d) => {
          const t = (d.textContent || '').trim()
          return t === name || (t.startsWith(name) && d.style.cursor === 'default')
        }
      )
      const target = rows[0]
      if (!target) throw new Error('未找到标签行: ' + name)
      const btns = Array.from(target.querySelectorAll('.ant-btn'))
      btns[btns.length - 1].click() // 最后一个是删除
    }, tagName)
    await sleep(800)
    // Popconfirm 出现 → 点确定
    await page.evaluate(() => {
      const popBtns = Array.from(document.querySelectorAll('.ant-popover button, .ant-popconfirm button'))
      const allPrimary = popBtns.filter((b) => b.classList.contains('ant-btn-primary'))
      const target = allPrimary[allPrimary.length - 1] || popBtns[popBtns.length - 1]
      target.click()
    })
    await page.waitForFunction(
      () => document.body.textContent.includes('已删除'),
      { timeout: 10000 },
    )
    const orgAfter2 = (await axios.get(`${BASE}/api/admin/org`, { headers: ah })).data
    if (orgAfter2.tags.find((t) => t.name === tagName)) {
      throw new Error('标签未真删')
    }
    r.report('UI 删除空标签 → API 持久化', true)

    // ---------- 删除有子级主体（应显示失败提示）----------
    // 先点选预置板块（让主体列加载该板块的子级）
    await page.evaluate((segName) => {
      const rows = Array.from(document.querySelectorAll('div')).filter(
        (d) => d.style.cursor === 'pointer' && d.textContent?.includes(segName)
      )
      if (rows.length === 0) throw new Error('未找到板块行')
      rows[0].click()
    }, segName)
    await sleep(1200)
    // 现在主体列显示 entName，找该行删除按钮
    await page.evaluate((name) => {
      const rows = Array.from(document.querySelectorAll('div')).filter(
        (d) => {
          const t = (d.textContent || '').trim()
          return t === name && d.style.cursor === 'pointer'
        }
      )
      if (rows.length === 0) throw new Error('未找到主体行: ' + name)
      const btns = Array.from(rows[0].querySelectorAll('.ant-btn'))
      btns[btns.length - 1].click()
    }, entName)
    await sleep(800)
    // Popconfirm 确认
    await page.evaluate(() => {
      const popBtns = Array.from(document.querySelectorAll('.ant-popover button, .ant-popconfirm button'))
      const allPrimary = popBtns.filter((b) => b.classList.contains('ant-btn-primary'))
      const target = allPrimary[allPrimary.length - 1] || popBtns[popBtns.length - 1]
      target.click()
    })
    // 等错误消息（API 拒绝返回 detail 或「删除失败」前缀）
    await page.waitForFunction(
      () => {
        const text = document.body.textContent || ''
        return text.includes('删除失败') ||
               text.includes('无法删除') ||
               text.includes('下级') ||
               text.includes('仍被')
      },
      { timeout: 10000 },
    )
    r.report('UI 删除有子级主体 → 显示拒绝提示', true)

    // 验证主体仍存在（未被误删）
    const orgAfter3 = (await axios.get(`${BASE}/api/admin/org`, { headers: ah })).data
    const segNow = orgAfter3.segments.find((s) => s.name === segName)
    if (!segNow || !segNow.entities.find((e) => e.name === entName)) {
      throw new Error('主体被误删（API 实际拒绝了但 UI 误显示成功）')
    }
    r.report('删除失败后主体仍存在（业务规则保护）', true)

    if (pageErrors.length > 0) console.log('JS 错误:', pageErrors)
    r.report('无未捕获 JS 异常', pageErrors.length === 0)
  } finally {
    // 清理：自下而上 API 删除
    try {
      await axios.delete(`${BASE}/api/admin/org/departments/${deptId}`, { headers: ah })
    } catch {}
    try {
      await axios.delete(`${BASE}/api/admin/org/entities/${entId}`, { headers: ah })
    } catch {}
    try {
      await axios.delete(`${BASE}/api/admin/org/segments/${segId}`, { headers: ah })
    } catch {}
    await browser.close()
  }

  r.finalize()
}

main().catch((e) => {
  console.error('E2E FAILED:', e.message)
  process.exit(1)
})