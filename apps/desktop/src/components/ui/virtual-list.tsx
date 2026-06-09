import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type RefObject,
} from "react"
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
  type Virtualizer,
} from "@tanstack/react-virtual"

import { ScrollArea, type ScrollAreaHandle } from "./scroll-area"

/**
 * Headless-ish list virtualization over the app's {@link ScrollArea}
 * (OverlayScrollbars). The contract is deliberately dumb: a flat array of
 * descriptors, a stable key, a size estimate, and a per-item renderer. All the
 * domain (indentation, badges, collapse) lives in the caller's `renderItem`;
 * this primitive only owns scroll, measurement and windowing.
 *
 * See `specs/virtualized-list.md`. Any list that flattens its model to a flat
 * descriptor array adopts virtualization by writing `flatten() + renderItem`,
 * never by re-wiring scroll/measure.
 */

type UseScrollAreaVirtualizerOptions<T> = {
  readonly items: ReadonlyArray<T>
  readonly getKey: (item: T, index: number) => string
  readonly estimateSize: (item: T, index: number) => number
  readonly overscan?: number
  /** Override the windowed index set (e.g. to pin a sticky header). */
  readonly rangeExtractor?: (range: Range) => number[]
}

/**
 * Escape hatch for callers that want to own the markup (sticky headers,
 * multi-column). Resolves the OverlayScrollbars viewport — which only exists
 * after mount — into state so the virtualizer recomputes once it is available.
 */
const useScrollAreaVirtualizer = <T,>(
  scrollRef: RefObject<ScrollAreaHandle | null>,
  {
    items,
    getKey,
    estimateSize,
    overscan = 8,
    rangeExtractor,
  }: UseScrollAreaVirtualizerOptions<T>,
): Virtualizer<HTMLElement, Element> => {
  // `ScrollAreaHandle.viewport` is null on first render (set in a mount
  // effect). Materialize it in state so resolving it triggers a re-render and
  // `getScrollElement` starts returning a real element.
  const [viewport, setViewport] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setViewport(scrollRef.current?.viewport ?? null)
  }, [scrollRef])

  return useVirtualizer<HTMLElement, Element>({
    count: items.length,
    getScrollElement: () => viewport,
    estimateSize: (i) => estimateSize(items[i], i),
    getItemKey: (i) => getKey(items[i], i),
    overscan,
    ...(rangeExtractor ? { rangeExtractor } : {}),
  })
}

type VirtualListProps<T> = {
  readonly items: ReadonlyArray<T>
  readonly getKey: (item: T, index: number) => string
  /** Estimated row height in px; the real height is measured after mount. */
  readonly estimateSize: (item: T, index: number) => number
  readonly renderItem: (item: T, index: number) => ReactNode
  readonly overscan?: number
  /** Applied to the {@link ScrollArea} host. */
  readonly className?: string
  /** Element used for the sizer; rows become `<li>` for `ol`/`ul`, else `<div>`. */
  readonly as?: "ol" | "ul" | "div"
  /** Non-virtualized content rendered in-flow after the list (e.g. a footer). */
  readonly footer?: ReactNode
  readonly ariaLabel?: string
  /**
   * Marks rows that pin to the top while their section scrolls (e.g. group
   * headers). The headers covering the current scroll position stay mounted
   * even when scrolled out of the window and render `position: sticky`.
   */
  readonly isSticky?: (item: T, index: number) => boolean
  /**
   * Nesting depth of every row (not only sticky ones), enabling a *stack* of
   * pinned ancestor headers (loop › iteration › …). A header at depth d covers
   * the following rows of depth > d until a row of depth ≤ d. Omit for flat,
   * single-level sticky (all headers treated as depth 0).
   */
  readonly rowDepth?: (item: T, index: number) => number
}

const VirtualList = <T,>({
  items,
  getKey,
  estimateSize,
  renderItem,
  overscan = 8,
  className,
  as = "div",
  footer,
  ariaLabel,
  isSticky,
  rowDepth,
}: VirtualListProps<T>) => {
  const scrollRef = useRef<ScrollAreaHandle>(null)

  // For each row, the chain of sticky-header indices that *cover* it (shallow →
  // deep), plus the set of all sticky indices. Computed in one depth-stack pass.
  // Without `rowDepth`, every header is depth 0 and content depth 1, so the
  // stack collapses to a single pinned header (flat behaviour).
  const sticky = useMemo(() => {
    if (!isSticky) return null
    const depthOf =
      rowDepth ?? ((item: T, i: number) => (isSticky(item, i) ? 0 : 1))
    const ancestors: number[][] = new Array(items.length)
    const set = new Set<number>()
    const stack: Array<{ index: number; depth: number }> = []
    for (let i = 0; i < items.length; i++) {
      const d = depthOf(items[i], i)
      while (stack.length > 0 && stack[stack.length - 1].depth >= d) stack.pop()
      ancestors[i] = stack.map((s) => s.index)
      if (isSticky(items[i], i)) {
        set.add(i)
        stack.push({ index: i, depth: d })
      }
    }
    return { ancestors, set }
  }, [items, isSticky, rowDepth])

  // The pinned stack for the current window start — its covering headers, plus
  // the header itself when the start row *is* one. Written during
  // `rangeExtractor` (force-keeps them mounted), read below while rendering.
  const pinnedRef = useRef<number[]>([])
  const rangeExtractor = useCallback(
    (range: Range): number[] => {
      if (!sticky) {
        pinnedRef.current = []
        return defaultRangeExtractor(range)
      }
      const start = range.startIndex
      const covering = sticky.ancestors[start] ?? []
      const pinned = sticky.set.has(start) ? [...covering, start] : covering
      pinnedRef.current = pinned
      if (pinned.length === 0) return defaultRangeExtractor(range)
      const next = new Set(defaultRangeExtractor(range))
      for (const idx of pinned) next.add(idx)
      return [...next].sort((a, b) => a - b)
    },
    [sticky],
  )

  const virtualizer = useScrollAreaVirtualizer(scrollRef, {
    items,
    getKey,
    estimateSize,
    overscan,
    rangeExtractor: isSticky ? rangeExtractor : undefined,
  })

  const Sizer: ElementType = as
  // Rows are absolutely positioned out of the normal flow, so `<ol>`/`<ul>`
  // sizers still get valid `<li>` children; a `<div>` sizer gets ARIA roles.
  const RowTag: ElementType = as === "div" ? "div" : "li"
  const isList = as === "div"
  const rows = virtualizer.getVirtualItems()

  // Stack the pinned headers from the top: each sits below the shallower ones,
  // offset by their measured (or estimated) heights.
  const pinned = pinnedRef.current
  let pinnedTops: Map<number, number> | null = null
  if (pinned.length > 0) {
    const sizeByIndex = new Map(rows.map((r) => [r.index, r.size]))
    pinnedTops = new Map()
    let acc = 0
    for (const idx of pinned) {
      pinnedTops.set(idx, acc)
      acc += sizeByIndex.get(idx) ?? estimateSize(items[idx], idx)
    }
  }

  return (
    <ScrollArea ref={scrollRef} className={className}>
      <Sizer
        role={isList ? "list" : undefined}
        aria-label={ariaLabel}
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {rows.map((vr) => {
          const pinnedTop = pinnedTops?.get(vr.index)
          const isPinned = pinnedTop !== undefined
          // Pinned headers stack at the top (in flow, since every other row is
          // absolute); shallower ones sit higher and win z-order during swaps.
          // Non-pinned headers ride just above normal rows.
          const style: CSSProperties = isPinned
            ? { position: "sticky", top: pinnedTop, zIndex: 30 - pinned.indexOf(vr.index) }
            : {
                position: "absolute",
                transform: `translateY(${vr.start}px)`,
                zIndex: sticky?.set.has(vr.index) ? 1 : undefined,
              }
          return (
            <RowTag
              key={vr.key}
              data-index={vr.index}
              data-sticky={isPinned ? "" : undefined}
              role={isList ? "listitem" : undefined}
              ref={virtualizer.measureElement}
              // Pinned rows need an opaque backdrop so the rows scrolling under
              // them (and shallower pinned layers) don't bleed through.
              className={isPinned ? "left-0 top-0 w-full bg-background" : "left-0 top-0 w-full"}
              style={style}
            >
              {renderItem(items[vr.index], vr.index)}
            </RowTag>
          )
        })}
      </Sizer>
      {footer}
    </ScrollArea>
  )
}

export default VirtualList
export { useScrollAreaVirtualizer }
export type { VirtualListProps }
