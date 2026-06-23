const path = require('node:path');
const { readFile } = require('node:fs/promises');
const MarkdownIt = require('markdown-it');
const sharp = require('sharp');
const { APP_META } = require('./app-meta.cjs');
const {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Math: DocxMath,
  MathFraction,
  MathIntegral,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSubSuperScript,
  MathSum,
  MathSuperScript,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} = require('docx');

const DEFAULT_MAX_IMAGE_WIDTH = 620;
const DEFAULT_MAX_IMAGE_HEIGHT = 760;
const DATA_URI_RE = /^data:([^;,]+)?(;base64)?,(.*)$/i;
const REMOTE_RE = /^https?:\/\//i;
const FILE_RE = /^file:\/\//i;

const GREEK = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω'
};

const SYMBOLS = {
  times: '×',
  cdot: '·',
  div: '÷',
  pm: '±',
  mp: '∓',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  neq: '≠',
  approx: '≈',
  infty: '∞',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
  cup: '∪',
  cap: '∩',
  forall: '∀',
  exists: '∃',
  partial: '∂',
  nabla: '∇'
};

const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'lim', 'min', 'max']);

function sanitizeDocxFileName(value) {
  const base = String(value || 'markdown-document')
    .replace(/[\\/:*?"<>|\t]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/g, '');
  const safe = base || 'markdown-document';
  return safe.toLowerCase().endsWith('.docx') ? safe : `${safe}.docx`;
}

async function markdownToDocxBuffer(markdown, options = {}) {
  const warnings = [];
  const renderer = new MarkdownDocxRenderer({
    baseDir: options.baseDir,
    renderMermaid: options.renderMermaid,
    fetchImpl: options.fetchImpl,
    warnings,
    maxImageWidth: options.maxImageWidth || DEFAULT_MAX_IMAGE_WIDTH,
    maxImageHeight: options.maxImageHeight || DEFAULT_MAX_IMAGE_HEIGHT
  });
  const children = await renderer.render(String(markdown ?? ''));
  const doc = new Document({
    creator: APP_META.displayName,
    title: options.title || 'Markdown Document',
    numbering: {
      config: [
        {
          reference: 'numbered-list',
          levels: Array.from({ length: 9 }, (_value, index) => ({
            level: index,
            format: LevelFormat.DECIMAL,
            text: `%${index + 1}.`,
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: { left: 720 * (index + 1), hanging: 360 }
              }
            }
          }))
        }
      ]
    },
    styles: {
      default: {
        document: {
          run: {
            font: 'Aptos',
            size: 22
          },
          paragraph: {
            spacing: { line: 320, after: 120 }
          }
        }
      },
      paragraphStyles: [
        {
          id: 'CodeBlock',
          name: 'Code Block',
          basedOn: 'Normal',
          quickFormat: true,
          run: { font: 'Menlo', size: 19 },
          paragraph: {
            spacing: { before: 120, after: 120 },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F4F6F8' },
            border: {
              left: { style: BorderStyle.SINGLE, size: 8, color: 'D0D7DE' }
            },
            indent: { left: 240 }
          }
        },
        {
          id: 'Quote',
          name: 'Quote',
          basedOn: 'Normal',
          quickFormat: true,
          run: { italics: true, color: '57606A' },
          paragraph: {
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'D0D7DE' } },
            indent: { left: 260 },
            spacing: { before: 80, after: 80 }
          }
        }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 900, right: 900, bottom: 900, left: 900 }
          }
        },
        children: children.length ? children : [new Paragraph('')]
      }
    ]
  });
  const buffer = await Packer.toBuffer(doc);
  return { buffer, warnings };
}

class MarkdownDocxRenderer {
  constructor(options) {
    this.baseDir = options.baseDir || '';
    this.renderMermaid = options.renderMermaid;
    this.fetchImpl = options.fetchImpl;
    this.warnings = options.warnings;
    this.maxImageWidth = options.maxImageWidth;
    this.maxImageHeight = options.maxImageHeight;
    this.md = new MarkdownIt({ html: false, linkify: true, typographer: true });
  }

  async render(markdown) {
    const tokens = this.md.parse(markdown, {});
    return this.renderBlockRange(tokens, 0, tokens.length, {});
  }

  async renderBlockRange(tokens, start, end, context) {
    const children = [];
    let index = start;
    while (index < end) {
      const token = tokens[index];
      if (!token) break;

      if (token.type === 'heading_open') {
        const inline = tokens[index + 1];
        const level = Number(token.tag.slice(1)) || 1;
        children.push(
          new Paragraph({
            heading: headingLevel(level),
            children: await this.renderInlineChildren(inline?.children ?? [])
          })
        );
        index += 3;
        continue;
      }

      if (token.type === 'paragraph_open') {
        const inline = tokens[index + 1];
        const blockMath = extractBlockMath(inline?.children ?? []);
        if (blockMath) {
          children.push(new Paragraph({ style: context.quote ? 'Quote' : undefined, alignment: AlignmentType.CENTER, children: [parseLatexToMath(blockMath)] }));
          index += 3;
          continue;
        }
        if (context.quote) {
          children.push(...(await this.renderQuoteParagraphs(inline?.children ?? [])));
          index += 3;
          continue;
        }
        const paragraphChildren = await this.renderInlineChildren(inline?.children ?? []);
        children.push(new Paragraph({ children: paragraphChildren.length ? paragraphChildren : [new TextRun('')] }));
        index += 3;
        continue;
      }

      if (token.type === 'fence' || token.type === 'code_block') {
        const info = String(token.info || '').trim().toLowerCase();
        if (info.startsWith('mermaid')) {
          const rendered = await this.renderMermaidImage(token.content);
          if (rendered) {
            children.push(...rendered);
          } else {
            children.push(codeParagraph(token.content));
          }
        } else {
          const lines = String(token.content || '').replace(/\n$/g, '').split('\n');
          lines.forEach((line) => children.push(codeParagraph(line || ' ')));
        }
        index += 1;
        continue;
      }

      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        const closeIndex = findMatchingToken(tokens, index, token.type, token.type.replace('_open', '_close'));
        children.push(...(await this.renderList(tokens, index + 1, closeIndex, token.type === 'ordered_list_open', context.listLevel || 0, context)));
        index = closeIndex + 1;
        continue;
      }

      if (token.type === 'blockquote_open') {
        const closeIndex = findMatchingToken(tokens, index, 'blockquote_open', 'blockquote_close');
        children.push(...(await this.renderBlockRange(tokens, index + 1, closeIndex, { ...context, quote: true })));
        index = closeIndex + 1;
        continue;
      }

      if (token.type === 'hr') {
        children.push(new Paragraph({ children: [new TextRun('────────────────────────')] }));
        index += 1;
        continue;
      }

      if (token.type === 'table_open') {
        const closeIndex = findMatchingToken(tokens, index, 'table_open', 'table_close');
        const table = await this.renderTable(tokens, index + 1, closeIndex);
        if (table) children.push(table);
        index = closeIndex + 1;
        continue;
      }

      index += 1;
    }
    return children;
  }

  async renderQuoteParagraphs(inlineTokens) {
    const groups = splitInlineTokensByBreak(inlineTokens);
    const paragraphs = [];
    for (const group of groups) {
      const paragraphChildren = await this.renderInlineChildren(group);
      paragraphs.push(new Paragraph({ style: 'Quote', children: paragraphChildren.length ? paragraphChildren : [new TextRun('')] }));
    }
    return paragraphs;
  }

  async renderList(tokens, start, end, ordered, level, context = {}) {
    const children = [];
    let index = start;
    while (index < end) {
      const token = tokens[index];
      if (token?.type !== 'list_item_open') {
        index += 1;
        continue;
      }
      const closeIndex = findMatchingToken(tokens, index, 'list_item_open', 'list_item_close');
      let itemParagraphAdded = false;
      let innerIndex = index + 1;
      while (innerIndex < closeIndex) {
        if (tokens[innerIndex].type === 'paragraph_open') {
          const inline = tokens[innerIndex + 1];
          children.push(
            new Paragraph({
              style: context.quote ? 'Quote' : undefined,
              children: await this.renderInlineChildren(inline?.children ?? []),
              bullet: ordered ? undefined : { level },
              numbering: ordered ? { reference: 'numbered-list', level } : undefined
            })
          );
          itemParagraphAdded = true;
          innerIndex += 3;
          continue;
        }
        if (tokens[innerIndex].type === 'bullet_list_open' || tokens[innerIndex].type === 'ordered_list_open') {
          const nestedClose = findMatchingToken(tokens, innerIndex, tokens[innerIndex].type, tokens[innerIndex].type.replace('_open', '_close'));
          children.push(...(await this.renderList(tokens, innerIndex + 1, nestedClose, tokens[innerIndex].type === 'ordered_list_open', level + 1, context)));
          innerIndex = nestedClose + 1;
          continue;
        }
        innerIndex += 1;
      }
      if (!itemParagraphAdded) {
        children.push(
          new Paragraph({
            style: context.quote ? 'Quote' : undefined,
            children: [new TextRun('')],
            bullet: ordered ? undefined : { level },
            numbering: ordered ? { reference: 'numbered-list', level } : undefined
          })
        );
      }
      index = closeIndex + 1;
    }
    return children;
  }

  async renderTable(tokens, start, end) {
    const rows = [];
    let currentRow = null;
    let currentCell = null;
    let index = start;
    while (index < end) {
      const token = tokens[index];
      if (token.type === 'tr_open') currentRow = [];
      if (token.type === 'th_open' || token.type === 'td_open') currentCell = { header: token.type === 'th_open', children: [] };
      if (token.type === 'inline' && currentCell) {
        currentCell.children = await this.renderInlineChildren(token.children ?? []);
      }
      if ((token.type === 'th_close' || token.type === 'td_close') && currentRow && currentCell) {
        currentRow.push(currentCell);
        currentCell = null;
      }
      if (token.type === 'tr_close' && currentRow) {
        rows.push(currentRow);
        currentRow = null;
      }
      index += 1;
    }
    if (!rows.length) return null;
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  shading: cell.header ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EEF2F7' } : undefined,
                  children: [new Paragraph({ children: cell.children.length ? cell.children : [new TextRun('')] })]
                })
            )
          })
      )
    });
  }

  async renderInlineChildren(tokens) {
    const children = [];
    let marks = {};
    for (const token of tokens) {
      if (token.type === 'strong_open') marks = { ...marks, bold: true };
      else if (token.type === 'strong_close') marks = { ...marks, bold: false };
      else if (token.type === 'em_open') marks = { ...marks, italics: true };
      else if (token.type === 'em_close') marks = { ...marks, italics: false };
      else if (token.type === 's_open') marks = { ...marks, strike: true };
      else if (token.type === 's_close') marks = { ...marks, strike: false };
      else if (token.type === 'code_inline') children.push(new TextRun({ text: token.content, font: 'Menlo', size: 20, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F4F6F8' } }));
      else if (token.type === 'text') children.push(...renderTextWithMath(token.content, marks));
      else if (token.type === 'softbreak' || token.type === 'hardbreak') children.push(new TextRun({ text: '\n', break: 1 }));
      else if (token.type === 'link_open') marks = { ...marks, color: '0969DA', underline: {} };
      else if (token.type === 'link_close') marks = { ...marks, color: undefined, underline: undefined };
      else if (token.type === 'image') {
        const image = await this.renderImageToken(token);
        if (image) children.push(image);
      }
      if (token.children?.length) {
        children.push(...(await this.renderInlineChildren(token.children)));
      }
    }
    return children;
  }

  async renderImageToken(token) {
    const src = token.attrGet?.('src') || '';
    const alt = token.content || token.attrGet?.('alt') || 'image';
    try {
      const image = await this.loadImage(src);
      return new ImageRun({
        data: image.buffer,
        type: 'png',
        transformation: { width: image.width, height: image.height },
        altText: { title: alt, description: alt, name: alt }
      });
    } catch (error) {
      this.warnings.push(`图片未能嵌入：${src}（${error.message}）`);
      return new TextRun({ text: `[图片加载失败：${alt || src}]`, color: 'B42318' });
    }
  }

  async renderMermaidImage(source) {
    if (!this.renderMermaid) {
      this.warnings.push('当前环境未提供 Mermaid 渲染器，已保留源码。');
      return null;
    }
    try {
      const rendered = await this.renderMermaid(String(source || ''));
      const normalized = await normalizeImageBuffer(Buffer.from(rendered.buffer), {
        maxWidth: this.maxImageWidth,
        maxHeight: this.maxImageHeight
      });
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: normalized.buffer,
              type: 'png',
              transformation: { width: normalized.width, height: normalized.height },
              altText: { title: 'Mermaid diagram', description: source.slice(0, 180), name: 'mermaid.png' }
            })
          ]
        })
      ];
    } catch (error) {
      this.warnings.push(`Mermaid 渲染失败：${error.message}`);
      return null;
    }
  }

  async loadImage(src) {
    const buffer = await readImageSource(src, this.baseDir, this.fetchImpl);
    return normalizeImageBuffer(buffer, { maxWidth: this.maxImageWidth, maxHeight: this.maxImageHeight });
  }
}

async function readImageSource(src, baseDir, fetchImpl) {
  const value = String(src || '').trim();
  if (!value) throw new Error('图片地址为空');
  const dataMatch = value.match(DATA_URI_RE);
  if (dataMatch) {
    const data = decodeURIComponent(dataMatch[3] || '');
    return dataMatch[2] ? Buffer.from(data, 'base64') : Buffer.from(data, 'utf8');
  }
  if (REMOTE_RE.test(value)) {
    const fetcher = fetchImpl || global.fetch;
    if (!fetcher) throw new Error('当前运行环境不支持远程图片下载');
    const response = await fetcher(value);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const filePath = FILE_RE.test(value) ? new URL(value) : path.resolve(baseDir || process.cwd(), value);
  return readFile(filePath);
}

async function normalizeImageBuffer(buffer, options) {
  const image = sharp(buffer, { animated: false, limitInputPixels: 80_000_000 }).rotate();
  const metadata = await image.metadata();
  const width = metadata.width || 640;
  const height = metadata.height || 360;
  const scale = Math.min(1, options.maxWidth / width, options.maxHeight / height);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const normalized = await image.resize({ width: targetWidth, height: targetHeight, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return { buffer: normalized, width: targetWidth, height: targetHeight };
}

function headingLevel(level) {
  if (level === 1) return HeadingLevel.HEADING_1;
  if (level === 2) return HeadingLevel.HEADING_2;
  if (level === 3) return HeadingLevel.HEADING_3;
  if (level === 4) return HeadingLevel.HEADING_4;
  if (level === 5) return HeadingLevel.HEADING_5;
  return HeadingLevel.HEADING_6;
}

function codeParagraph(text) {
  return new Paragraph({ style: 'CodeBlock', children: [new TextRun({ text: String(text || ' '), font: 'Menlo', size: 19 })] });
}

function findMatchingToken(tokens, start, openType, closeType) {
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].type === openType) depth += 1;
    if (tokens[index].type === closeType) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return tokens.length - 1;
}

function splitInlineTokensByBreak(tokens) {
  const groups = [[]];
  tokens.forEach((token) => {
    if (token.type === 'softbreak' || token.type === 'hardbreak') {
      groups.push([]);
      return;
    }
    groups[groups.length - 1].push(token);
  });
  return groups.filter((group) => group.length > 0);
}

function renderTextWithMath(text, marks) {
  const runs = [];
  const value = String(text ?? '');
  let cursor = 0;
  const regex = /\$([^$\n]+)\$/g;
  let match;
  while ((match = regex.exec(value))) {
    if (match.index > cursor) runs.push(textRun(value.slice(cursor, match.index), marks));
    runs.push(parseLatexToMath(match[1]));
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) runs.push(textRun(value.slice(cursor), marks));
  return runs.filter(Boolean);
}

function extractBlockMath(tokens) {
  if (tokens.length !== 1 || tokens[0].type !== 'text') return '';
  const value = String(tokens[0].content || '').trim();
  if (value.startsWith('$$') && value.endsWith('$$') && value.length > 4) return value.slice(2, -2).trim();
  if (value.startsWith('\\[') && value.endsWith('\\]') && value.length > 4) return value.slice(2, -2).trim();
  return '';
}

function textRun(text, marks = {}) {
  if (!text) return null;
  return new TextRun({
    text,
    bold: Boolean(marks.bold),
    italics: Boolean(marks.italics),
    strike: Boolean(marks.strike),
    color: marks.color,
    underline: marks.underline
  });
}

function parseLatexToMath(latex) {
  try {
    const parser = new LatexParser(String(latex || ''));
    const children = parser.parseExpression();
    return new DocxMath({ children: children.length ? children : [new MathRun(String(latex || ''))] });
  } catch (_error) {
    return new DocxMath({ children: [new MathRun(String(latex || ''))] });
  }
}

class LatexParser {
  constructor(input) {
    this.input = input.trim();
    this.index = 0;
  }

  parseExpression(stopChar = '') {
    const children = [];
    while (this.index < this.input.length) {
      if (stopChar && this.input[this.index] === stopChar) break;
      if (/\s/.test(this.input[this.index])) {
        this.index += 1;
        continue;
      }
      let atom = this.parseAtom();
      atom = this.parseScripts(atom);
      children.push(atom);
    }
    return children;
  }

  parseAtom() {
    const char = this.input[this.index];
    if (char === '{') {
      return new MathRun(flattenMathText(this.parseGroup()));
    }
    if (char === '\\') {
      return this.parseCommand();
    }
    this.index += 1;
    return new MathRun(char);
  }

  parseCommand() {
    this.index += 1;
    const name = this.readCommandName();
    if (name === 'frac') {
      return new MathFraction({ numerator: this.parseRequiredGroup(), denominator: this.parseRequiredGroup() });
    }
    if (name === 'sqrt') {
      return new MathRadical({ children: this.parseRequiredGroup() });
    }
    if (name === 'sum') {
      return this.parseOperatorWithScripts(new MathSum({ children: [new MathRun('∑')] }));
    }
    if (name === 'int') {
      return this.parseOperatorWithScripts(new MathIntegral({ children: [new MathRun('∫')] }));
    }
    if (GREEK[name]) return new MathRun(GREEK[name]);
    if (SYMBOLS[name]) return new MathRun(SYMBOLS[name]);
    if (FUNCTIONS.has(name)) return new MathRun(`${name} `);
    return new MathRun(name ? `\\${name}` : '\\');
  }

  parseOperatorWithScripts(operator) {
    return this.parseScripts(operator);
  }

  parseScripts(base) {
    let subScript = null;
    let superScript = null;
    let changed = true;
    while (changed) {
      changed = false;
      if (this.input[this.index] === '_') {
        this.index += 1;
        subScript = this.parseScriptValue();
        changed = true;
      }
      if (this.input[this.index] === '^') {
        this.index += 1;
        superScript = this.parseScriptValue();
        changed = true;
      }
    }
    if (subScript && superScript) return new MathSubSuperScript({ children: [base], subScript, superScript });
    if (subScript) return new MathSubScript({ children: [base], subScript });
    if (superScript) return new MathSuperScript({ children: [base], superScript });
    return base;
  }

  parseScriptValue() {
    if (this.input[this.index] === '{') return this.parseRequiredGroup();
    const atom = this.parseAtom();
    return [atom];
  }

  parseRequiredGroup() {
    if (this.input[this.index] !== '{') {
      const atom = this.parseAtom();
      return [atom];
    }
    return this.parseGroup();
  }

  parseGroup() {
    if (this.input[this.index] !== '{') return [];
    this.index += 1;
    const children = this.parseExpression('}');
    if (this.input[this.index] === '}') this.index += 1;
    return children;
  }

  readCommandName() {
    const start = this.index;
    while (/[A-Za-z]/.test(this.input[this.index] || '')) this.index += 1;
    if (this.index === start && this.index < this.input.length) {
      this.index += 1;
      return this.input[start];
    }
    return this.input.slice(start, this.index);
  }
}

function flattenMathText(children) {
  return children
    .map((child) => {
      if (child.root?.length) return '';
      return '';
    })
    .join('');
}

module.exports = {
  markdownToDocxBuffer,
  parseLatexToMath,
  sanitizeDocxFileName
};
