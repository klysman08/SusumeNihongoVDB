import { useEffect, useRef } from "react"

import type { Citation } from "@/lib/api-types"
import {
  type MarkdownNode,
  type ParsedAnswerMarkdown,
  sliceInlineNodes,
} from "@/lib/answer-markdown"

type MarkdownAnswerProps = {
  activeSegmentId: string | null
  citations: Citation[]
  onSelectCitation: (index: number) => void
  parsed: ParsedAnswerMarkdown
  segmentProgress: number
}

function inlineLabel(nodes: MarkdownNode[]): string {
  return nodes
    .map((node) => node.value ?? inlineLabel(node.children ?? []))
    .join("")
}

export function MarkdownAnswer({
  activeSegmentId,
  citations,
  onSelectCitation,
  parsed,
  segmentProgress,
}: MarkdownAnswerProps) {
  const answerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!activeSegmentId || !answerRef.current) return
    const segment = answerRef.current.querySelector<HTMLElement>(
      `[data-speech-segment="${activeSegmentId}"]`
    )
    if (!segment) return

    const answerBounds = answerRef.current.getBoundingClientRect()
    const segmentBounds = segment.getBoundingClientRect()
    const visibleTop = Math.max(answerBounds.top, 0)
    const visibleBottom = Math.min(answerBounds.bottom, window.innerHeight)
    if (
      segmentBounds.top >= visibleTop &&
      segmentBounds.bottom <= visibleBottom
    ) {
      return
    }

    segment.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
    })
  }, [activeSegmentId])

  function renderInline(nodes: MarkdownNode[], path: string): React.ReactNode {
    return nodes.map((node, index) => {
      const key = `${path}-${index}`
      const children = node.children
        ? renderInline(node.children, key)
        : node.value

      switch (node.type) {
        case "text":
          return <span key={key}>{node.value}</span>
        case "strong": {
          const callout = /^(Note|Caution):$/.exec(
            inlineLabel(node.children ?? [])
          )
          return (
            <strong
              className={
                callout?.[1] === "Caution"
                  ? "font-semibold text-destructive"
                  : callout
                    ? "font-semibold text-primary"
                    : "font-semibold text-foreground"
              }
              key={key}
            >
              {children}
            </strong>
          )
        }
        case "emphasis":
          return (
            <em className="font-medium text-chart-3" key={key}>
              {children}
            </em>
          )
        case "delete":
          return <del key={key}>{children}</del>
        case "inlineCode":
          return (
            <code
              className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[0.92em] font-medium text-primary"
              key={key}
            >
              {node.value}
            </code>
          )
        case "break":
          return <br key={key} />
        case "image":
          return <span key={key}>{node.alt ?? ""}</span>
        case "html":
          return <span key={key}>{node.value}</span>
        case "link":
          return <span key={key}>{children}</span>
        case "citation": {
          const marker = Number(node.value?.slice(1, -1))
          const citationIndex = Number.isInteger(marker)
            ? citations.findIndex((citation) => citation.number === marker)
            : -1
          if (citationIndex < 0) return <span key={key}>{node.value}</span>
          return (
            <a
              aria-label={`Show source ${marker}`}
              className="mx-0.5 inline-flex align-super text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              href={`#source-${marker}`}
              key={key}
              onClick={(event) => {
                event.preventDefault()
                onSelectCitation(citationIndex)
              }}
            >
              {node.value}
            </a>
          )
        }
        default:
          return <span key={key}>{children}</span>
      }
    })
  }

  function renderSpeechContent(node: MarkdownNode, path: string) {
    const children = node.children ?? []
    if (!node.speechRanges?.length) return renderInline(children, path)

    return node.speechRanges.map((range, index) => {
      const active = range.id === activeSegmentId
      return (
        <span
          aria-current={active ? "true" : undefined}
          className={
            active
              ? "relative -mx-0.5 rounded-sm bg-chart-4/25 box-decoration-clone px-0.5 transition-colors motion-reduce:transition-none"
              : "relative rounded-sm transition-colors motion-reduce:transition-none"
          }
          data-speech-segment={range.id}
          key={range.id}
        >
          {renderInline(
            sliceInlineNodes(children, range.start, range.end),
            `${path}-${index}`
          )}
          {active && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary/55 motion-reduce:hidden"
              data-speech-progress="true"
              style={{ transform: `scaleX(${segmentProgress})` }}
            />
          )}
        </span>
      )
    })
  }

  function renderBlock(
    node: MarkdownNode,
    path: string,
    inListItem = false
  ): React.ReactNode {
    const children = node.children ?? []
    switch (node.type) {
      case "root":
        return children.map((child, index) =>
          renderBlock(child, `${path}-${index}`)
        )
      case "heading": {
        const content = renderSpeechContent(node, path)
        if (node.depth === 1)
          return (
            <h1
              className="font-heading text-xl font-semibold tracking-tight"
              key={path}
            >
              {content}
            </h1>
          )
        if (node.depth === 2)
          return (
            <h2
              className="font-heading text-lg font-semibold tracking-tight"
              key={path}
            >
              {content}
            </h2>
          )
        if (node.depth === 3)
          return (
            <h3
              className="font-heading text-base font-semibold tracking-tight text-foreground"
              key={path}
            >
              {content}
            </h3>
          )
        return (
          <h4 className="font-semibold" key={path}>
            {content}
          </h4>
        )
      }
      case "paragraph": {
        const content = renderSpeechContent(node, path)
        return inListItem ? (
          <span className="text-base leading-7" key={path}>
            {content}
          </span>
        ) : (
          <p className="text-base leading-8" key={path}>
            {content}
          </p>
        )
      }
      case "list": {
        const content = children.map((child, index) =>
          renderBlock(child, `${path}-${index}`)
        )
        return node.ordered ? (
          <ol
            className="flex list-decimal flex-col gap-1 pl-6 marker:font-medium marker:text-primary"
            key={path}
          >
            {content}
          </ol>
        ) : (
          <ul
            className="flex list-disc flex-col gap-1 pl-6 marker:text-primary"
            key={path}
          >
            {content}
          </ul>
        )
      }
      case "listItem":
        return (
          <li className="pl-1 leading-7" key={path}>
            {children.map((child, index) =>
              renderBlock(child, `${path}-${index}`, true)
            )}
          </li>
        )
      case "blockquote":
        return (
          <blockquote
            className="border-l-3 border-accent-foreground/55 bg-accent/45 px-4 py-2 text-accent-foreground [&>p]:leading-7"
            key={path}
          >
            {children.map((child, index) =>
              renderBlock(child, `${path}-${index}`)
            )}
          </blockquote>
        )
      case "code":
        return (
          <pre className="overflow-x-auto rounded-md bg-muted p-3" key={path}>
            <code>{node.value}</code>
          </pre>
        )
      case "thematicBreak":
        return <hr key={path} />
      case "html":
        return <p key={path}>{node.value}</p>
      default:
        return children.map((child, index) =>
          renderBlock(child, `${path}-${index}`, inListItem)
        )
    }
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-3 wrap-break-word"
      ref={answerRef}
    >
      {renderBlock(parsed.tree, "answer")}
    </div>
  )
}
