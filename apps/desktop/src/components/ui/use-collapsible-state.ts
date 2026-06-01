import * as React from "react"

/**
 * Persistent open/closed state for collapsible UI primitives.
 *
 * Storage layout (cf. UI_PRIMITIVES.md §2.4):
 *   ui.collapsible.app.<id>                 → host-rendered sections
 *   ui.collapsible.plugin.<pluginId>.<id>   → plugin-rendered sections
 *
 * Pass a pre-namespaced key (`"app.foo"` / `"plugin.openrouter.bar"`). The
 * host wraps `<Section>` for plugins to inject the `plugin.<id>.` prefix
 * before it ever reaches this hook, so a plugin cannot read or overwrite
 * the host's keys.
 *
 * Controlled mode (`controlled` defined) skips persistence entirely.
 */

const STORAGE_PREFIX = "ui.collapsible."

const readStored = (key: string, fallback: boolean): boolean => {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key)
    if (raw === "true") return true
    if (raw === "false") return false
  } catch {
    // private mode / quota / serialization — fall through
  }
  return fallback
}

const writeStored = (key: string, value: boolean): void => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, value ? "true" : "false")
  } catch {
    // ignore
  }
}

type Options = {
  persistKey?: string
  defaultOpen?: boolean
  controlled?: boolean
  onOpenChange?: (open: boolean) => void
}

type Result = {
  open: boolean
  setOpen: (next: boolean) => void
  toggle: () => void
}

const useCollapsibleState = ({
  persistKey,
  defaultOpen = true,
  controlled,
  onOpenChange,
}: Options): Result => {
  const initial = React.useMemo(
    () => (persistKey ? readStored(persistKey, defaultOpen) : defaultOpen),
    // Read once on mount — subsequent changes to persistKey/defaultOpen are
    // not expected and would race with user toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(initial)
  const isControlled = controlled !== undefined
  const open = isControlled ? (controlled) : uncontrolledOpen

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next)
      if (persistKey) writeStored(persistKey, next)
      onOpenChange?.(next)
    },
    [isControlled, persistKey, onOpenChange],
  )

  const toggle = React.useCallback(() => setOpen(!open), [open, setOpen])

  return { open, setOpen, toggle }
}

export default useCollapsibleState
export { useCollapsibleState, STORAGE_PREFIX }
export type { Options as UseCollapsibleStateOptions, Result as UseCollapsibleStateResult }
