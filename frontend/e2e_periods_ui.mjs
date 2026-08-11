// 阶段二：填报期间 PeriodsPage UI 端到端测试。
// 覆盖：12 月渲染 / Switch 切换锁定 / 切换解锁 / 成功消息 / 锁定后用户端不能保存
import axios from 'axios'
import { Reporter, uniqueSuffix, BASE, sleep, currentPeriod } from './e2e_helpers.mjs'

async function main() {
  const r = new Reporter('PERIOD-UI')
  const ah = await r.apiLogin('admin', 'admin123')

  const browser = await r.launchBrowser()
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const year = new Date().getFullYear() + 2  // 用未来年份避免与已有冲突
  const targetPeriod = `${year}-09`

  try {
    // ---------- 进入 PeriodsPage ----------
    await r.login(page, 'admin', 'admin123')
    await r.gotoWithRetry(page, `${BASE}/admin/periods`, '.ant-input-number')
    r.report('进入填报期间页', true)

    // 改年份（用未来年份确保 12 月都未配置）
    await sleep(500)
    await r.setInputNumber(page, '.ant-input-number-input', year)
    await sleep(1500)

    // 验证 12 月都展示
    const periodsVisible = await page.evaluate((y) => {
      const cells = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      return cells.length
    }, year)
    if (periodsVisible !== 12) {
      throw new Error(`应展示 12 个月，实际 ${periodsVisible}`)
    }
    r.report('表格展示 12 个月', true, `${year}`)

    // 验证初始状态都是「开放」
    const initialLocks = await page.evaluate((targetPeriod) => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const target = rows.find((r) => r.textContent?.includes(targetPeriod))
      if (!target) return { found: false }
      const switches = target.querySelectorAll('.ant-switch')
      return { found: true, checked: switches[0]?.classList.contains('ant-switch-checked') }
    }, targetPeriod)
    if (!initialLocks.found) throw new Error('未找到目标月')
    if (initialLocks.checked) throw new Error('目标月不应是已锁定')
    r.report(`${targetPeriod} 初始为「开放」状态`, true)

    // ---------- 点击 Switch 锁定 ----------
    await sleep(300)
    await page.evaluate((targetPeriod) => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const target = rows.find((r) => r.textContent?.includes(targetPeriod))
      const sw = target.querySelector('.ant-switch')
      sw.click()
    }, targetPeriod)
    await page.waitForFunction(
      (n) => document.body.textContent.includes('已锁定 ' + n),
      { timeout: 10000 },
      targetPeriod,
    )
    r.report('UI 点击 Switch 锁定成功', true, targetPeriod)

    // 验证 API 真的锁了
    const periodsAfterLock = (await axios.get(`${BASE}/api/admin/periods?year=${year}`, { headers: ah })).data
    const lockedPeriod = periodsAfterLock.find((p) => p.period === targetPeriod)
    if (!lockedPeriod?.locked) throw new Error('API 未反映锁定')
    r.report('锁定 → API 持久化', true)

    // ---------- 锁定后用户端不能保存（联动）----------
    // 用 API 创建模板 + 绑定测试部
    const tplRes = await axios.post(`${BASE}/api/templates`, {
      name: `PER测试模板${uniqueSuffix()}`,
      year: year,
      snapshot: { sheets: { s1: { id: 's1', cellData: {} } } },
    }, { headers: ah })
    const tid = tplRes.data.id
    const roles = (await axios.get(`${BASE}/api/admin/roles`, { headers: ah })).data
    const opRole = roles.find((r) => r.name === '运营部')
    await axios.post(`${BASE}/api/admin/roles/${opRole.id}/templates`, {
      template_ids: [tid],
    }, { headers: ah })
    // op1 登录拿 token
    const op1Login = await axios.post(`${BASE}/api/auth/login`, { username: 'op1', password: 'pw123' })
    const op1Token = op1Login.data.access_token
    // 尝试 save（应被拒）
    try {
      await axios.post(`${BASE}/api/workspace/workbooks`, {
        template_id: tid,
        period: targetPeriod,
        snapshot: { sheets: { s1: { id: 's1', cellData: {} } } },
        action: 'save',
      }, { headers: { Authorization: `Bearer ${op1Token}` } })
      throw new Error('锁定期间 save 应被拒但成功了')
    } catch (e) {
      if (e.response?.status !== 400) throw new Error(`期望 400，实际 ${e.response?.status}`)
      if (!e.response?.data?.detail?.includes('锁定')) {
        throw new Error(`期望 detail 含「锁定」，实际 ${JSON.stringify(e.response?.data)}`)
      }
    }
    r.report('锁定期间用户端 save 被拒（联动）', true)

    // ---------- UI 解锁 ----------
    await sleep(500)
    await page.evaluate((targetPeriod) => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const target = rows.find((r) => r.textContent?.includes(targetPeriod))
      const sw = target.querySelector('.ant-switch')
      sw.click()
    }, targetPeriod)
    await page.waitForFunction(
      (n) => document.body.textContent.includes('已解锁 ' + n),
      { timeout: 10000 },
      targetPeriod,
    )
    r.report('UI 再次点击 Switch 解锁成功', true)

    // 验证 API 真的解锁
    const periodsAfterUnlock = (await axios.get(`${BASE}/api/admin/periods?year=${year}`, { headers: ah })).data
    const unlocked = periodsAfterUnlock.find((p) => p.period === targetPeriod)
    if (unlocked?.locked) throw new Error('API 未反映解锁')
    r.report('解锁 → API 持久化', true)

    if (pageErrors.length > 0) console.log('JS 错误:', pageErrors)
    r.report('无未捕获 JS 异常', pageErrors.length === 0)
  } finally {
    // 兜底清理本脚本创建/锁定的模板与周期
    try {
      const tpls = (await axios.get(`${BASE}/api/templates`, { headers: ah })).data
      for (const t of tpls) {
        if (t.name.startsWith('PER测试模板')) {
          await axios.post(`${BASE}/api/templates/${t.id}/archive`, {}, { headers: ah }).catch(() => {})
        }
      }
    } catch {}
    await browser.close()
  }

  r.finalize()
}

main().catch((e) => {
  console.error('E2E FAILED:', e.message)
  process.exit(1)
})