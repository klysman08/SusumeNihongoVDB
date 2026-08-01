import remarkParse from "remark-parse"
import { unified } from "unified"

export type SpeechSegment = {
  id: string
  input: string
}

export type SpeechRange = SpeechSegment & {
  end: number
  start: number
}

export type MarkdownNode = {
  alt?: string
  children?: MarkdownNode[]
  depth?: number
  ordered?: boolean
  speechRanges?: SpeechRange[]
  type: string
  url?: string
  value?: string
}

export type ParsedAnswerMarkdown = {
  segments: SpeechSegment[]
  tree: MarkdownNode
}

const CITATION_MARKER = /\[(\d+)\]/g
const MIN_SEGMENT_CHARACTERS = 12
const MAX_SEGMENT_CHARACTERS = 500
const markdownParser = unified().use(remarkParse)

function normalizedText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[*_]{1,3}/g, "")
    .replace(/\s+([,.;:!?。！？、，；：])/g, "$1")
    .trim()
}

function segmentId(index: number, input: string) {
  let hash = 2166136261
  const value = `${index}:${input}`
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    hash ^= value.charCodeAt(cursor)
    hash = Math.imul(hash, 16777619)
  }
  return `speech-${index}-${(hash >>> 0).toString(36)}`
}

function citationNodes(value: string): MarkdownNode[] | null {
  const nodes: MarkdownNode[] = []
  let cursor = 0

  for (const match of value.matchAll(CITATION_MARKER)) {
    const index = match.index
    if (index > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, index) })
    }
    nodes.push({ type: "citation", value: match[0] })
    cursor = index + match[0].length
  }

  if (cursor === 0) return null
  if (cursor < value.length) {
    nodes.push({ type: "text", value: value.slice(cursor) })
  }
  return nodes
}

function prepareInlineNodes(node: MarkdownNode) {
  if (!node.children || node.type === "link" || node.type === "code") return
  node.children = node.children.flatMap((child) => {
    if (child.type === "text" && child.value) {
      return citationNodes(child.value) ?? child
    }
    prepareInlineNodes(child)
    return child
  })
}

function speechInlineText(node: MarkdownNode): string {
  if (
    node.type === "citation" ||
    node.type === "html" ||
    node.type === "image" ||
    node.type === "link" ||
    node.type === "code"
  ) {
    return ""
  }
  if (node.type === "break") return " "
  if (node.value) return node.value
  return node.children?.map(speechInlineText).join("") ?? ""
}

function plainInlineText(node: MarkdownNode): string {
  if (
    node.type === "citation" ||
    node.type === "html" ||
    node.type === "code"
  ) {
    return ""
  }
  if (node.type === "image") return node.alt ?? ""
  if (node.type === "break") return " "
  if (node.value) return node.value
  return node.children?.map(plainInlineText).join("") ?? ""
}

function isSentenceBoundary(value: string, index: number) {
  const punctuation = value[index]
  if (!".!?。！？".includes(punctuation)) return false
  if ("。！？".includes(punctuation)) return true

  let cursor = index + 1
  while (cursor < value.length && /[.!?”"')\]}]/.test(value[cursor])) {
    cursor += 1
  }
  return cursor === value.length || /\s/.test(value[cursor])
}

function initialRanges(value: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  let start = 0

  for (let index = 0; index < value.length; index += 1) {
    if (!isSentenceBoundary(value, index)) continue
    let end = index + 1
    while (end < value.length && /[.!?。！？”"')\]}]/.test(value[end])) end += 1
    while (end < value.length && /\s/.test(value[end])) end += 1
    ranges.push({ start, end })
    start = end
    index = end - 1
  }
  if (start < value.length) ranges.push({ start, end: value.length })
  return ranges.filter(({ start: from, end }) =>
    normalizedText(value.slice(from, end))
  )
}

function mergeShortRanges(
  ranges: Array<{ start: number; end: number }>,
  value: string
) {
  const merged: Array<{ start: number; end: number }> = []
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index]
    if (
      normalizedText(value.slice(range.start, range.end)).length <
      MIN_SEGMENT_CHARACTERS
    ) {
      if (index + 1 < ranges.length) {
        ranges[index + 1] = { start: range.start, end: ranges[index + 1].end }
        continue
      }
      if (merged.length) {
        merged[merged.length - 1].end = range.end
        continue
      }
    }
    merged.push(range)
  }
  return merged
}

function safeLongRangeSplit(value: string, start: number, end: number) {
  const ranges: Array<{ start: number; end: number }> = []
  let cursor = start
  while (
    normalizedText(value.slice(cursor, end)).length > MAX_SEGMENT_CHARACTERS
  ) {
    const maximum = Math.min(cursor + MAX_SEGMENT_CHARACTERS, end)
    let split = maximum
    for (let candidate = maximum; candidate > cursor + 300; candidate -= 1) {
      if (/[\s,;:、，；：]/.test(value[candidate - 1])) {
        split = candidate
        break
      }
    }
    ranges.push({ start: cursor, end: split })
    cursor = split
  }
  if (cursor < end) ranges.push({ start: cursor, end })
  return ranges
}

function blockRanges(value: string, heading: boolean) {
  if (!normalizedText(value)) return []
  const ranges = heading
    ? [{ start: 0, end: value.length }]
    : mergeShortRanges(initialRanges(value), value)
  return ranges.flatMap((range) =>
    safeLongRangeSplit(value, range.start, range.end)
  )
}

function prepareTree(node: MarkdownNode, segments: SpeechSegment[]) {
  if (node.type === "heading" || node.type === "paragraph") {
    prepareInlineNodes(node)
    const speechText = speechInlineText(node)
    node.speechRanges = blockRanges(speechText, node.type === "heading").map(
      ({ start, end }) => {
        let input = normalizedText(speechText.slice(start, end))
        if (node.type === "heading" && !/[.!?。！？]$/.test(input)) {
          input = `${input}.`
        }
        const segment = { id: segmentId(segments.length, input), input }
        segments.push(segment)
        return { ...segment, start, end }
      }
    )
    return
  }
  node.children?.forEach((child) => prepareTree(child, segments))
}

/** Parses once into the tree used by both visible rendering and speech playback. */
export function parseAnswerMarkdown(markdown: string): ParsedAnswerMarkdown {
  const tree = markdownParser.parse(markdown) as MarkdownNode
  const segments: SpeechSegment[] = []
  prepareTree(tree, segments)
  return { tree, segments }
}

/** Sentence clips in stable document order. */
export function markdownSpeechSegments(markdown: string) {
  return parseAnswerMarkdown(markdown).segments
}

function plainBlocks(node: MarkdownNode): string[] {
  if (node.type === "html" || node.type === "code") return []
  if (node.type === "heading" || node.type === "paragraph") {
    const text = normalizedText(plainInlineText(node))
    return text ? [text] : []
  }
  return node.children?.flatMap(plainBlocks) ?? []
}

/** A compact text projection suitable for browser-history previews. */
export function markdownToPlainText(markdown: string) {
  const { tree } = parseAnswerMarkdown(markdown)
  return plainBlocks(tree).join(" ").replace(/\s+/g, " ").trim()
}

/** A spoken projection retained for callers that need a plain text preview. */
export function markdownToSpeechText(markdown: string) {
  return markdownSpeechSegments(markdown)
    .map((segment) => segment.input)
    .join("\n\n")
}

function speechLength(node: MarkdownNode): number {
  return speechInlineText(node).length
}

function zeroLengthNodeBelongsToRange(
  cursor: number,
  start: number,
  end: number
) {
  return (cursor > start && cursor <= end) || (cursor === 0 && start === 0)
}

function sliceNode(
  node: MarkdownNode,
  start: number,
  end: number,
  cursor: { value: number }
): MarkdownNode | null {
  const length = speechLength(node)
  if (length === 0) {
    return zeroLengthNodeBelongsToRange(cursor.value, start, end) ? node : null
  }

  if (
    node.type === "text" ||
    node.type === "inlineCode" ||
    node.type === "break"
  ) {
    const nodeStart = cursor.value
    const nodeEnd = nodeStart + length
    cursor.value = nodeEnd
    const overlapStart = Math.max(start, nodeStart)
    const overlapEnd = Math.min(end, nodeEnd)
    if (overlapStart >= overlapEnd) return null
    if (node.type === "break") return node
    return {
      ...node,
      value: (node.value ?? "").slice(
        overlapStart - nodeStart,
        overlapEnd - nodeStart
      ),
    }
  }

  const children = node.children
    ?.map((child) => sliceNode(child, start, end, cursor))
    .filter((child): child is MarkdownNode => child !== null)
  return children?.length ? { ...node, children } : null
}

/** Preserves inline Markdown structure while selecting one speech range. */
export function sliceInlineNodes(
  nodes: MarkdownNode[],
  start: number,
  end: number
) {
  const cursor = { value: 0 }
  return nodes
    .map((node) => sliceNode(node, start, end, cursor))
    .filter((node): node is MarkdownNode => node !== null)
}
