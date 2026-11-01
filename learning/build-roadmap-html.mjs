#!/usr/bin/env node
/**
 * Builds learning/roadmap.html, an interactive self-contained page, from learning/ROADMAP.md.
 *
 *   node learning/build-roadmap-html.mjs           write roadmap.html
 *   node learning/build-roadmap-html.mjs --check   exit 1 if roadmap.html is out of date
 *
 * ROADMAP.md stays the source of truth: this script only reads it, and has no dependencies.
 *
 * Conventions it relies on (keep them when editing the roadmap):
 * - Every `## ` heading is a page. `## Stage <id> — <title>` is a stage, `## Final capstone — …` is
 *   stage "C", and a `## Track …` heading introduces a track inside the stage list.
 * - Inside a stage, a paragraph that starts with a bold label (`**Goal:**`, `**Break it**`,
 *   `**Stage capstone — "…"**`) starts a part. Steps/Exercise/Do and Break it become checklists
 *   (list items, or top-level `; `-separated items); Checkpoint splits into one item per question;
 *   a capstone's "Accept when" splits on `; `.
 * - The Progress table (Stage | Topic | Track | Status | …) seeds each stage's track and status, and
 *   the "Rough time per stage" paragraph provides the hour estimates.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, 'ROADMAP.md');
const OUT = path.join(import.meta.dirname, 'roadmap.html');
const CHECK_ONLY = process.argv.includes('--check');

// ---------------------------------------------------------------------------------------------
// Text helpers

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** Markdown inline syntax removed, for slugs, keys and the search index. */
function plain(md) {
  return String(md)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^\w*])\*(\S(?:.*?\S)?)\*(?=[^\w*]|$)/g, '$1$2');
}

/** GitHub-compatible heading slug, so links like `#definition-of-done-for-every-stage` keep working. */
const slugify = (text) =>
  plain(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');

const shortHash = (text) => createHash('sha1').update(text).digest('hex').slice(0, 8);

const usedIds = new Set();
function uniqueId(base) {
  let id = base || 'section';
  for (let n = 1; usedIds.has(id); n++) id = `${base}-${n}`;
  usedIds.add(id);
  return id;
}

/** Split on `sep` only outside code spans and parentheses. Drops a leading "and " per item. */
function splitTopLevel(text, sep = '; ') {
  const items = [];
  let depth = 0;
  let code = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '`') code = !code;
    else if (!code && c === '(') depth++;
    else if (!code && c === ')') depth = Math.max(0, depth - 1);
    else if (!code && depth === 0 && text.startsWith(sep, i)) {
      items.push(text.slice(start, i));
      start = i + sep.length;
      i += sep.length - 1;
    }
  }
  items.push(text.slice(start));
  return items.map((s) => s.trim().replace(/^and\s+/, '')).filter(Boolean);
}

/** One item per question (or per sentence that ends in a period and is followed by a new one). */
const splitSentences = (text) =>
  text
    .split(/(?<=\?)\s+|(?<=\.)\s+(?=[A-Z`"])/)
    .map((s) => s.trim())
    .filter(Boolean);

const capitalize = (text) => text.replace(/^[a-z]/, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------------------------
// Markdown blocks (the subset ROADMAP.md uses)

const LIST_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const indentOf = (line) => line.length - line.trimStart().length;
const isBlockStart = (line) =>
  /^\s*```/.test(line) ||
  /^#{1,6}\s/.test(line) ||
  /^\s*---+\s*$/.test(line) ||
  /^\s*\|/.test(line) ||
  /^\s*>/.test(line) ||
  LIST_RE.test(line);

function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^(\s*)```\s*([\w+-]*)\s*$/);
    if (fence) {
      const indent = fence[1].length;
      const body = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) {
        body.push(lines[i].slice(Math.min(indent, indentOf(lines[i]))));
      }
      i++;
      blocks.push({ type: 'code', lang: fence[2], text: body.join('\n') });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      blocks.push(parseTable(rows));
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoted.push(lines[i++].replace(/^\s*>\s?/, ''));
      }
      blocks.push({ type: 'quote', children: parseBlocks(quoted) });
      continue;
    }
    if (LIST_RE.test(line)) {
      const [list, next] = parseList(lines, i);
      blocks.push(list);
      i = next;
      continue;
    }
    const para = [line.trim()];
    for (i++; i < lines.length && lines[i].trim() && !isBlockStart(lines[i]); i++) {
      para.push(lines[i].trim());
    }
    blocks.push({ type: 'para', text: para.join(' ') });
  }
  return blocks;
}

function parseList(lines, start) {
  const first = lines[start].match(LIST_RE);
  const base = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const m = lines[i].match(LIST_RE);
    if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
    const contentIndent = base + m[2].length + 1;
    const body = [m[3]];
    for (i++; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) {
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length && indentOf(lines[j]) >= contentIndent) {
          body.push('');
          continue;
        }
        break;
      }
      if (indentOf(line) >= contentIndent) body.push(line.slice(contentIndent));
      else if (!isBlockStart(line) && indentOf(line) > base) body.push(line.trim());
      else break;
    }
    items.push({ children: parseBlocks(body) });
  }
  return [{ type: 'list', ordered, start: ordered ? Number.parseInt(first[2], 10) : 1, items }, i];
}

function splitRow(row) {
  const cells = [];
  let cell = '';
  let code = false;
  for (const c of row.trim().replace(/^\|/, '').replace(/\|$/, '')) {
    if (c === '`') code = !code;
    if (c === '|' && !code) {
      cells.push(cell.trim());
      cell = '';
    } else cell += c;
  }
  cells.push(cell.trim());
  return cells;
}

function parseTable(rows) {
  const [head, separator, ...rest] = rows;
  const hasSeparator = separator && /^\s*\|?\s*:?-{2,}/.test(separator);
  const body = hasSeparator ? rest : [separator, ...rest].filter(Boolean);
  return { type: 'table', head: splitRow(head), rows: body.map(splitRow) };
}

const plainBlocks = (blocks) =>
  blocks
    .map((b) => {
      if (b.type === 'para' || b.type === 'heading') return plain(b.text);
      if (b.type === 'list') return b.items.map((it) => plainBlocks(it.children)).join(' ');
      if (b.type === 'quote') return plainBlocks(b.children);
      if (b.type === 'table')
        return [b.head, ...b.rows].map((r) => r.map(plain).join(' ')).join(' ');
      if (b.type === 'code') return b.text;
      return '';
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

// ---------------------------------------------------------------------------------------------
// Rendering

function link(url, text) {
  const external = /^https?:/i.test(url);
  const extra = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a href="${url}"${extra}>${text}</a>`;
}

/** Inline markdown to HTML. Everything is escaped first; code spans are protected throughout. */
function inline(md) {
  const codes = [];
  let s = String(md).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\uE000${codes.length - 1}\uE001`;
  });
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => link(url, text));
  s = s.replace(/&lt;(https?:\/\/[^\s]+?)&gt;/g, (_, url) => link(url, url));
  s = s.replace(/(^|[\s(·])(https?:\/\/[^\s<]+)/g, (_, pre, raw) => {
    const url = raw.replace(/[.,;:)]+$/, '');
    return pre + link(url, url) + raw.slice(url.length);
  });
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g, '$1<em>$2</em>');
  return s.replace(/\uE000(\d+)\uE001/g, (_, n) => `<code>${escapeHtml(codes[Number(n)])}</code>`);
}

function renderBlocks(blocks) {
  return blocks.map(renderBlock).join('\n');
}

function renderBlock(b) {
  switch (b.type) {
    case 'heading':
      return `<h${b.level} id="${b.id}">${inline(b.text)}</h${b.level}>`;
    case 'para':
      return `<p>${inline(b.text)}</p>`;
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      const start = b.ordered && b.start !== 1 ? ` start="${b.start}"` : '';
      return `<${tag}${start}>${b.items.map((it) => `<li>${renderItem(it)}</li>`).join('')}</${tag}>`;
    }
    case 'table':
      return renderTable(b);
    case 'code':
      return renderCode(b);
    case 'quote':
      return `<blockquote>${renderBlocks(b.children)}</blockquote>`;
    default:
      return '';
  }
}

function renderItem(item) {
  const [first, ...rest] = item.children;
  return first?.type === 'para'
    ? inline(first.text) + renderBlocks(rest)
    : renderBlocks(item.children);
}

function renderTable(t) {
  const isDecisions = /^decision$/i.test(t.head[0] ?? '');
  const rowClass = (row) => {
    if (!isDecisions) return '';
    const text = row.join(' ');
    if (/undecided|confirm with the user/i.test(text)) return ' class="row-pending"';
    if (/\bdecided\b/i.test(text)) return ' class="row-decided"';
    return '';
  };
  const head = t.head.map((c) => `<th scope="col">${inline(c)}</th>`).join('');
  const body = t.rows
    .map((r) => `<tr${rowClass(r)}>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderCode(b) {
  const lang = b.lang ? `<span class="code-lang">${escapeHtml(b.lang)}</span>` : '';
  return (
    `<div class="code-block">${lang}<button type="button" class="copy-btn">Copy</button>` +
    `<pre><code>${escapeHtml(b.text)}</code></pre></div>`
  );
}

// ---------------------------------------------------------------------------------------------
// Document model

const source = readFileSync(SRC, 'utf8');
const sourceHash = createHash('sha256').update(source).digest('hex').slice(0, 12);
const allBlocks = parseBlocks(source.split(/\r?\n/));

for (const b of allBlocks) {
  if (b.type === 'heading') b.id = uniqueId(slugify(b.text));
}

const firstSection = allBlocks.findIndex((b) => b.type === 'heading' && b.level === 2);
if (firstSection < 0) throw new Error('ROADMAP.md has no "## " sections');
const intro = allBlocks.slice(0, firstSection);
const title = intro.find((b) => b.type === 'heading' && b.level === 1);
const introParas = intro.filter((b) => b.type === 'para');
const metaPara = introParas.find((b) => /Last updated/.test(b.text));
const lede = introParas.find((b) => b !== metaPara);
const lastUpdated = metaPara?.text.match(/\*\*Last updated:\*\*\s*([^·]+?)\s*(?:·|$)/)?.[1] ?? '';
const currentStage = metaPara?.text.match(/\*\*Current stage:\*\*\s*(.+)$/)?.[1] ?? '';

const sections = [];
for (const b of allBlocks.slice(firstSection)) {
  if (b.type === 'heading' && b.level === 2) {
    sections.push({ title: b.text, id: b.id, heading: b, blocks: [] });
  } else if (b.type !== 'hr') {
    sections.at(-1).blocks.push(b);
  }
}

/** `## Track X — …` sections, in document order. Stages with ids like `X1`, `X2` belong to track X. */
const tracks = new Map();
const trackOf = (stageId) => tracks.get(stageId.match(/^([A-Z])\d+$/)?.[1]) ?? null;

for (const sec of sections) {
  const stage = sec.title.match(/^Stage\s+(\S+)\s+—\s+(.+)$/);
  if (stage) {
    Object.assign(sec, {
      kind: 'stage',
      stageId: stage[1],
      name: stage[2].replace(/\s*\(deepening\)\s*$/i, ''),
    });
  } else if (/^Final capstone\b/i.test(sec.title)) {
    const rest = sec.title.replace(/^Final capstone\s*—\s*/i, '');
    Object.assign(sec, { kind: 'stage', stageId: 'C', name: capitalize(rest) });
  } else if (/^Track\s+[A-Z]\b/.test(sec.title)) {
    const letter = sec.title.match(/^Track\s+([A-Z])\b/)[1];
    tracks.set(letter, { letter, slot: (tracks.size % 3) + 1 });
    Object.assign(sec, { kind: 'track', trackLetter: letter });
  } else if (/^Progress$/i.test(sec.title)) sec.kind = 'progress';
  else sec.kind = 'doc';
  sec.pageId = `page-${sec.id}`;
}

const stageSections = sections.filter((s) => s.kind === 'stage');
const progressSection = sections.find((s) => s.kind === 'progress');
if (!stageSections.length) throw new Error('No "## Stage …" sections found');

// Progress table: track and seed status per stage.
const normalizeStatus = (s = '') => {
  if (/not started/i.test(s)) return 'todo';
  if (/done|finished|complete/i.test(s)) return 'done';
  if (/progress|doing|started/i.test(s)) return 'doing';
  return 'todo';
};
const progressRows = new Map();
const progressTable = progressSection?.blocks.find((b) => b.type === 'table');
if (progressTable) {
  const col = (name) => progressTable.head.findIndex((h) => h.toLowerCase() === name);
  const [cStage, cTopic, cTrack, cStatus] = ['stage', 'topic', 'track', 'status'].map(col);
  for (const row of progressTable.rows) {
    progressRows.set(plain(row[cStage]), {
      topic: plain(row[cTopic] ?? ''),
      track: /deep/i.test(row[cTrack] ?? '') ? 'deepening' : 'core',
      status: normalizeStatus(row[cStatus]),
    });
  }
}

// Hours: "Rough time per stage: 0 → 1–2 h · S1 → 3–5 h · … · final capstone → 4–8 h."
const hours = new Map();
let capstoneHours = null;
const timePara = progressSection?.blocks.find(
  (b) => b.type === 'para' && /Rough time per stage/i.test(b.text),
);
if (timePara) {
  for (const m of timePara.text.matchAll(
    /(?:^|·|:)\s*([^·:→]+?)\s*→\s*(\d+)\s*[–-]\s*(\d+)\s*h/g,
  )) {
    const key = /capstone/i.test(m[1]) ? 'C' : m[1].trim();
    hours.set(key, [Number(m[2]), Number(m[3])]);
  }
  const cap = timePara.text.match(/stage capstone adds roughly (\d+)\s*[–-]\s*(\d+) hours/i);
  if (cap) capstoneHours = [Number(cap[1]), Number(cap[2])];
}

// Parts of a stage, started by a paragraph that opens with a bold label.
function splitParts(blocks) {
  const parts = [];
  for (const b of blocks) {
    const m = b.type === 'para' && b.text.match(/^\*\*(.+?)\*\*\s*(.*)$/s);
    if (m) {
      const label = m[1].trim().replace(/[:.]\s*$/, '');
      parts.push({ label, lead: m[2].replace(/^:\s*/, ''), blocks: [], kind: partKind(label) });
    } else {
      if (!parts.length) parts.push({ label: '', lead: '', blocks: [], kind: 'plain' });
      parts.at(-1).blocks.push(b);
    }
  }
  return parts;
}

function partKind(label) {
  const rules = [
    [/^goal$/i, 'goal'],
    [/^why it matters/i, 'why'],
    [/^(steps|exercise|do)\b/i, 'do'],
    [/^break it$/i, 'break'],
    [/^checkpoint$/i, 'checkpoint'],
    [/^done when$/i, 'done'],
    [/^gap$/i, 'gap'],
    [/^stage capstone/i, 'capstone'],
    [/^verification status/i, 'verify'],
    [/^before any real-cloud step/i, 'warning'],
  ];
  return rules.find(([re]) => re.test(label))?.[1] ?? 'plain';
}

// ---------------------------------------------------------------------------------------------
// Checklists

let checkboxCount = 0;
let checklistItems = 0;

/** items: [{ html, text, after? }] — `text` keys the saved state, so editing an item resets only it. */
function checklist(stageId, kind, items) {
  const seen = new Map();
  const lis = items.map(({ html, text, after = '' }) => {
    let key = `${stageId}|${kind}|${shortHash(text)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n) key += `-${n}`;
    const id = `chk-${++checkboxCount}`;
    checklistItems++;
    return (
      `<li><input type="checkbox" id="${id}" data-check="${escapeHtml(key)}">` +
      `<label for="${id}">${html}</label>${after}</li>`
    );
  });
  return `<ul class="checklist">${lis.join('')}</ul>`;
}

const itemsFromList = (list) =>
  list.items.map((it) => {
    const [first, ...rest] = it.children;
    const lead = first?.type === 'para' ? first.text : '';
    return {
      html: inline(capitalize(lead)),
      text: plainBlocks(it.children),
      after: renderBlocks(first?.type === 'para' ? rest : it.children),
    };
  });

const itemsFromText = (pieces) =>
  pieces.map((p) => ({ html: inline(capitalize(p)), text: plain(p) }));

/** Items split out of one sentence: drop the sentence's final period so every item ends alike. */
const listPieces = (text) => splitTopLevel(text).map((p) => p.replace(/(?<!\.\.)\.$/, ''));

// ---------------------------------------------------------------------------------------------
// Pages

const trackLabel = { core: 'Core', deepening: 'Deepening' };

function stageLabel(sec) {
  return sec.stageId === 'C' ? 'Final capstone' : `Stage ${sec.stageId}`;
}

function stageTags(sec) {
  const meta = progressRows.get(sec.stageId);
  const tags = [];
  if (meta) tags.push(`<span class="tag tag-${meta.track}">${trackLabel[meta.track]}</span>`);
  const track = trackOf(sec.stageId);
  if (track) tags.push(`<span class="tag tag-track-${track.slot}">Track ${track.letter}</span>`);
  return tags.join('');
}

function hoursText(sec, withCapstone) {
  const h = hours.get(sec.stageId);
  if (!h) return '';
  const cap = withCapstone && sec.hasCapstone && capstoneHours;
  return `≈ ${h[0]}–${h[1]} h${cap ? ` + ${capstoneHours[0]}–${capstoneHours[1]} h capstone` : ''}`;
}

function renderPart(sec, part) {
  const pid = uniqueId(`${sec.id}--${slugify(part.label || 'details')}`);
  part.pid = pid;
  const lead = part.lead ? `<p>${inline(part.lead)}</p>` : '';
  const heading = `<h3>${inline(part.label)}</h3>`;
  const id = sec.stageId;

  switch (part.kind) {
    case 'why': {
      const quote = part.blocks.find((b) => b.type === 'quote');
      const note = part.lead
        ? `<span class="story-note">${inline(part.lead.replace(/^\*\((.*)\)\*$/, '$1'))}</span>`
        : '';
      const body = quote ? renderBlocks(quote.children) : lead;
      const others = renderBlocks(part.blocks.filter((b) => b !== quote));
      return `<aside class="story" id="${pid}" aria-label="Why it matters"><p class="story-eyebrow">Why it matters ${note}</p>${body}${others}</aside>`;
    }
    case 'do':
    case 'break': {
      const list = part.blocks.find((b) => b.type === 'list');
      let body;
      if (list) {
        const others = part.blocks.filter((b) => b !== list);
        body = lead + checklist(id, part.kind, itemsFromList(list)) + renderBlocks(others);
      } else {
        const pieces = listPieces(part.lead);
        body =
          pieces.length > 1
            ? checklist(id, part.kind, itemsFromText(pieces)) + renderBlocks(part.blocks)
            : lead + renderBlocks(part.blocks);
      }
      return `<section class="part part-${part.kind}" id="${pid}">${heading}${body}</section>`;
    }
    case 'checkpoint': {
      const pieces = splitSentences(part.lead);
      const hint =
        '<p class="part-hint">Tick a question when you can answer it without looking.</p>';
      return `<section class="part part-checkpoint" id="${pid}">${heading}${hint}${checklist(id, 'checkpoint', itemsFromText(pieces))}${renderBlocks(part.blocks)}</section>`;
    }
    case 'done':
      return `<section class="part part-done" id="${pid}">${heading}${lead}${renderBlocks(part.blocks)}</section>`;
    case 'gap':
      return `<section class="callout callout-note" id="${pid}"><p class="callout-title">LocalStack gap</p>${lead}${renderBlocks(part.blocks)}</section>`;
    case 'warning':
      return `<section class="callout callout-warn" id="${pid}"><p class="callout-title">${inline(part.label)}</p>${lead}${renderBlocks(part.blocks)}</section>`;
    case 'verify':
      return `<details class="verify" id="${pid}"><summary>${inline(part.label)}</summary>${lead}${renderBlocks(part.blocks)}</details>`;
    case 'capstone':
      return renderCapstone(sec, part, pid);
    default:
      return `<section class="part" id="${pid}">${part.label ? heading : ''}${lead}${renderBlocks(part.blocks)}</section>`;
  }
}

function renderCapstone(sec, part, pid) {
  const name = part.label.replace(/^Stage capstone\s*—\s*/i, '').replace(/^"(.*)"$/, '$1');
  const writeup = part.lead
    ? `<p class="capstone-writeup">${inline(capitalize(part.lead.replace(/^\*\((.*)\)\*$/, '$1')))}</p>`
    : '';
  const list = part.blocks.find((b) => b.type === 'list');
  const fields = (list?.items ?? []).map((it) => {
    const text = it.children[0]?.type === 'para' ? it.children[0].text : '';
    const m = text.match(/^\*\*(.+?):\*\*\s*(.*)$/s);
    return m ? { key: m[1], value: m[2] } : { key: '', value: text };
  });
  const body = fields
    .map(({ key, value }) => {
      if (/^scenario$/i.test(key)) return `<p class="capstone-scenario">${inline(value)}</p>`;
      if (/^accept when$/i.test(key)) {
        return `<h4>Accept when</h4>${checklist(sec.stageId, 'accept', itemsFromText(listPieces(value)))}`;
      }
      if (/^deliver$/i.test(key)) {
        const pieces = splitTopLevel(value);
        const content =
          pieces.length > 1
            ? `<ul>${pieces.map((p) => `<li>${inline(capitalize(p))}</li>`).join('')}</ul>`
            : `<p>${inline(capitalize(value))}</p>`;
        return `<h4>Deliver</h4>${content}`;
      }
      if (/^stretch$/i.test(key)) {
        return `<p class="capstone-stretch"><span class="tag tag-stretch">Stretch</span> ${inline(capitalize(value))}</p>`;
      }
      return key ? `<h4>${inline(key)}</h4><p>${inline(value)}</p>` : `<p>${inline(value)}</p>`;
    })
    .join('');
  return (
    `<section class="capstone" id="${pid}" aria-label="Stage capstone">` +
    `<p class="capstone-eyebrow">Stage capstone</p><h3>${inline(name)}</h3>${writeup}${body}</section>`
  );
}

function renderStage(sec, prev, next) {
  const id = sec.stageId;
  const parts = sec.parts;
  const goal = parts.find((p) => p.kind === 'goal');
  const statusRadios = [
    ['todo', 'Not started'],
    ['doing', 'In progress'],
    ['done', 'Done'],
  ]
    .map(
      ([value, label]) =>
        `<label class="seg"><input type="radio" name="status-${escapeHtml(id)}" value="${value}"><span>${label}</span></label>`,
    )
    .join('');
  const body = parts
    .filter((p) => p.kind !== 'goal')
    .map((p) => renderPart(sec, p))
    .join('\n');
  const toc = parts
    .filter((p) => p.kind !== 'goal' && p.label && p.pid)
    .map(
      (p) =>
        `<a href="#${p.pid}">${escapeHtml(plain(p.kind === 'capstone' ? 'Capstone' : p.label.replace(/\s*\(.*\)$/, '')))}</a>`,
    )
    .join('');
  const noteFile =
    id === 'C' ? 'learning/notes/final-capstone.md' : `learning/notes/stage-${id}.md`;
  const pager = [
    prev
      ? `<a class="pager-prev" href="#${prev.id}"><span>Previous</span>${escapeHtml(stageLabel(prev))} · ${inline(prev.name)}</a>`
      : '<span></span>',
    next
      ? `<a class="pager-next" href="#${next.id}"><span>Next</span>${escapeHtml(stageLabel(next))} · ${inline(next.name)}</a>`
      : '<span></span>',
  ].join('');

  return `
<section class="page page-stage" id="${sec.pageId}" data-stage-page="${escapeHtml(id)}" hidden>
  <header class="stage-header">
    <p class="eyebrow"><span class="stage-id">${escapeHtml(stageLabel(sec))}</span>${stageTags(sec)}<span class="hours">${hoursText(sec, true)}</span></p>
    <h2 id="${sec.id}" tabindex="-1">${inline(sec.name)}</h2>
    ${goal ? `<p class="goal"><strong>Goal:</strong> ${inline(goal.lead)}</p>` : ''}
    <div class="stage-controls">
      <fieldset class="segmented" data-status-for="${escapeHtml(id)}"><legend class="sr-only">Status of ${escapeHtml(stageLabel(sec))}</legend>${statusRadios}</fieldset>
      <div class="meter" data-meter="${escapeHtml(id)}"><span class="bar"><span></span></span><span class="meter-text">0 / 0</span></div>
    </div>
    ${toc ? `<nav class="part-toc" aria-label="Sections of this stage">${toc}</nav>` : ''}
  </header>
  ${body}
  <section class="part part-notes">
    <h3>Your notes</h3>
    <p class="part-hint">Predictions vs. what happened. Saved in this browser only; copy anything worth keeping into <code>${noteFile}</code>.</p>
    <textarea data-notes="${escapeHtml(id)}" rows="5" aria-label="Notes for ${escapeHtml(stageLabel(sec))}"></textarea>
    <span class="saved" aria-live="polite"></span>
  </section>
  <nav class="pager" aria-label="Stage navigation">${pager}</nav>
</section>`;
}

function renderDocPage(sec) {
  const body =
    sec.kind === 'track'
      ? splitParts(sec.blocks)
          .map((p) => renderPart({ ...sec, stageId: 'track' }, p))
          .join('\n')
      : renderBlocks(sec.blocks);
  return `
<section class="page page-doc" id="${sec.pageId}" hidden>
  <h2 id="${sec.id}" tabindex="-1">${inline(sec.title)}</h2>
  ${body}
</section>`;
}

// Parse parts for every stage up front (capstone presence feeds the hour estimates and the nav).
for (const sec of stageSections) {
  sec.parts = splitParts(sec.blocks);
  sec.hasCapstone = sec.parts.some((p) => p.kind === 'capstone');
}

// Navigation order: document order of stages and track intros.
const pathSections = sections.filter((s) => s.kind === 'stage' || s.kind === 'track');
const firstPathIndex = sections.indexOf(pathSections[0]);
const lastPathIndex = sections.indexOf(pathSections.at(-1));
const startSections = sections.slice(0, firstPathIndex).filter((s) => s.kind === 'doc');
const referenceSections = sections.slice(lastPathIndex + 1).filter((s) => s.kind === 'doc');

const statusDot = '<span class="status-dot" aria-hidden="true"></span>';

function pathItem(sec, variant) {
  if (sec.kind === 'track') {
    const { letter, slot } = tracks.get(sec.trackLetter);
    const attrs = `class="${variant === 'nav' ? 'nav-divider' : 'path-divider'} track-${slot}" data-trackletter="${letter}"`;
    return variant === 'nav'
      ? `<li ${attrs}><a href="#${sec.id}" data-page="${sec.pageId}">${inline(sec.title)}</a></li>`
      : `<li ${attrs}><a href="#${sec.id}">${inline(sec.title)}</a><span>woven into the path from here</span></li>`;
  }
  const meta = progressRows.get(sec.stageId) ?? { track: 'core' };
  const attrs = `data-stage="${escapeHtml(sec.stageId)}" data-track="${meta.track}" data-trackletter="${trackOf(sec.stageId)?.letter ?? ''}"`;
  const shortId = sec.stageId === 'C' ? 'Final' : escapeHtml(sec.stageId);
  if (variant === 'nav') {
    return `<li ${attrs}><a href="#${sec.id}" data-page="${sec.pageId}">${statusDot}<span class="nav-id">${shortId}</span><span class="nav-title">${inline(sec.name)}</span></a></li>`;
  }
  return `<li class="path-item" ${attrs}><a class="path-card" href="#${sec.id}">
    ${statusDot}<span class="path-id">${shortId}</span>
    <span class="path-main"><span class="path-title">${inline(sec.name)}</span><span class="path-tags">${stageTags(sec)}<span class="hours">${hoursText(sec, false)}</span></span></span>
    <span class="path-progress"><span class="path-status">Not started</span><span class="bar"><span></span></span><span class="path-count"></span></span>
  </a></li>`;
}

const navLink = (sec) =>
  `<li><a href="#${sec.id}" data-page="${sec.pageId}">${inline(sec.title)}</a></li>`;

const filters = [
  ['all', 'All'],
  ['core', 'Core'],
  ['deepening', 'Deepening'],
  ...[...tracks.values()].map(({ letter }) => [`track-${letter}`, `Track ${letter}`]),
  ['open', 'Not done'],
]
  .map(
    ([v, label], i) =>
      `<button type="button" class="chip" data-filter="${v}" aria-pressed="${i === 0}">${label}</button>`,
  )
  .join('');

const sidebar = `
<nav id="sidebar" aria-label="Roadmap">
  <div class="nav-group"><p class="nav-heading">Start here</p><ul>
    <li><a href="#overview" data-page="overview">Overview and progress</a></li>
    ${startSections.map(navLink).join('')}
  </ul></div>
  <div class="nav-group"><p class="nav-heading">Path</p><ul class="nav-stages">${pathSections.map((s) => pathItem(s, 'nav')).join('')}</ul></div>
  <div class="nav-group"><p class="nav-heading">Reference</p><ul>${referenceSections.map(navLink).join('')}</ul></div>
  <p class="nav-foot">Generated from <code>learning/ROADMAP.md</code><br>${lastUpdated ? `Roadmap updated ${escapeHtml(lastUpdated)} · ` : ''}source ${sourceHash}</p>
</nav>`;

const overview = `
<section class="page page-overview" id="overview">
  <header class="hero">
    <p class="eyebrow">Learning roadmap</p>
    <h1 id="${title?.id ?? 'roadmap'}">${inline(title?.text ?? 'Roadmap')}</h1>
    ${lede ? `<p class="lede">${inline(lede.text)}</p>` : ''}
    ${metaPara ? `<p class="hero-meta">${inline(metaPara.text)}</p>` : ''}
  </header>
  <div class="stats">
    <div class="stat"><span class="stat-label">Stages done</span><span class="stat-value" data-stat="stages">–</span></div>
    <div class="stat"><span class="stat-label">Checklist items</span><span class="stat-value" data-stat="items">–</span></div>
    <div class="stat"><span class="stat-label">Time left (estimate)</span><span class="stat-value" data-stat="hours">–</span><span class="stat-sub" data-stat="hours-total"></span></div>
    <div class="stat stat-next"><span class="stat-label">Up next</span><a class="stat-value" data-stat="next" href="#overview">–</a></div>
  </div>
  <div class="path-head">
    <h2 id="your-path">Your path</h2>
    <fieldset class="filters"><legend class="sr-only">Filter stages</legend>${filters}</fieldset>
  </div>
  <ol class="path">${pathSections.map((s) => pathItem(s, 'card')).join('')}</ol>
  <section class="tools" aria-labelledby="progress-data">
    <h2 id="progress-data">Your progress data</h2>
    <p>Statuses, ticks and notes are stored in this browser only. Paste the summary to Claude to update <code>ROADMAP.md</code>, or export a file to move to another browser.</p>
    <div class="tool-buttons">
      <button type="button" class="btn btn-primary" data-action="copy-summary">Copy summary for Claude</button>
      <button type="button" class="btn" data-action="export">Export JSON</button>
      <label class="btn">Import JSON<input type="file" accept="application/json,.json" data-action="import" class="sr-only"></label>
      <button type="button" class="btn btn-danger" data-action="reset">Reset</button>
    </div>
  </section>
  ${
    progressSection
      ? `<details class="source"><summary>Progress table and time estimates as written in ROADMAP.md</summary>
    <h2 id="${progressSection.id}">${inline(progressSection.title)}</h2>${renderBlocks(progressSection.blocks)}</details>`
      : ''
  }
</section>`;

const pages = sections
  .map((sec) => {
    if (sec.kind === 'progress') return '';
    if (sec.kind === 'stage') {
      const i = stageSections.indexOf(sec);
      return renderStage(sec, stageSections[i - 1], stageSections[i + 1]);
    }
    return renderDocPage(sec);
  })
  .join('\n');

// ---------------------------------------------------------------------------------------------
// Search index: one entry per doc subsection and per stage part.

const searchIndex = [];
for (const sec of sections) {
  if (sec.kind === 'stage') {
    const label = `${stageLabel(sec)} · ${plain(sec.name)}`;
    const goal = sec.parts.find((p) => p.kind === 'goal');
    searchIndex.push({ t: sec.id, title: label, text: plain(goal?.lead ?? '') });
    for (const p of sec.parts) {
      if (p.kind === 'goal' || !p.pid) continue;
      searchIndex.push({
        t: p.pid,
        title: `${label} › ${plain(p.kind === 'capstone' ? 'Capstone' : p.label)}`,
        text: `${plain(`${p.label} ${p.lead}`)} ${plainBlocks(p.blocks)}`,
      });
    }
    continue;
  }
  let entry = { t: sec.id, title: plain(sec.title), text: '' };
  searchIndex.push(entry);
  for (const b of sec.blocks) {
    if (b.type === 'heading') {
      entry = { t: b.id, title: `${plain(sec.title)} › ${plain(b.text)}`, text: '' };
      searchIndex.push(entry);
    } else entry.text += ` ${plainBlocks([b])}`;
  }
}
for (const e of searchIndex) e.text = e.text.replace(/\s+/g, ' ').trim();

const data = {
  meta: { lastUpdated, currentStage, sourceHash },
  capstoneHours,
  stages: stageSections.map((sec) => ({
    id: sec.stageId,
    target: sec.id,
    label: stageLabel(sec),
    name: plain(sec.name),
    seed: progressRows.get(sec.stageId)?.status ?? 'todo',
    hours: hours.get(sec.stageId) ?? null,
    hasCapstone: sec.hasCapstone,
  })),
  search: searchIndex,
};

// ---------------------------------------------------------------------------------------------
// Styles

const LIGHT = `
  color-scheme: light;
  --bg: #f6f7f9; --surface: #ffffff; --surface-2: #f1f3f6; --text: #16181d; --muted: #586070; --border: #e1e4ea;
  --accent: #4f46e5; --accent-soft: #eef0ff; --accent-text: #3730a3;
  --core: #4f46e5; --core-soft: #eceefe; --core-text: #3730a3;
  --deep: #9333ea; --deep-soft: #f4ecff; --deep-text: #6b21a8;
  --track1: #0f766e; --track1-soft: #e3f5f2; --track1-text: #115e59;
  --track2: #be123c; --track2-soft: #ffe8ec; --track2-text: #9f1239;
  --track3: #0369a1; --track3-soft: #e3f2fd; --track3-text: #075985;
  --todo: #9aa1ad; --doing: #d97706; --doing-soft: #fff4df; --doing-text: #92400e;
  --done: #16a34a; --done-soft: #e5f6ea; --done-text: #166534;
  --warn-bg: #fff7e6; --warn-border: #f0c36a; --note-bg: #f1f5fb; --note-border: #c8d4e6;
  --code-bg: #eef0f3; --pre-bg: #0f172a; --pre-text: #e2e8f0;
  --shadow: 0 1px 2px rgb(16 24 40 / 6%), 0 2px 6px rgb(16 24 40 / 6%);`;

const DARK = `
  color-scheme: dark;
  --bg: #0e1116; --surface: #151a21; --surface-2: #1b212a; --text: #e6e9ee; --muted: #9ba5b3; --border: #29303b;
  --accent: #8d8dff; --accent-soft: #1e2140; --accent-text: #c9caff;
  --core: #8d8dff; --core-soft: #212548; --core-text: #c9caff;
  --deep: #c084fc; --deep-soft: #2b1f3c; --deep-text: #e9d5ff;
  --track1: #2dd4bf; --track1-soft: #12312e; --track1-text: #99f6e4;
  --track2: #fb7185; --track2-soft: #3a1520; --track2-text: #fecdd3;
  --track3: #38bdf8; --track3-soft: #0f2a3d; --track3-text: #bae6fd;
  --todo: #67707e; --doing: #f59e0b; --doing-soft: #36280f; --doing-text: #fcd34d;
  --done: #34d399; --done-soft: #0f3025; --done-text: #a7f3d0;
  --warn-bg: #2d2412; --warn-border: #8a6a24; --note-bg: #17202b; --note-border: #2e3a4c;
  --code-bg: #232a35; --pre-bg: #0a0e14; --pre-text: #e2e8f0;
  --shadow: 0 1px 2px rgb(0 0 0 / 45%);`;

const CSS = `
:root {${LIGHT}
  --radius: 12px; --radius-sm: 8px; --topbar-h: 56px; --sidebar-w: 292px;
  --font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${DARK} } }
:root[data-theme="dark"] {${DARK} }
:root[data-theme="light"] {${LIGHT} }

*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
html { scroll-padding-top: calc(var(--topbar-h) + 20px); }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 var(--font); -webkit-font-smoothing: antialiased; }
a { color: var(--accent); text-underline-offset: 2px; }
a:hover { text-decoration-thickness: 2px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
[tabindex="-1"]:focus { outline: none; }
.sr-only { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
code { font-family: var(--mono); font-size: .875em; background: var(--code-bg); padding: .12em .38em; border-radius: 6px; overflow-wrap: anywhere; }
mark.hit { background: #fde68a; color: #1f2937; border-radius: 3px; padding: 0 .1em; }

/* Top bar */
.topbar { position: sticky; top: 0; z-index: 40; height: var(--topbar-h); display: flex; align-items: center; gap: 12px; padding: 0 16px;
  background: color-mix(in srgb, var(--surface) 90%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
.brand { font-weight: 650; color: var(--text); text-decoration: none; white-space: nowrap; letter-spacing: -.01em; }
.brand span { color: var(--muted); font-weight: 500; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text); border-radius: 10px; cursor: pointer; flex: none; }
.icon-btn:hover { background: var(--surface-2); }
.icon-btn svg { width: 18px; height: 18px; }
.menu-btn { display: none; }
.search { position: relative; flex: 1; max-width: 460px; margin-left: auto; }
.search input { width: 100%; height: 38px; padding: 0 12px 0 34px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2);
  color: var(--text); font: inherit; font-size: .95rem; }
.search input:focus { outline: none; border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }
.search svg { position: absolute; left: 10px; top: 11px; width: 16px; height: 16px; color: var(--muted); pointer-events: none; }
.search-results { position: absolute; top: 44px; left: 0; right: 0; max-height: min(70vh, 520px); overflow-y: auto; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 12px 32px rgb(0 0 0 / 18%); padding: 6px; }
.result { display: block; padding: 8px 10px; border-radius: 8px; color: var(--text); text-decoration: none; }
.result:hover, .result:focus { background: var(--surface-2); outline: none; }
.result-title { display: block; font-weight: 600; font-size: .92rem; }
.result-snippet { display: block; color: var(--muted); font-size: .85rem; line-height: 1.45; }
.result-empty { padding: 10px; color: var(--muted); font-size: .9rem; }
.topbar-progress { display: flex; align-items: center; gap: 8px; font-size: .85rem; color: var(--muted); white-space: nowrap; }
.topbar-progress .bar { width: 110px; }

.bar { display: block; height: 6px; background: var(--surface-2); border-radius: 99px; overflow: hidden; border: 1px solid var(--border); }
.bar > span { display: block; height: 100%; width: 0; background: var(--accent); border-radius: 99px; transition: width .25s ease; }

/* Layout */
.layout { display: grid; grid-template-columns: var(--sidebar-w) minmax(0, 1fr); align-items: start; }
#sidebar { position: sticky; top: var(--topbar-h); height: calc(100vh - var(--topbar-h)); overflow-y: auto; padding: 18px 12px 28px;
  border-right: 1px solid var(--border); background: var(--surface); }
main { min-width: 0; padding: 36px clamp(16px, 4vw, 52px) 96px; }
.page { max-width: 860px; margin: 0 auto; }
.backdrop { display: none; }

/* Sidebar */
.nav-group { margin-bottom: 18px; }
.nav-heading { margin: 0 10px 6px; font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
#sidebar ul { list-style: none; margin: 0; padding: 0; }
#sidebar a { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 8px; color: var(--text); text-decoration: none; font-size: .92rem; line-height: 1.35; }
#sidebar a:hover { background: var(--surface-2); }
#sidebar a[aria-current="page"] { background: var(--accent-soft); color: var(--accent-text); font-weight: 600; }
.nav-id { flex: none; min-width: 2.4em; font-family: var(--mono); font-size: .78rem; color: var(--muted); }
.nav-title { min-width: 0; }
.nav-divider a { margin-top: 6px; font-size: .78rem !important; font-weight: 650; text-transform: uppercase; letter-spacing: .04em; }
.nav-divider.track-1 a, .path-divider.track-1 a { color: var(--track1-text) !important; }
.nav-divider.track-2 a, .path-divider.track-2 a { color: var(--track2-text) !important; }
.nav-divider.track-3 a, .path-divider.track-3 a { color: var(--track3-text) !important; }
.nav-foot { margin: 22px 10px 0; font-size: .75rem; color: var(--muted); line-height: 1.5; }
.nav-foot code { font-size: .95em; }

.status-dot { flex: none; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--todo); background: transparent; }
[data-status="doing"] .status-dot { border-color: var(--doing); background: var(--doing); }
[data-status="done"] .status-dot { border-color: var(--done); background: var(--done); }

/* Typography */
h1, h2, h3, h4 { line-height: 1.25; letter-spacing: -.015em; }
h1 { font-size: clamp(1.8rem, 3.5vw, 2.4rem); margin: .2em 0 .4em; }
.page > h2, .stage-header h2 { font-size: clamp(1.5rem, 2.8vw, 1.95rem); margin: .2em 0 .6em; }
h3 { font-size: 1.12rem; margin: 1.6em 0 .5em; }
h4 { font-size: .95rem; margin: 1.2em 0 .4em; }
p, ul, ol { margin: .6em 0 1em; }
ul, ol { padding-left: 1.4em; }
li { margin: .3em 0; }
blockquote { margin: 1em 0; padding: .2em 1em; border-left: 3px solid var(--border); color: var(--muted); }
.eyebrow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; font-size: .82rem; color: var(--muted); }
.lede { font-size: 1.12rem; color: var(--muted); max-width: 70ch; }
.hero-meta { font-size: .9rem; color: var(--muted); }

/* Tables and code */
.table-wrap { overflow-x: auto; margin: 1em 0 1.4em; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
table { width: 100%; border-collapse: collapse; font-size: .9rem; }
th, td { text-align: left; vertical-align: top; padding: 9px 12px; border-bottom: 1px solid var(--border); }
th { background: var(--surface-2); font-weight: 650; white-space: nowrap; }
tbody tr:last-child td { border-bottom: 0; }
tr.row-pending td:first-child { box-shadow: inset 3px 0 var(--doing); }
tr.row-decided td:first-child { box-shadow: inset 3px 0 var(--done); }
.code-block { position: relative; margin: .8em 0 1.2em; }
.code-block pre { margin: 0; padding: 14px 16px; background: var(--pre-bg); color: var(--pre-text); border-radius: var(--radius-sm); overflow-x: auto; font-size: .85rem; line-height: 1.55; }
.code-block code { background: none; padding: 0; color: inherit; font-size: inherit; overflow-wrap: normal; }
.code-lang { position: absolute; left: 12px; top: -9px; font-family: var(--mono); font-size: .7rem; background: var(--surface); color: var(--muted); border: 1px solid var(--border); border-radius: 6px; padding: 0 6px; }
.copy-btn { position: absolute; top: 8px; right: 8px; border: 1px solid rgb(255 255 255 / 18%); background: rgb(255 255 255 / 8%); color: #e2e8f0; border-radius: 6px; padding: 2px 10px; font: inherit; font-size: .75rem; cursor: pointer; }
.copy-btn:hover { background: rgb(255 255 255 / 16%); }

/* Tags and pills */
.tag { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 99px; font-size: .74rem; font-weight: 600; line-height: 1.6; white-space: nowrap; }
.tag-core { background: var(--core-soft); color: var(--core-text); }
.tag-deepening { background: var(--deep-soft); color: var(--deep-text); }
.tag-track-1 { background: var(--track1-soft); color: var(--track1-text); }
.tag-track-2 { background: var(--track2-soft); color: var(--track2-text); }
.tag-track-3 { background: var(--track3-soft); color: var(--track3-text); }
.tag-stretch { background: var(--surface-2); color: var(--muted); border: 1px solid var(--border); }
.stage-id { font-family: var(--mono); font-weight: 650; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0 7px; }
.hours { font-size: .8rem; color: var(--muted); }

/* Overview */
.hero { padding: 8px 0 18px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin: 8px 0 28px; }
.stat { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.stat-label { font-size: .78rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; font-weight: 650; }
.stat-value { font-size: 1.3rem; font-weight: 700; color: var(--text); text-decoration: none; }
a.stat-value:hover { color: var(--accent); }
.stat-sub { font-size: .78rem; color: var(--muted); line-height: 1.4; }
.path-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
.path-head h2 { margin: 0; font-size: 1.35rem; }
.filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; border: 0; min-width: 0; }
.chip { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 99px; padding: 4px 12px; font: inherit; font-size: .84rem; cursor: pointer; }
.chip:hover { background: var(--surface-2); }
.chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.path { list-style: none; margin: 14px 0 32px; padding: 0; display: grid; gap: 8px; }
.path-card { display: grid; grid-template-columns: auto 3.4rem minmax(0, 1fr) 170px; align-items: center; gap: 12px; padding: 12px 16px;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); text-decoration: none; box-shadow: var(--shadow); transition: border-color .15s, transform .15s; }
.path-card:hover { border-color: var(--accent); transform: translateY(-1px); }
.path-id { font-family: var(--mono); font-weight: 650; color: var(--muted); font-size: .9rem; }
.path-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.path-title { font-weight: 600; }
.path-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.path-progress { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4px 8px; }
.path-progress .bar { grid-column: 1 / -1; }
.path-status { font-size: .8rem; font-weight: 650; color: var(--muted); }
.path-count { font-size: .78rem; color: var(--muted); }
[data-status="doing"] .path-status { color: var(--doing-text); }
[data-status="done"] .path-status { color: var(--done-text); }
[data-status="done"] .path-progress .bar > span { background: var(--done); }
.path-divider { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin: 14px 4px 2px; }
.path-divider a { font-weight: 700; text-decoration: none; text-transform: uppercase; font-size: .8rem; letter-spacing: .05em; }
.path-divider span { font-size: .82rem; color: var(--muted); }
.tools { padding: 18px 20px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 20px; }
.tools h2 { margin: 0 0 6px; font-size: 1.1rem; }
.tools p { margin: 0 0 12px; color: var(--muted); font-size: .92rem; }
.tool-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { display: inline-flex; align-items: center; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 10px; padding: 7px 14px; font: inherit; font-size: .9rem; cursor: pointer; }
.btn:hover { background: var(--surface-2); }
.btn:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent); filter: brightness(1.08); }
.btn-danger { color: #dc2626; }
details.source { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 18px; }
details.source > summary { cursor: pointer; font-weight: 600; }
details.source h2 { font-size: 1.15rem; }

/* Stage pages */
.stage-header { padding-bottom: 6px; margin-bottom: 8px; border-bottom: 1px solid var(--border); }
.goal { font-size: 1.05rem; }
.stage-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin: 14px 0; }
.segmented { display: inline-flex; margin: 0; padding: 3px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); }
.seg { position: relative; }
.seg input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.seg span { display: block; padding: 5px 12px; border-radius: 8px; font-size: .86rem; font-weight: 600; color: var(--muted); }
.seg input:checked + span { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.seg input[value="doing"]:checked + span { color: var(--doing-text); background: var(--doing-soft); }
.seg input[value="done"]:checked + span { color: var(--done-text); background: var(--done-soft); }
.seg input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 1px; }
.meter { display: flex; align-items: center; gap: 10px; min-width: 200px; flex: 1; max-width: 320px; font-size: .85rem; color: var(--muted); }
.meter .bar { flex: 1; }
.part-toc { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 14px; }
.part-toc a { font-size: .8rem; padding: 3px 10px; border: 1px solid var(--border); border-radius: 99px; color: var(--muted); text-decoration: none; background: var(--surface); }
.part-toc a:hover { color: var(--accent); border-color: var(--accent); }
.story { margin: 22px 0; padding: 16px 20px; background: var(--accent-soft); border-left: 4px solid var(--accent); border-radius: 0 var(--radius) var(--radius) 0; }
.story-eyebrow { margin: 0 0 6px; font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--accent-text); }
.story-note { text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--muted); margin-left: 6px; font-size: .78rem; }
.story p { margin: .3em 0; font-size: 1.04rem; color: var(--text); }
.part { margin: 6px 0; }
.part > h3 { display: flex; align-items: center; gap: 8px; }
.part-hint { font-size: .85rem; color: var(--muted); margin-top: -.2em; }
.checklist { list-style: none; padding: 0; margin: .5em 0 1em; display: grid; gap: 4px; }
.checklist > li { display: grid; grid-template-columns: 22px minmax(0, 1fr); column-gap: 10px; margin: 0; padding: 7px 10px; border-radius: 10px; }
.checklist > li:hover { background: var(--surface); }
.checklist > li > input { width: 17px; height: 17px; margin: 4px 0 0; accent-color: var(--accent); cursor: pointer; }
.checklist > li > label { cursor: pointer; }
.checklist > li > :not(input):not(label) { grid-column: 2; }
.checklist > li > input:checked + label { color: var(--muted); }
.callout { margin: 18px 0; padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid; }
.callout p { margin: .3em 0; }
.callout-title { font-weight: 700; font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; }
.callout-note { background: var(--note-bg); border-color: var(--note-border); }
.callout-warn { background: var(--warn-bg); border-color: var(--warn-border); }
details.verify { margin: 16px 0; padding: 10px 14px; border: 1px dashed var(--border); border-radius: var(--radius-sm); background: var(--surface); font-size: .92rem; }
details.verify > summary { cursor: pointer; font-weight: 600; color: var(--muted); }
.part-done { padding: 12px 16px; border-radius: var(--radius-sm); background: var(--done-soft); border: 1px solid color-mix(in srgb, var(--done) 35%, transparent); }
.part-done > h3 { margin-top: 0; color: var(--done-text); font-size: .95rem; text-transform: uppercase; letter-spacing: .05em; }
.capstone { position: relative; margin: 28px 0 18px; padding: 20px 22px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
.capstone::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 4px; background: linear-gradient(90deg, var(--accent), var(--track1)); }
.capstone-eyebrow { margin: 0; font-size: .75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--accent-text); }
.capstone > h3 { margin: .2em 0 .3em; font-size: 1.3rem; }
.capstone-writeup { margin-top: 0; font-size: .85rem; color: var(--muted); }
.capstone-scenario { padding: 10px 14px; background: var(--surface-2); border-radius: var(--radius-sm); font-size: 1.02rem; }
.capstone-stretch { font-size: .92rem; color: var(--muted); }
.part-notes textarea { width: 100%; min-height: 110px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font: inherit; font-size: .95rem; resize: vertical; }
.part-notes textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.saved { font-size: .8rem; color: var(--muted); }
.pager { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 36px; }
.pager a { display: flex; flex-direction: column; gap: 2px; padding: 12px 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); text-decoration: none; font-weight: 600; }
.pager a span { font-size: .75rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
.pager a:hover { border-color: var(--accent); }
.pager-next { text-align: right; }

/* Toast */
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 60; padding: 10px 16px; border-radius: 10px; background: var(--text); color: var(--bg); font-size: .9rem; box-shadow: 0 10px 30px rgb(0 0 0 / 25%); }

@media (max-width: 1000px) {
  .topbar-progress { display: none; }
}
@media (max-width: 900px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .menu-btn { display: inline-flex; }
  #sidebar { position: fixed; top: var(--topbar-h); left: 0; bottom: 0; height: auto; width: min(86vw, 320px); z-index: 35; transform: translateX(-100%); box-shadow: 0 10px 40px rgb(0 0 0 / 25%); }
  body.nav-open #sidebar { transform: none; }
  body.nav-anim #sidebar { transition: transform .2s ease; }
  body.nav-open .backdrop { display: block; position: fixed; inset: var(--topbar-h) 0 0 0; z-index: 30; background: rgb(0 0 0 / 35%); }
  main { padding-top: 24px; }
}
@media (max-width: 640px) {
  .brand span { display: none; }
  .path-card { grid-template-columns: auto minmax(0, 1fr); }
  .path-id { display: none; }
  .path-progress { grid-column: 1 / -1; }
  .pager { grid-template-columns: 1fr; }
  .pager-next { text-align: left; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
@media print {
  .topbar, #sidebar, .stage-controls, .part-toc, .part-notes, .pager, .tools, .backdrop, .copy-btn { display: none !important; }
  .layout { display: block; }
  main { padding: 0; }
  body { background: #fff; }
}
`;

// ---------------------------------------------------------------------------------------------
// Client script. Serialized with Function#toString, so it must not use build-time variables.

function clientMain() {
  const DATA = JSON.parse(document.getElementById('roadmap-data').textContent);
  const STORE_KEY = 'teeny-roadmap:v1';
  const THEME_KEY = 'teeny-roadmap:theme';
  const STATUS_LABEL = { todo: 'Not started', doing: 'In progress', done: 'Done' };
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (value) =>
    window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');

  const storage = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* storage unavailable */
      }
    },
  };

  // ---- state
  const emptyState = () => ({ version: 1, statuses: {}, checks: {}, notes: {} });
  function sanitize(input) {
    const s = emptyState();
    if (!input || typeof input !== 'object') return s;
    for (const [k, v] of Object.entries(input.statuses || {}))
      if (STATUS_LABEL[v]) s.statuses[k] = v;
    for (const [k, v] of Object.entries(input.checks || {})) if (v === true) s.checks[k] = true;
    for (const [k, v] of Object.entries(input.notes || {}))
      if (typeof v === 'string' && v) s.notes[k] = v;
    return s;
  }
  function readState() {
    try {
      return sanitize(JSON.parse(storage.get(STORE_KEY) || 'null'));
    } catch {
      return emptyState();
    }
  }
  let state = readState();
  let warnedStorage = false;
  function persist() {
    const ok = storage.set(
      STORE_KEY,
      JSON.stringify({ ...state, savedAt: new Date().toISOString() }),
    );
    if (!ok && !warnedStorage) {
      warnedStorage = true;
      toast(
        'This browser is not keeping your progress (storage is blocked). Use Export to save it.',
      );
    }
  }

  const stages = DATA.stages;
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const statusOf = (id) => state.statuses[id] || stageById.get(id)?.seed || 'todo';
  const boxesByStage = new Map();
  for (const box of $$('input[data-check]')) {
    const page = box.closest('[data-stage-page]');
    if (!page) continue;
    const id = page.dataset.stagePage;
    if (!boxesByStage.has(id)) boxesByStage.set(id, []);
    boxesByStage.get(id).push(box);
  }
  const counts = (id) => {
    const boxes = boxesByStage.get(id) || [];
    return { done: boxes.filter((b) => b.checked).length, total: boxes.length };
  };

  // ---- rendering state into the page
  function applyState() {
    for (const box of $$('input[data-check]')) box.checked = !!state.checks[box.dataset.check];
    for (const area of $$('textarea[data-notes]'))
      area.value = state.notes[area.dataset.notes] || '';
    for (const s of stages) {
      const radio = $(`input[name="status-${esc(s.id)}"][value="${statusOf(s.id)}"]`);
      if (radio) radio.checked = true;
    }
    refresh();
  }

  const fmtHours = ([lo, hi]) => `${lo}–${hi} h`;

  function refresh() {
    let doneStages = 0;
    let doneItems = 0;
    let totalItems = 0;
    const left = [0, 0];
    const all = [0, 0];
    for (const s of stages) {
      const status = statusOf(s.id);
      const c = counts(s.id);
      doneItems += c.done;
      totalItems += c.total;
      if (status === 'done') doneStages++;
      const h = s.hours ? [...s.hours] : [0, 0];
      if (s.hasCapstone && DATA.capstoneHours) {
        h[0] += DATA.capstoneHours[0];
        h[1] += DATA.capstoneHours[1];
      }
      all[0] += h[0];
      all[1] += h[1];
      if (status !== 'done') {
        left[0] += h[0];
        left[1] += h[1];
      }
      const pct = status === 'done' ? 100 : c.total ? Math.round((c.done / c.total) * 100) : 0;
      for (const el of $$(`[data-stage="${esc(s.id)}"]`)) {
        el.dataset.status = status;
        const label = $('.path-status', el);
        if (label) label.textContent = STATUS_LABEL[status];
        const count = $('.path-count', el);
        if (count) count.textContent = c.total ? `${c.done}/${c.total}` : '';
        const bar = $('.bar > span', el);
        if (bar) bar.style.width = `${pct}%`;
      }
      const meter = $(`[data-meter="${esc(s.id)}"]`);
      if (meter) {
        $('.bar > span', meter).style.width =
          `${c.total ? Math.round((c.done / c.total) * 100) : 0}%`;
        $('.meter-text', meter).textContent = `${c.done} / ${c.total} checked`;
      }
    }
    const next =
      stages.find((s) => statusOf(s.id) === 'doing') ||
      stages.find((s) => statusOf(s.id) !== 'done');
    setStat('stages', `${doneStages} / ${stages.length}`);
    setStat('items', `${doneItems} / ${totalItems}`);
    setStat('hours', fmtHours(left));
    setStat('hours-total', `of ${fmtHours(all)} in total, stage capstones included`);
    const nextEl = $('[data-stat="next"]');
    if (nextEl) {
      nextEl.textContent = next ? `${next.label} · ${next.name}` : 'Everything is done';
      nextEl.setAttribute('href', next ? `#${next.target}` : '#overview');
    }
    const pct = stages.length ? Math.round((doneStages / stages.length) * 100) : 0;
    $('#global-bar').style.width = `${pct}%`;
    $('#global-text').textContent = `${doneStages}/${stages.length} stages`;
    applyFilter();
  }
  function setStat(name, text) {
    const el = $(`[data-stat="${name}"]`);
    if (el) el.textContent = text;
  }

  // ---- filters
  let filter = 'all';
  function applyFilter() {
    for (const el of $$('.path-item[data-stage], .nav-stages li[data-stage]')) {
      const id = el.dataset.stage;
      const show =
        filter === 'all' ||
        (filter === 'core' && el.dataset.track === 'core') ||
        (filter === 'deepening' && el.dataset.track === 'deepening') ||
        (filter.startsWith('track-') && el.dataset.trackletter === filter.slice(6)) ||
        (filter === 'open' && statusOf(id) !== 'done');
      el.hidden = !show;
    }
    for (const el of $$('.path-divider, .nav-divider'))
      el.hidden = filter !== 'all' && filter !== `track-${el.dataset.trackletter}`;
  }
  for (const chip of $$('.chip[data-filter]')) {
    chip.addEventListener('click', () => {
      filter = chip.dataset.filter;
      for (const c of $$('.chip[data-filter]')) c.setAttribute('aria-pressed', String(c === chip));
      applyFilter();
    });
  }

  // ---- interactions
  document.addEventListener('change', (event) => {
    const t = event.target;
    if (t.matches('input[data-check]')) {
      if (t.checked) state.checks[t.dataset.check] = true;
      else delete state.checks[t.dataset.check];
      const page = t.closest('[data-stage-page]');
      const id = page?.dataset.stagePage;
      if (t.checked && id && statusOf(id) === 'todo') {
        state.statuses[id] = 'doing';
        const radio = $(`input[name="status-${esc(id)}"][value="doing"]`);
        if (radio) radio.checked = true;
      }
      persist();
      refresh();
    } else if (t.matches('.segmented input[type="radio"]')) {
      state.statuses[t.closest('[data-status-for]').dataset.statusFor] = t.value;
      persist();
      refresh();
    }
  });

  const noteTimers = new Map();
  document.addEventListener('input', (event) => {
    const t = event.target;
    if (!t.matches('textarea[data-notes]')) return;
    clearTimeout(noteTimers.get(t));
    noteTimers.set(
      t,
      setTimeout(() => {
        if (t.value.trim()) state.notes[t.dataset.notes] = t.value;
        else delete state.notes[t.dataset.notes];
        persist();
        const saved = t.parentElement.querySelector('.saved');
        if (saved) saved.textContent = 'Saved in this browser';
      }, 400),
    );
  });

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      area.remove();
      return ok;
    }
  }

  document.addEventListener('click', async (event) => {
    const copyBtn = event.target.closest('.copy-btn');
    if (copyBtn) {
      const ok = await copyText(copyBtn.parentElement.querySelector('code').textContent);
      copyBtn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
      }, 1500);
      return;
    }
    const action = event.target.closest('button[data-action]');
    if (!action) return;
    const kind = action.dataset.action;
    if (kind === 'copy-summary') {
      const ok = await copyText(summary());
      toast(
        ok
          ? 'Summary copied. Paste it to Claude to update the roadmap.'
          : 'Could not copy; your browser blocked the clipboard.',
      );
    } else if (kind === 'export') {
      const blob = new Blob(
        [
          JSON.stringify(
            { format: 'teeny-roadmap-progress', exportedAt: new Date().toISOString(), state },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `teeny-roadmap-progress-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (kind === 'reset') {
      if (
        !window.confirm(
          'Reset all statuses, ticks and notes stored in this browser? This cannot be undone.',
        )
      )
        return;
      state = emptyState();
      storage.remove(STORE_KEY);
      applyState();
      toast('Progress reset to the statuses in ROADMAP.md.');
    }
  });

  const importInput = $('input[data-action="import"]');
  if (importInput) {
    importInput.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      importInput.value = '';
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const next = sanitize(parsed.state || parsed);
        if (!window.confirm('Replace the progress in this browser with the imported file?')) return;
        state = next;
        persist();
        applyState();
        toast('Progress imported.');
      } catch {
        toast('That file is not a roadmap progress export.');
      }
    });
  }

  function summary() {
    const lines = [
      `Teeny-URL roadmap progress (from roadmap.html, ${new Date().toISOString().slice(0, 10)}):`,
    ];
    for (const s of stages) {
      const c = counts(s.id);
      const note = state.notes[s.id] ? ' · has notes' : '';
      lines.push(
        `- ${s.label} (${s.name}): ${STATUS_LABEL[statusOf(s.id)]}${c.total ? ` — ${c.done}/${c.total} checked` : ''}${note}`,
      );
    }
    lines.push('', `Estimated time left: ${$('[data-stat="hours"]').textContent}`);
    return lines.join('\n');
  }

  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 3200);
  }

  // ---- theme
  function effectiveTheme() {
    return (
      document.documentElement.dataset.theme ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    );
  }
  function syncThemeButton() {
    const btn = $('#theme-toggle');
    const dark = effectiveTheme() === 'dark';
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    btn.setAttribute('aria-pressed', String(dark));
  }
  $('#theme-toggle').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    storage.set(THEME_KEY, next);
    syncThemeButton();
  });
  syncThemeButton();

  // ---- navigation drawer (small screens)
  const menuBtn = $('.menu-btn');
  let animTimer;
  function setDrawer(open) {
    if (open === document.body.classList.contains('nav-open')) return;
    // Animate only real open/close, not the jump when the window crosses the breakpoint.
    document.body.classList.add('nav-anim');
    clearTimeout(animTimer);
    animTimer = setTimeout(() => document.body.classList.remove('nav-anim'), 260);
    document.body.classList.toggle('nav-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  menuBtn.addEventListener('click', () => setDrawer(!document.body.classList.contains('nav-open')));
  $('.backdrop').addEventListener('click', () => setDrawer(false));

  // ---- routing: every heading has a GitHub-style id; show the page that contains it
  let pendingTerms = null;
  function route() {
    const hash = decodeURIComponent(location.hash.slice(1));
    let target = hash ? document.getElementById(hash) : null;
    if (!target?.closest('.page')) target = document.getElementById('overview');
    const page = target.closest('.page');
    for (const p of $$('.page')) p.hidden = p !== page;
    const details = target.closest('details');
    if (details) details.open = true;
    for (const a of $$('#sidebar a[data-page]')) {
      if (a.dataset.page === page.id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    setDrawer(false);
    clearHits();
    const heading = page.querySelector('h1, h2');
    const isTop = target === page || target === heading;
    if (isTop) {
      window.scrollTo(0, 0);
      if (heading && hash) heading.focus({ preventScroll: true });
    } else {
      target.scrollIntoView({ block: 'start' });
    }
    if (pendingTerms) {
      const first = highlight(page, pendingTerms);
      if (first && isTop) first.scrollIntoView({ block: 'center' });
      pendingTerms = null;
    }
    const label = heading ? heading.textContent.trim() : '';
    document.title =
      label && page.id !== 'overview'
        ? `${label} · Cloud-native roadmap`
        : 'Cloud-native roadmap · Teeny-URL';
  }
  window.addEventListener('hashchange', route);

  // ---- search
  const index = DATA.search.map((e) => ({ ...e, hay: `${e.title} ${e.text}`.toLowerCase() }));
  const input = $('#search');
  const results = $('#search-results');
  const termsOf = (q) =>
    q
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
  const countOf = (hay, term) => hay.split(term).length - 1;
  function search(q) {
    const terms = termsOf(q);
    if (!terms.length) return [];
    return index
      .filter((e) => terms.every((t) => e.hay.includes(t)))
      .map((e) => ({
        e,
        score: terms.reduce(
          (n, t) =>
            n + (e.title.toLowerCase().includes(t) ? 6 : 0) + Math.min(countOf(e.hay, t), 4),
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }
  function markText(parent, text, terms) {
    const re = new RegExp(
      `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
      'gi',
    );
    for (const piece of text.split(re)) {
      if (!piece) continue;
      if (terms.includes(piece.toLowerCase())) {
        const m = document.createElement('mark');
        m.className = 'hit';
        m.textContent = piece;
        parent.append(m);
      } else parent.append(document.createTextNode(piece));
    }
  }
  function snippet(text, terms) {
    const lower = text.toLowerCase();
    const at = Math.max(0, Math.min(...terms.map((t) => lower.indexOf(t)).filter((n) => n >= 0)));
    let start = Math.max(0, at - 60);
    if (start > 0) start = text.indexOf(' ', start) + 1 || start; // begin on a word boundary
    let end = Math.min(text.length, start + 170);
    if (end < text.length)
      end = text.lastIndexOf(' ', end) > start ? text.lastIndexOf(' ', end) : end;
    return (start > 0 ? '… ' : '') + text.slice(start, end) + (end < text.length ? ' …' : '');
  }
  function renderResults() {
    const q = input.value.trim();
    results.replaceChildren();
    if (!q) {
      results.hidden = true;
      return;
    }
    const found = search(q);
    const terms = termsOf(q);
    if (!found.length) {
      const empty = document.createElement('p');
      empty.className = 'result-empty';
      empty.textContent = 'No matches.';
      results.append(empty);
    }
    for (const { e } of found) {
      const a = document.createElement('a');
      a.className = 'result';
      a.href = `#${e.t}`;
      const titleEl = document.createElement('span');
      titleEl.className = 'result-title';
      markText(titleEl, e.title, terms);
      const snip = document.createElement('span');
      snip.className = 'result-snippet';
      markText(snip, snippet(e.text || e.title, terms), terms);
      a.append(titleEl, snip);
      a.addEventListener('click', () => {
        pendingTerms = terms;
        results.hidden = true;
        if (location.hash === `#${e.t}`) route();
      });
      results.append(a);
    }
    results.hidden = false;
  }
  input.addEventListener('input', renderResults);
  input.addEventListener('focus', () => {
    if (input.value.trim()) renderResults();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const first = $('.result', results);
      if (first) first.click();
    } else if (event.key === 'ArrowDown') {
      const first = $('.result', results);
      if (first) {
        event.preventDefault();
        first.focus();
      }
    } else if (event.key === 'Escape') {
      input.value = '';
      renderResults();
      input.blur();
    }
  });
  results.addEventListener('keydown', (event) => {
    const items = $$('.result', results);
    const i = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' && i < items.length - 1) {
      event.preventDefault();
      items[i + 1].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      (i > 0 ? items[i - 1] : input).focus();
    } else if (event.key === 'Escape') {
      results.hidden = true;
      input.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search')) results.hidden = true;
  });

  function clearHits() {
    for (const m of $$('mark.hit', $('main')))
      m.replaceWith(document.createTextNode(m.textContent));
    $('main').normalize();
  }
  function highlight(root, terms) {
    const re = new RegExp(
      terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
      'gi',
    );
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement.closest('textarea, script, style, button')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let first = null;
    let made = 0;
    for (const node of nodes) {
      if (made > 300) break;
      const text = node.nodeValue;
      re.lastIndex = 0;
      if (!re.test(text)) continue;
      const frag = document.createDocumentFragment();
      let last = 0;
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        frag.append(document.createTextNode(text.slice(last, m.index)));
        const mark = document.createElement('mark');
        mark.className = 'hit';
        mark.textContent = m[0];
        frag.append(mark);
        first = first || mark;
        made++;
        last = m.index + m[0].length;
      }
      frag.append(document.createTextNode(text.slice(last)));
      node.replaceWith(frag);
    }
    return first;
  }

  // ---- keyboard shortcuts
  document.addEventListener('keydown', (event) => {
    const typing = event.target.closest('input, textarea, select, [contenteditable="true"]');
    if (event.key === '/' && !typing) {
      event.preventDefault();
      input.focus();
      input.select();
    } else if (event.key === 'Escape' && document.body.classList.contains('nav-open')) {
      setDrawer(false);
    }
  });

  applyState();
  route();
}

// ---------------------------------------------------------------------------------------------
// Page

const ICON_MENU =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
const ICON_THEME =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const ICON_SEARCH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%234f46e5'/%3E%3Cpath d='M9 21l5-10 4 7 2-3 3 6' stroke='white' stroke-width='2.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const json = JSON.stringify(data)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cloud-native roadmap · Teeny-URL</title>
<meta name="description" content="Interactive cloud-native learning roadmap for Teeny-URL with LocalStack. Generated from learning/ROADMAP.md.">
<meta name="generator" content="learning/build-roadmap-html.mjs (source sha256 ${sourceHash})">
<link rel="icon" href="${FAVICON}">
<script>try{var t=localStorage.getItem('teeny-roadmap:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
<style>${CSS}</style>
</head>
<body>
<a class="sr-only" href="#main">Skip to content</a>
<header class="topbar">
  <button type="button" class="icon-btn menu-btn" aria-controls="sidebar" aria-expanded="false" aria-label="Open navigation">${ICON_MENU}</button>
  <a class="brand" href="#overview">Cloud-native roadmap <span>· Teeny-URL</span></a>
  <div class="search">${ICON_SEARCH}<input type="search" id="search" placeholder="Search the roadmap  ( / )" aria-label="Search the roadmap" autocomplete="off"><div id="search-results" class="search-results" hidden></div></div>
  <div class="topbar-progress" title="Stages marked done"><span class="bar"><span id="global-bar"></span></span><span id="global-text"></span></div>
  <button type="button" class="icon-btn" id="theme-toggle" aria-label="Switch theme">${ICON_THEME}</button>
</header>
<div class="layout">
${sidebar}
<main id="main" tabindex="-1">
${overview}
${pages}
</main>
</div>
<div class="backdrop"></div>
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
<script type="application/json" id="roadmap-data">${json}</script>
<script>'use strict';(${clientMain.toString()})();</script>
</body>
</html>
`;

// ---------------------------------------------------------------------------------------------
// Validation and output

const warnings = [];
for (const sec of stageSections) {
  const kinds = new Set(sec.parts.map((p) => p.kind));
  if (!kinds.has('goal')) warnings.push(`${stageLabel(sec)} has no **Goal:**`);
  if (sec.stageId !== 'C' && !kinds.has('why'))
    warnings.push(`${stageLabel(sec)} has no "Why it matters" story`);
  if (sec.stageId !== 'C' && !kinds.has('capstone'))
    warnings.push(`${stageLabel(sec)} has no stage capstone`);
  if (!progressRows.has(sec.stageId))
    warnings.push(`${stageLabel(sec)} is missing from the Progress table`);
  if (!hours.has(sec.stageId)) warnings.push(`${stageLabel(sec)} has no hour estimate`);
}
for (const id of progressRows.keys()) {
  if (!stageSections.some((s) => s.stageId === id))
    warnings.push(`Progress table row "${id}" has no stage section`);
}
for (const w of warnings) console.warn(`warning: ${w}`);

if (CHECK_ONLY) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== html) {
    console.error(
      'learning/roadmap.html is out of date. Run: node learning/build-roadmap-html.mjs',
    );
    process.exit(1);
  }
  console.log('learning/roadmap.html is up to date.');
} else {
  writeFileSync(OUT, html);
  console.log(
    `Wrote learning/roadmap.html: ${stageSections.length} stages, ${checklistItems} checklist items, ` +
      `${searchIndex.length} search entries, ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB` +
      (warnings.length ? `, ${warnings.length} warning(s)` : ''),
  );
}
