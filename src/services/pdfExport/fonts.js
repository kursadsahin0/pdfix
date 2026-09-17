import fontkit from '@pdf-lib/fontkit'
import { StandardFonts } from 'pdf-lib'

const FONT_FILES = {
  regular: '/fonts/Roboto-Regular.ttf',
  bold: '/fonts/Roboto-Bold.ttf',
  italic: '/fonts/Roboto-Italic.ttf',
  boldItalic: '/fonts/Roboto-BoldItalic.ttf',
}

/** @type {Map<string, ArrayBuffer>} */
const fontBytesCache = new Map()

/**
 * @param {string} url
 * @returns {Promise<ArrayBuffer>}
 */
async function loadFontBytes(url) {
  const cached = fontBytesCache.get(url)
  if (cached) return cached

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load font: ${url}`)
  }
  const buffer = await response.arrayBuffer()
  fontBytesCache.set(url, buffer)
  return buffer
}

/**
 * @param {string} [fontFamily]
 * @param {string} [fontWeight]
 * @param {string} [fontStyle]
 */
function resolveFontKey(fontFamily = '', fontWeight = 'normal', fontStyle = 'normal') {
  const family = String(fontFamily).toLowerCase()
  const bold =
    String(fontWeight) === 'bold' ||
    Number(fontWeight) >= 600 ||
    family.includes('bold')
  const italic =
    String(fontStyle) === 'italic' ||
    String(fontStyle) === 'oblique' ||
    family.includes('italic')

  if (bold && italic) return 'boldItalic'
  if (bold) return 'bold'
  if (italic) return 'italic'
  return 'regular'
}

/**
 * Prefer embedded Roboto (Unicode). Fall back to standard PDF fonts.
 *
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 */
export async function createFontResolver(pdfDoc) {
  pdfDoc.registerFontkit(fontkit)

  /** @type {Record<string, import('pdf-lib').PDFFont | null>} */
  const embedded = {
    regular: null,
    bold: null,
    italic: null,
    boldItalic: null,
  }

  try {
    const [regular, bold, italic, boldItalic] = await Promise.all([
      loadFontBytes(FONT_FILES.regular),
      loadFontBytes(FONT_FILES.bold),
      loadFontBytes(FONT_FILES.italic),
      loadFontBytes(FONT_FILES.boldItalic),
    ])
    embedded.regular = await pdfDoc.embedFont(regular, { subset: true })
    embedded.bold = await pdfDoc.embedFont(bold, { subset: true })
    embedded.italic = await pdfDoc.embedFont(italic, { subset: true })
    embedded.boldItalic = await pdfDoc.embedFont(boldItalic, { subset: true })
  } catch (error) {
    console.warn('Custom font embed failed; falling back to standard fonts', error)
  }

  /** @type {Record<string, import('pdf-lib').PDFFont>} */
  const standard = {}

  async function getStandard(styleKey) {
    if (standard[styleKey]) return standard[styleKey]

    const map = {
      regular: StandardFonts.Helvetica,
      bold: StandardFonts.HelveticaBold,
      italic: StandardFonts.HelveticaOblique,
      boldItalic: StandardFonts.HelveticaBoldOblique,
    }
    standard[styleKey] = await pdfDoc.embedFont(map[styleKey] ?? StandardFonts.Helvetica)
    return standard[styleKey]
  }

  /**
   * @param {{ fontFamily?: string, fontWeight?: string, fontStyle?: string }} style
   */
  async function resolve(style = {}) {
    const key = resolveFontKey(style.fontFamily, style.fontWeight, style.fontStyle)
    if (embedded[key]) return embedded[key]
    if (embedded.regular) {
      if (key === 'bold' && embedded.bold) return embedded.bold
      if (key === 'italic' && embedded.italic) return embedded.italic
      if (key === 'boldItalic' && embedded.boldItalic) return embedded.boldItalic
      return embedded.regular
    }
    return getStandard(key)
  }

  return { resolve }
}
