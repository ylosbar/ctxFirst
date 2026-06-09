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
   * Marks rows that pin to the top while their section scrolls (group headers).
   * The current section's header stays mounted even when scrolled out of the
   * window and is rendered `position: sticky` instead of absolute.
   */
  readonly isSticky?: (item: T, index: number) => boolean
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
}: VirtualListProps<T>) => {
  const scrollRef = useRef<ScrollAreaHandle>(null)

  const stickyIndices = useMemo(() => {
    if (!isSticky) return [] as number[]
    return items.flatMap((item, i) => (isSticky(item, i) ? [i] : []))
  }, [items, isSticky])
  const stickySet = useMemo(() => new Set(stickyIndices), [stickyIndices])

  // The header to pin = the last sticky index at or above the window start. It
  // is tracked in a ref (written during `rangeExtractor`, read while rendering
  // rows below) and force-kept in the window so it never unmounts mid-section.
  const activeStickyRef = useRef<number | null>(null)
  const rangeExtractor = useCallback(
    (range: Range): number[] => {
      if (stickyIndices.length === 0) {
        activeStickyRef.current = null
        return defaultRangeExtractor(range)
      }
      let active: number | null = null
      for (const i of stickyIndices) {
        if (i <= range.startIndex) active = i
        else break
      }
      activeStickyRef.current = active
      const next = new Set(defaultRangeExtractor(range))
      if (active !== null) next.add(active)
      return [...next].sort((a, b) => a - b)
    },
    [stickyIndices],
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
  const activeSticky = activeStickyRef.current

  return (
    <ScrollArea ref={scrollRef} className={className}>
      <Sizer
        role={isList ? "list" : undefined}
        aria-label={ariaLabel}
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {rows.map((vr) => {
          const isActiveSticky = vr.index === activeSticky
          // Active header: pinned at the viewport top (in flow, since every
          // other row is absolute). Non-active headers ride above normal rows.
          const style: CSSProperties = isActiveSticky
            ? { position: "sticky", zIndex: 2 }
            : {
                position: "absolute",
                transform: `translateY(${vr.start}px)`,
                zIndex: stickySet.has(vr.index) ? 1 : undefined,
              }
          return (
            <RowTag
              key={vr.key}
              data-index={vr.index}
              data-sticky={isActiveSticky ? "" : undefined}
              role={isList ? "listitem" : undefined}
              ref={virtualizer.measureElement}
              className="left-0 top-0 w-full"
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
