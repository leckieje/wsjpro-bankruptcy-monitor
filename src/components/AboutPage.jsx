import { useEffect, useRef } from 'react'
import aboutText from '../data/about.md?raw'

function parseMarkdown(md) {
  let html = md
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />')

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Tables
  html = html.replace(/^(\|.+\|)\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/gm, (match, headerRow, bodyRows) => {
    const headers = headerRow.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('')
    const rows = bodyRows.trim().split('\n').map(row => {
      const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('')
      return `<tr>${cells}</tr>`
    }).join('')
    return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`
  })

  // Paragraphs (lines not already wrapped in block elements)
  const lines = html.split('\n')
  const result = []
  let inParagraph = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isBlock = /^<(h[1-6]|hr|table|thead|tbody|tr|th|td|ul|ol|li)/.test(line)
    const isEmpty = line.trim() === ''

    if (isEmpty) {
      if (inParagraph) {
        result.push('</p>')
        inParagraph = false
      }
      continue
    }

    if (isBlock) {
      if (inParagraph) {
        result.push('</p>')
        inParagraph = false
      }
      result.push(line)
    } else if (line.startsWith('- ')) {
      if (inParagraph) {
        result.push('</p>')
        inParagraph = false
      }
      result.push(`<li>${line.slice(2)}</li>`)
    } else {
      if (!inParagraph) {
        result.push('<p>')
        inParagraph = true
      }
      result.push(line)
    }
  }
  if (inParagraph) result.push('</p>')

  // Wrap consecutive <li> in <ul>
  let final = result.join('\n')
  final = final.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')

  return final
}

export default function AboutPage({ onBack }) {
  const contentRef = useRef(null)

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.innerHTML = parseMarkdown(aboutText)
    }
  }, [])

  return (
    <div className="about-page">
      <button className="about-back" onClick={onBack}>← Back to Monitor</button>
      <div className="about-content" ref={contentRef} />
    </div>
  )
}
