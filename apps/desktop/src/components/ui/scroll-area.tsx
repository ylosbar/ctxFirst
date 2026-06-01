import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
} from "react"
import {
  OverlayScrollbars,
  type PartialOptions,
} from "overlayscrollbars"

import { cn } from "@/lib/utils"

export type ScrollAreaHandle = {
  readonly viewport: HTMLElement | null
  readonly instance: OverlayScrollbars | null
}

type ScrollAreaProps = HTMLAttributes<HTMLDivElement> & {
  options?: PartialOptions
}

const ScrollArea = forwardRef<ScrollAreaHandle, ScrollAreaProps>(
  ({ className, children, options, ...rest }, ref) => {
    const rootRef = useRef<HTMLDivElement>(null)
    const instanceRef = useRef<OverlayScrollbars | null>(null)
    // Hold the latest options in a ref so initialization always sees them
    // without re-running the init effect when the caller passes a fresh
    // object literal on every render.
    const optionsRef = useRef(options)
    optionsRef.current = options

    useEffect(() => {
      const el = rootRef.current
      if (!el) return
      // Host = viewport, no padding/content wrappers — otherwise OverlayScrollbars
      // physically moves React's children into a generated content element, and
      // React's reconciler then throws NotFoundError on insertBefore/removeChild
      // because the children are no longer direct descendants of the host.
      const instance = OverlayScrollbars(
        {
          target: el,
          elements: {
            viewport: el,
            padding: false,
            content: false,
          },
        },
        {
          scrollbars: {
            theme: "os-theme-dark",
            autoHide: "leave",
            autoHideDelay: 800,
            clickScroll: true,
          },
          ...optionsRef.current,
        },
      )
      instanceRef.current = instance
      return () => {
        instance.destroy()
        instanceRef.current = null
      }
    }, [])

    // Apply option updates in place. Destroying and re-creating the instance
    // on every render (which happens when callers pass an inline object as
    // `options`) tears down the scrollbar DOM and flashes/flickers during
    // window or panel resizes.
    useEffect(() => {
      const inst = instanceRef.current
      if (!inst || !options) return
      inst.options(options)
    }, [options])

    useImperativeHandle(
      ref,
      () => ({
        get viewport() {
          return instanceRef.current?.elements().viewport ?? null
        },
        get instance() {
          return instanceRef.current
        },
      }),
      [],
    )

    return (
      <div
        ref={rootRef}
        data-overlayscrollbars-initialize=""
        className={cn("relative", className)}
        {...rest}
      >
        {children}
      </div>
    )
  },
)

ScrollArea.displayName = "ScrollArea"

export { ScrollArea }
