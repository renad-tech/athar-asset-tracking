/**
 * Downloads the COCO-SSD person/object detector into public/models/coco-ssd/
 * so the app runs FULLY OFFLINE afterwards.
 *
 * Run once:   node scripts/download-model.mjs
 *
 * The app works without this (motion + QR mode). This script only adds the
 * person/object recognition layer.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssd_mobilenet_v2'
const OUT = join(process.cwd(), 'public', 'models', 'coco-ssd')

async function get(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

try {
  await mkdir(OUT, { recursive: true })
  console.log('⬇  تحميل model.json …')
  const manifestBuf = await get(`${BASE}/model.json`)
  await writeFile(join(OUT, 'model.json'), manifestBuf)

  const manifest = JSON.parse(manifestBuf.toString())
  const shards = manifest.weightsManifest.flatMap(g => g.paths)
  console.log(`⬇  تحميل ${shards.length} ملف أوزان …`)

  for (const [i, shard] of shards.entries()) {
    const buf = await get(`${BASE}/${shard}`)
    await writeFile(join(OUT, shard), buf)
    process.stdout.write(`\r   ${i + 1}/${shards.length}  ${shard}          `)
  }

  console.log('\n✅ تم. النموذج مدمج الآن في public/models/coco-ssd/')
  console.log('   أعد تشغيل npm run dev — سترى "PERSON AI ON" على الكاميرا.')
} catch (err) {
  console.error('\n❌ فشل التحميل:', err.message)
  console.error('   تحقق من الإنترنت وأعد المحاولة. التطبيق يعمل بدونه (وضع الحركة + QR).')
  process.exit(1)
}
