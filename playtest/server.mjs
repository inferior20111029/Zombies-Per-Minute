import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { extname, join, normalize, resolve } from 'node:path'

const root = resolve(process.cwd())
const playtestRoot = resolve(root, 'playtest')
const port = Number(process.env.PORT || 4173)
const host = process.env.HOST || '0.0.0.0'

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const safeResolve = (base, target) => {
  const normalized = normalize(target).replace(/^(\.\.[/\\])+/, '')
  return resolve(base, normalized)
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
    const pathname = decodeURIComponent(url.pathname)

    let filePath
    if (pathname === '/' || pathname === '/index.html') {
      filePath = join(playtestRoot, 'index.html')
    } else if (pathname.startsWith('/playtest/')) {
      filePath = safeResolve(root, pathname.slice(1))
    } else if (pathname.startsWith('/node_modules/')) {
      filePath = safeResolve(root, pathname.slice(1))
    } else {
      filePath = safeResolve(playtestRoot, pathname.replace(/^\//, ''))
    }

    if (!filePath.startsWith(root)) {
      response.writeHead(403)
      response.end('Forbidden')
      return
    }

    const body = await readFile(filePath)
    const type = contentTypes[extname(filePath)] || 'application/octet-stream'
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': type,
    })
    response.end(body)
  } catch {
    response.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
    })
    response.end('Not found')
  }
})

server.listen(port, host, () => {
  const networkAddress = Object.values(networkInterfaces())
    .flat()
    .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address

  console.log(`ZPM playtest ready on http://127.0.0.1:${port}`)
  if (networkAddress) {
    console.log(`LAN access: http://${networkAddress}:${port}`)
  }
})
