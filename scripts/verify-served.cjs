// Verify the rebuilt dsh-weather bundle is composed and served by the scratch instance.
const token = process.argv[2]
const base = 'http://127.0.0.1:3081'

async function main() {
  const pageRes = await fetch(`${base}/?token=${token}`)
  const html = await pageRes.text()
  console.log('page status:', pageRes.status, 'bytes:', html.length)
  console.log('dsh-weather/client.js in combo:', html.includes('dsh-weather/client.js'))
  const m = /\/plugins\/\?\?dsh-weather[^"'\\ ]+/.exec(html)
  if (!m) { console.log('combo link not found'); return }
  const combo = m[0].replace(/&amp;/g, '&')
  console.log('combo:', combo)
  const res = await fetch(base + combo)
  const text = await res.text()
  console.log('bundle status:', res.status, 'bytes:', text.length)
  console.log('bundle head ok:', text.trimStart().startsWith('window.__ModuleLoader__.load({ id: "dsh-weather"'))
  console.log('has FALLBACK effective config:', text.includes('FALLBACK'))
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1) })
