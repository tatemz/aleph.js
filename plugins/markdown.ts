import type { LoaderPlugin } from '../types.ts'
import marked from 'https://esm.sh/marked@2.0.1'
import { safeLoadFront } from 'https://esm.sh/yaml-front-matter@4.1.1'
import util from '../shared/util.ts'

const decoder = new TextDecoder()

export default (): LoaderPlugin => {
  return {
    name: 'markdown-loader',
    type: 'loader',
    test: /\.(md|markdown)$/i,
    allowPage: true,
    pagePathResolve: (url) => {
      let path = util.trimPrefix(url.replace(/\.(md|markdown)$/i, ''), '/pages')
      let isIndex = path.endsWith('/index')
      if (isIndex) {
        path = util.trimSuffix(path, '/index')
        if (path === '') {
          path = '/'
        }
      }
      return { path, isIndex }
    },
    transform: ({ content }) => {
      const { __content, ...meta } = safeLoadFront(decoder.decode(content))
      const html = marked.parse(__content)
      const framework = Deno.env.get('ALEPH_FRAMEWORK')
      const props = {
        id: util.isString(meta.id) ? meta.id : undefined,
        className: util.isString(meta.className) ? meta.className : undefined,
        style: util.isPlainObject(meta.style) ? meta.style : undefined,
      }

      if (framework === 'react') {
        return {
          code: [
            `import { createElement } from 'https://esm.sh/react'`,
            `import HTMLPage from 'https://deno.land/x/aleph/framework/react/components/HTMLPage.ts'`,
            `export default function MarkdownPage(props) {`,
            `  return createElement(HTMLPage, {`,
            `    ...${JSON.stringify(props)},`,
            `    ...props,`,
            `    html: ${JSON.stringify(html)}`,
            `  })`,
            `}`,
            `MarkdownPage.meta = ${JSON.stringify(meta)}`,
          ].join('\n')
        }
      }

      throw new Error(`markdown-loader: don't support framework '${framework}'`)
    }
  }
}
