/* eslint-disable no-console */
// 三期验证：模板导入(Excel→弹窗)、模板导出、模板归档/恢复
import puppeteer from 'puppeteer-core'
import ExcelJS from 'exceljs'
import { writeFileSync, existsSync, unlinkSync } from 'node:fs'

const BASE = 'http://localhost:5173'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const report = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`) }

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
  writeFileSync('import_test.xlsx', Buffer.from(buf))
  return 'import_test.xlsx'
}

async function waitCanvas(page, containerSel, timeout = 30000) {
  await page.waitForFunction(
    (sel) => !!document.querySelector(sel)?.querySelectorAll('canvas').length,
    { timeout },
    containerSel,
  )
}

// 匹配包含 #name 输入框的“新建/编辑模板”弹窗（规避 forceRender 的预览弹窗）
const CREATE_MODAL = '.ant-modal:has(#name)'

async function main() {
  const xlsxPath = await makeTestXlsx()

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(3000)
  await page.type('#username', 'admin')
  await page.type('#password', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 30000 })
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(4000)
  await page.waitForSelector('.ant-tabs', { timeout: 15000 })

  const tplName = `导入模板${Date.now().toString().slice(-6)}`

  // 导入
  const uploadInput = await page.$('input[type=file]')
  report('找到文件上传 input', !!uploadInput)
  if (uploadInput) {
    await uploadInput.uploadFile(xlsxPath)
  }
  await sleep(3000)
  await page.waitForSelector(CREATE_MODAL, { timeout: 15000 }).catch(() => {})
  await sleep(2500)
  const modalOpen = await page.evaluate((sel) => !!document.querySelector(sel), CREATE_MODAL)
  report('导入后打开新建模板弹窗', modalOpen)
  if (modalOpen) {
    await waitCanvas(page, CREATE_MODAL)
    await sleep(1500)
    const createCanvas = await page.evaluate((sel) => document.querySelector(sel)?.querySelectorAll('canvas').length ?? 0, CREATE_MODAL)
    report('弹窗内 Univer 渲染（含合并单元格）', createCanvas > 0)
    // 填名称 + 数据区域起始单元格 + 保存
    await page.type('#name', tplName)
    await page.type('input[placeholder="如：B3"]', 'B2')
    await page.evaluate((sel) => {
      const modal = document.querySelector(sel)
      const btns = Array.from(modal?.querySelectorAll('.ant-modal-footer button') ?? [])
      btns.find((b) => b.textContent.replace(/\s+/g, '') === '保存')?.click()
    }, CREATE_MODAL)
    await page.waitForFunction(
      (name) => document.body.textContent.includes('模板创建成功') && document.body.textContent.includes(name),
      { timeout: 20000 },
      tplName,
    )
    report('导入模板保存成功', true, `name=${tplName}`)
    await sleep(1500)
  }

  // 导出（puppeteer 无法拦截 blob 下载，改用“已导出”成功提示断言）
  await page.evaluate((name) => {
    const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
    const row = rows.find((tr) => tr.textContent.includes(name))
    const btn = Array.from(row?.querySelectorAll('button') ?? []).find((b) => b.textContent.replace(/\s+/g, '').includes('导出'))
    btn?.click()
  }, tplName)
  let exportOk = false
  for (let i = 0; i < 20; i++) {
    await sleep(500)
    if (await page.evaluate(() => document.body.textContent.includes('已导出'))) { exportOk = true; break }
  }
  report('导出模板成功（生成 .xlsx）', exportOk)

  // 归档
  await page.evaluate((name) => {
    const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
    const row = rows.find((tr) => tr.textContent.includes(name))
    const btn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent.replace(/\s+/g, '').includes('归档'))
    btn?.click()
  }, tplName)
  await sleep(1200)
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.ant-popover button, .ant-popconfirm button'))
    const ok = btns.find((b) => b.textContent.replace(/\s+/g, '') === '确定' || b.textContent.replace(/\s+/g, '') === 'OK')
    ok?.click()
  })
  await sleep(1500)
  const goneFromActive = await page.evaluate(
    (name) => !Array.from(document.querySelectorAll('.ant-table-tbody tr')).some((tr) => tr.textContent.includes(name)),
    tplName,
  )
  report('归档后从未归档列表消失', goneFromActive)

  // 归档模板 Tab：恢复
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.ant-tabs-tab'))
    tabs.find((t) => t.textContent.includes('归档模板'))?.click()
  })
  await sleep(1500)
  const inArchived = await page.evaluate(
    (name) => Array.from(document.querySelectorAll('.ant-table-tbody tr')).some((tr) => tr.textContent.includes(name)),
    tplName,
  )
  report('归档模板列表中可见', inArchived)
  await page.evaluate((name) => {
    const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'))
    const row = rows.find((tr) => tr.textContent.includes(name))
    row?.querySelector('button')?.click()
  }, tplName)
  await sleep(1500)
  const backToActive = await page.evaluate(
    (name) => Array.from(document.querySelectorAll('.ant-table-tbody tr')).some((tr) => tr.textContent.includes(name)),
    tplName,
  )
  report('恢复后回到模板列表', backToActive)

  await browser.close()
  if (existsSync(xlsxPath)) unlinkSync(xlsxPath)
  console.log('total:', results.filter(Boolean).length, '/', results.length)
  if (results.some((r) => !r)) process.exit(1)
  console.log('IMPORT E2E ALL PASSED')
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1) })
