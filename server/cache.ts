import { ensureDir } from 'https://deno.land/std@0.93.0/fs/ensure_dir.ts'
import { createHash } from 'https://deno.land/std@0.93.0/hash/mod.ts'
import { join } from 'https://deno.land/std@0.93.0/path/mod.ts'
import { existsFileSync } from '../shared/fs.ts'
import log from '../shared/log.ts'
import util from '../shared/util.ts'
import { getDenoDir } from './helper.ts'

/** download and cache remote contents */
export async function cache(url: string, options?: { forceRefresh?: boolean, retryTimes?: number }) {
  const { protocol, hostname, port, pathname, search } = new URL(url)
  const hashname = createHash('sha256').update(pathname + search).toString()
  const isLocalhost = hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '127.0.0.1'
  const cacheDir = join(
    await getDenoDir(),
    'deps',
    util.trimSuffix(protocol, ':'),
    hostname + (port ? '_PORT' + port : '')
  )
  const contentFilepath = join(cacheDir, hashname)
  const metaFilepath = join(cacheDir, hashname + '.metadata.json')

  if (!options?.forceRefresh && !isLocalhost && existsFileSync(contentFilepath) && existsFileSync(metaFilepath)) {
    const [content, meta] = await Promise.all([
      Deno.readFile(contentFilepath),
      Deno.readTextFile(metaFilepath),
    ])
    try {
      const { headers = {} } = JSON.parse(meta)
      return {
        content,
        contentType: headers['content-type'] || null
      }
    } catch (e) { }
  }

  const retryTimes = options?.retryTimes || 3
  let err = new Error('Unknown')
  for (let i = 0; i < retryTimes; i++) {
    if (i === 0) {
      if (!isLocalhost) {
        log.info('Download', url)
      }
    } else {
      log.debug('Download error:', err)
      log.warn(`Download ${url} failed, retrying...`)
    }
    try {
      const resp = await fetch(url)
      if (resp.status >= 400) {
        err = new Error(resp.statusText)
        continue
      }
      const buffer = await resp.arrayBuffer()
      const content = new Uint8Array(buffer)
      if (!isLocalhost) {
        const headers: Record<string, string> = {}
        resp.headers.forEach((val, key) => {
          headers[key] = val
        })
        await ensureDir(cacheDir)
        Deno.writeFile(contentFilepath, content)
        Deno.writeTextFile(metaFilepath, JSON.stringify({ headers, url }, undefined, 2))
      }
      return {
        content,
        contentType: resp.headers.get('content-type')
      }
    } catch (e) {
      err = e
    }
  }

  return Promise.reject(err)
}