// Simulate the exact auto-location flow with the new Chinese address format:
// IP geo -> BigDataCloud reverse geocode (zh-Hans) -> "省+市+区".
async function main() {
  const ipRes = await fetch('https://get.geojs.io/v1/ip/geo.json')
  const ip = await ipRes.json()
  const lat = Number(ip.latitude)
  const lon = Number(ip.longitude)
  console.log('IP geo:', JSON.stringify({ city: ip.city, lat, lon }))

  // BigDataCloud reverse geocode
  const rg = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh-Hans`)
  const addr = await rg.json()
  console.log('reverse:', JSON.stringify({ province: addr.principalSubdivision, city: addr.city, district: addr.locality }))

  // compose "省+市+区" with municipality dedupe
  const { principalSubdivision: province, city, locality: district } = addr
  const parts = []
  if (city && city !== province) parts.push(province)
  if (city) parts.push(city)
  if (district && district !== city) parts.push(district)
  console.log('display name ->', parts.join(''))
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1) })
