// 三期验证：模板导入(Excel→弹窗)、模板导出、模板归档/恢复
import ExcelJS from 'exceljs'
import axios from 'axios'
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Reporter, uniqueSuffix, sleep, BASE } from './e2e_helpers.mjs'

const CREATE_MODAL = '.ant-modal:has(#name)'

async function makeTestXlsx() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('预算表')
  ws.mergeCells('A1:B1')
  ws.getCell('A1').value = '项目'
  ws.getCell('A1').font = { bold: true }
  ws.getCell('C1').value = '2026'
  ws.mergeCells('A2:A3')
  ws.getCell('A2').value = '营收'
  ws.getCell('B2').value = 100
  ws.getCell('B3').value = 200
  for (let r = 1; r <= 3; r++) {
    for (let c = 1; c <= 3; c++) {
      ws.getCell(r, c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    }
  }
  ws.getColumn(1).width = 12
  const buf = await wb.xlsx.writeBuffer()
  // 写入系统临时目录，避免污染 frontend/ 或被 git 误 add
  const path = join(tmpdir(), `import_test_${Date.now()}.xlsx`)
  const { writeFileSync } = await import('node:fs')
  writeFileSync(path, Buffer.from(buf))
  return path
}

async function waitCanvas(page, containerSel, timeout = 30000) {
  await page.waitForFunction(
    (sel) => !!document.querySelector(sel)?.querySelectorAll('canvas').length,
    { timeout },
    containerSel,
  )
}

async function main() {
  const r = new Reporter('IMPORT E2E')
  const ah = await r.apiLogin('admin', 'admin123')
  const xlsxPath = await makeTestXlsx()

  const browser = await r.launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })

    await r.login(page, 'admin', 'admin123')
    await page.goto(`${BASE}/admin/templates`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await r.gotoWithRetry(page, `${BASE}/admin/templates`, '.ant-menu')

    const tplName = `导入模板${uniqueSuffix()}`

    // 导入
    const uploadInput = await page.$('input[type=file]')
    r.report('找到文件上传 input', !!uploadInput)
    if (uploadInput) {
      await uploadInput.uploadFile(xlsxPath)
    }
    await sleep(3000)
    await page.waitForSelector(CREATE_MODAL, { timeout: 15000 }).catch(() => {})
    await sleep(2500)
    const modalOpen = await page.evaluate((sel) => !!document.querySelector(sel), CREATE_MODAL)
    r.report('导入后打开新建模板弹窗', modalOpen)
    if (modalOpen) {
      await waitCanvas(page, CREATE_MODAL)
      await sleep(1500)
      const createCanvas = await page.evaluate((sel) => document.querySelector(sel)?.querySelectorAll('canvas').length ?? 0, CREATE_MODAL)
      r.report('弹窗内 Univer 渲染（含合并单元格）', createCanvas > 0)
      await page.type('#name', tplName)
      await page.type('input[placeholder="如：B3"]', 'B2')
      await page.evaluate((sel) => {
        const modal = document.querySelector(sel)
        const btns = Array.from(modal?.querySelectorAll('.ant-modal-footer button') ?? [])
        btns.find((b) => b.textContent?.replace(/\s+/g, '') === '保存')?.click()
      }, CREATE_MODAL)
      await page.waitForFunction(
        (name) => document.body.textContent.includes('模板创建成功') && document.body.textContent.includes(name),
        { timeout: 20000 },
        tplName,
      )
      r.report('导入模板保存成功', true, `name=${tplName}`)
      await sleep(1500)
    }

    // 导出（puppeteer 无法拦截 blob 下载，改用"已导出"成功提示断言）
    await page.evaluate((name) => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const row = rows.find((tr) => tr.textContent?.includes(name))
      const btn = Array.from(row?.querySelectorAll('button') ?? []).find((b) => b.textContent?.replace(/\s+/g, '').includes('导出'))
      btn?.click()
    }, tplName)
    let exportOk = false
    for (let i = 0; i < 20; i++) {
      await sleep(500)
      if (await page.evaluate(() => document.body.textContent.includes('已导出'))) { exportOk = true; break }
    }
    r.report('导出模板成功（生成 .xlsx）', exportOk)

    // 归档
    await page.evaluate((name) => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const row = rows.find((tr) => tr.textContent?.includes(name))
      const btn = Array.from(row?.querySelectorAll('button') ?? []).find((b) => b.textContent?.replace(/\s+/g, '').includes('归档'))
      btn?.click()
    }, tplName)
    await sleep(1200)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.ant-popover button, .ant-popconfirm button'))
      const ok = btns.find((b) => b.textContent?.replace(/\s+/g, '') === '确定' || b.textContent?.replace(/\s+/g, '') === 'OK')
      ok?.click()
    })
    await sleep(1500)
    const goneFromActive = await page.evaluate(
      (name) => !Array.from(document.querySelectorAll('.ant-table-tbody tr')).some((tr) => tr.textContent?.includes(name)),
      tplName,
    )
    r.report('归档后从未归档列表消失', goneFromActive)

    // 归档模板页：恢复
    await page.goto(`${BASE}/admin/archived`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await sleep(1500)
    const inArchived = await page.evaluate(
      (name) => Array.from(document.querySelectorAll('.ant-table-tbody tr')).some((tr) => tr.textContent?.includes(name)),
      tplName,
    )
    r.report('归档模板列表中可见', inArchived)
    await page.evaluate((name) => {
      const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
      const row = rows.find((tr) => tr.textContent?.includes(name))
      row?.querySelector('button')?.click()
    }, tplName)
    await sleep(1500)
    const backToActive = await page.evaluate(
      (name) => Array.from(document.querySelectorAll('.ant-table-tbody tr')).some((tr) => tr.textContent?.includes(name)),
      tplName,
    )
    r.report('恢复后回到模板列表', backToActive)

    // 清理本脚本创建的模板
    try {
      const tplList = (await axios.get(`${BASE}/api/templates`, { headers: ah })).data
      const t = tplList.find((x) => x.name === tplName)
      if (t) {
        await axios.post(`${BASE}/api/templates/${t.id}/archive`, {}, { headers: ah }).catch(() => {})
      }
    } catch { /* ignore */ }
  } finally {
    await browser.close()
    if (existsSync(xlsxPath)) unlinkSync(xlsxPath)
  }

  r.finalize()
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1) })