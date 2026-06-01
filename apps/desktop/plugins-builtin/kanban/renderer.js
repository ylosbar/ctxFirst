// Kanban plugin — renderer half. Plain ESM, no JSX, no bundler. All UI is
// built via `ui.react.h(...)` and the shared host primitives so the plugin
// inherits theme + density tokens without copy-pasting Tailwind classes.
//
// Architecture (cf. specs/plugin-kanban.md):
//  - Single board, normalized by id, persisted as one JSON file in main.
//  - `useBoard` hook owns state, runs an initial `load-board`, and debounces
//    `save-board` (300ms) so a multi-step drag triggers a single write.
//  - HTML5-native drag-and-drop. No external dnd lib — plugins can't import
//    one (cf. PLUGINS.md §5.3) and the native API covers the full need.

// ---- ids / time helpers ----------------------------------------------------

const newId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const nowIso = () => new Date().toISOString();

// ---- ticket types ----------------------------------------------------------
// A ticket carries one optional type. Each maps to a Badge `tone` so the card
// shows a distinctly-coloured label. Empty / absent type = untyped (no badge).

const TICKET_TYPES = ["Bug", "Increment", "Feature", "Refacto", "Idea"];

const TYPE_TONE = {
  Bug: "danger",
  Increment: "info",
  Feature: "success",
  Refacto: "accent",
  Idea: "warning",
};

// ---- ticket priorities -----------------------------------------------------
// One optional priority per ticket, ordinal Low → Urgent. Rendered as a second
// Badge (with a flag icon, to read distinctly from the type badge). Empty /
// absent priority = unprioritised (no badge).

const TICKET_PRIORITIES = ["Low", "Medium", "High", "Urgent"];

const PRIORITY_TONE = {
  Low: "neutral",
  Medium: "info",
  High: "warning",
  Urgent: "danger",
};

// ---- pure mutations on Board ----------------------------------------------

const addColumn = (board, title) => ({
  ...board,
  columns: [...board.columns, { id: newId(), title, ticketIds: [] }],
});

const renameColumn = (board, columnId, title) => ({
  ...board,
  columns: board.columns.map((c) => (c.id === columnId ? { ...c, title } : c)),
});

const deleteColumn = (board, columnId) => {
  const col = board.columns.find((c) => c.id === columnId);
  if (!col) return board;
  const tickets = { ...board.tickets };
  for (const tid of col.ticketIds) delete tickets[tid];
  return {
    ...board,
    columns: board.columns.filter((c) => c.id !== columnId),
    tickets,
  };
};

const moveColumn = (board, columnId, direction) => {
  const idx = board.columns.findIndex((c) => c.id === columnId);
  if (idx < 0) return board;
  const target = idx + direction;
  if (target < 0 || target >= board.columns.length) return board;
  const cols = [...board.columns];
  [cols[idx], cols[target]] = [cols[target], cols[idx]];
  return { ...board, columns: cols };
};

const addTicket = (board, columnId, { title, description, type, priority }) => {
  const id = newId();
  const now = nowIso();
  return {
    ...board,
    columns: board.columns.map((c) =>
      c.id === columnId ? { ...c, ticketIds: [...c.ticketIds, id] } : c,
    ),
    tickets: {
      ...board.tickets,
      [id]: {
        id,
        title,
        description: description || "",
        type: type || null,
        priority: priority || null,
        createdAt: now,
        updatedAt: now,
      },
    },
  };
};

const editTicket = (board, ticketId, patch) => {
  const existing = board.tickets[ticketId];
  if (!existing) return board;
  return {
    ...board,
    tickets: {
      ...board.tickets,
      [ticketId]: { ...existing, ...patch, updatedAt: nowIso() },
    },
  };
};

const deleteTicket = (board, ticketId) => {
  if (!board.tickets[ticketId]) return board;
  const tickets = { ...board.tickets };
  delete tickets[ticketId];
  return {
    ...board,
    columns: board.columns.map((c) => ({
      ...c,
      ticketIds: c.ticketIds.filter((id) => id !== ticketId),
    })),
    tickets,
  };
};

const moveTicket = (board, ticketId, toColumnId, beforeTicketId) => {
  const fromColumn = board.columns.find((c) => c.ticketIds.includes(ticketId));
  if (!fromColumn) return board;

  // Detect strict no-op (dropping a card right before itself in the same column).
  if (fromColumn.id === toColumnId) {
    const arr = fromColumn.ticketIds;
    const fromIdx = arr.indexOf(ticketId);
    const targetIdx = beforeTicketId ? arr.indexOf(beforeTicketId) : arr.length;
    if (targetIdx === fromIdx || targetIdx === fromIdx + 1) return board;
  }

  const withoutSource = board.columns.map((c) =>
    c.id === fromColumn.id
      ? { ...c, ticketIds: c.ticketIds.filter((id) => id !== ticketId) }
      : c,
  );

  const columns = withoutSource.map((c) => {
    if (c.id !== toColumnId) return c;
    const arr = [...c.ticketIds];
    const idx = beforeTicketId ? arr.indexOf(beforeTicketId) : -1;
    if (idx === -1) arr.push(ticketId);
    else arr.splice(idx, 0, ticketId);
    return { ...c, ticketIds: arr };
  });

  return { ...board, columns };
};

// ---- useBoard hook ---------------------------------------------------------

const useBoard = (ui) => {
  const { useState, useEffect, useCallback, useRef } = ui.react.hooks;
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const saveTimer = useRef(null);
  const boardRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    ui.invoke("load-board")
      .then((b) => {
        if (cancelled) return;
        boardRef.current = b;
        setBoard(b);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e && e.message) || String(e));
      });
    return () => {
      cancelled = true;
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, []);

  const persist = useCallback((next) => {
    boardRef.current = next;
    setBoard(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      ui.invoke("save-board", next).catch((e) => {
        ui.log.error("save-board failed:", e);
      });
    }, 300);
  }, []);

  const mutate = useCallback(
    (fn) => {
      const current = boardRef.current;
      if (!current) return;
      const next = fn(current);
      if (next === current) return;
      persist(next);
    },
    [persist],
  );

  return { board, error, mutate };
};

// ---- icon-button helper ----------------------------------------------------

const iconBtn = (h, { icon, label, onClick, disabled, className, title }) =>
  h(
    "button",
    {
      type: "button",
      onClick,
      disabled,
      "aria-label": label,
      title: title || label,
      className: [
        "inline-flex items-center justify-center rounded-md p-1 text-muted-foreground",
        "hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
        className || "",
      ]
        .filter(Boolean)
        .join(" "),
    },
    h(icon, { className: "size-3.5" }),
  );

// ---- TicketDialog ----------------------------------------------------------

const TicketDialog = ({ ui, mode, initial, onSave, onDelete, onClose }) => {
  const { h, hooks, icons } = ui.react;
  const { useState, useEffect, useRef } = hooks;
  const { Trash2 } = icons;
  const { Button, Input, Textarea, Select, FormField } = ui.primitives;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState(initial?.type ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "");
  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select?.();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmed = title.trim();
  const canSave = trimmed.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      title: trimmed,
      description: description,
      type: type || null,
      priority: priority || null,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSave();
  };

  return h(
    "div",
    {
      className:
        "fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm",
      onMouseDown: (e) => {
        if (e.target === e.currentTarget) onClose();
      },
    },
    h(
      "form",
      {
        onSubmit: handleSubmit,
        className:
          "w-full max-w-4xl rounded-lg border border-border bg-card shadow-lg",
      },
      h(
        "div",
        { className: "flex items-center justify-between border-b border-border px-4 py-2.5" },
        h(
          "h2",
          { className: "text-sm font-medium" },
          mode === "create" ? "New ticket" : "Edit ticket",
        ),
      ),
      h(
        "div",
        { className: "flex flex-col gap-3 px-4 py-3" },
        h(
          FormField,
          { label: "Title" },
          h(Input, {
            ref: titleRef,
            type: "text",
            value: title,
            onChange: (e) => setTitle(e.target.value),
            placeholder: "What needs to happen?",
          }),
        ),
        h(
          "div",
          { className: "grid grid-cols-2 gap-3" },
          h(
            FormField,
            { label: "Type" },
            h(
              Select,
              {
                value: type,
                onChange: (e) => setType(e.target.value),
              },
              h("option", { value: "" }, "No type"),
              TICKET_TYPES.map((t) => h("option", { key: t, value: t }, t)),
            ),
          ),
          h(
            FormField,
            { label: "Priority" },
            h(
              Select,
              {
                value: priority,
                onChange: (e) => setPriority(e.target.value),
              },
              h("option", { value: "" }, "No priority"),
              TICKET_PRIORITIES.map((p) => h("option", { key: p, value: p }, p)),
            ),
          ),
        ),
        h(
          FormField,
          { label: "Description" },
          h(Textarea, {
            value: description,
            onChange: (e) => setDescription(e.target.value),
            placeholder: "Optional. Plain text.",
            rows: 12,
            className: "font-mono text-xs",
          }),
        ),
      ),
      h(
        "div",
        { className: "flex items-center justify-between gap-2 border-t border-border px-4 py-2.5" },
        mode === "edit" && onDelete
          ? h(
              Button,
              {
                type: "button",
                onClick: onDelete,
                variant: "ghost",
                size: "sm",
                className: "text-destructive hover:text-destructive",
              },
              h(Trash2, { className: "size-3.5" }),
              "Delete",
            )
          : h("span", null),
        h(
          "div",
          { className: "flex items-center gap-2" },
          h(
            Button,
            { type: "button", onClick: onClose, variant: "outline", size: "sm" },
            "Cancel",
          ),
          h(
            Button,
            { type: "submit", disabled: !canSave, size: "sm" },
            "Save",
          ),
        ),
      ),
    ),
  );
};

// ---- ColumnMenu ------------------------------------------------------------

const ColumnMenu = ({ ui, onRename, onMoveLeft, onMoveRight, onDelete, canMoveLeft, canMoveRight, onClose }) => {
  const { h, hooks, icons } = ui.react;
  const { useEffect, useRef } = hooks;
  const { Pencil, ArrowLeft, ArrowRight, Trash2 } = icons;
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const item = (props, label, Icon, danger) =>
    h(
      "button",
      {
        type: "button",
        onClick: () => {
          onClose();
          props.onClick();
        },
        disabled: props.disabled,
        className: [
          "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs",
          "hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40",
          danger ? "text-destructive" : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
      h(Icon, { className: "size-3.5" }),
      label,
    );

  return h(
    "div",
    {
      ref,
      className:
        "absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-md border border-border bg-popover py-1 shadow-md",
    },
    item({ onClick: onRename }, "Rename", Pencil),
    item({ onClick: onMoveLeft, disabled: !canMoveLeft }, "Move left", ArrowLeft),
    item({ onClick: onMoveRight, disabled: !canMoveRight }, "Move right", ArrowRight),
    h("div", { className: "my-1 border-t border-border" }),
    item({ onClick: onDelete }, "Delete column", Trash2, true),
  );
};

// ---- Card ------------------------------------------------------------------

const Card = ({ ui, ticket, isSelected, onSelect, onEdit, onDragStart, onDragEnd, onDragOverCard, onDropOnCard, isDragging, isDropTarget }) => {
  const { h, icons } = ui.react;
  const { Flag, Pencil } = icons;
  const { Badge } = ui.primitives;

  return h(
    "div",
    {
      draggable: true,
      onDragStart: (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", ticket.id);
        onDragStart(ticket.id);
      },
      onDragEnd,
      onDragOver: (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        onDragOverCard(ticket.id);
      },
      onDrop: (e) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId) onDropOnCard(draggedId, ticket.id);
      },
      onClick: () => onSelect(ticket.id),
      className: [
        "group relative cursor-pointer select-none rounded-md border border-border bg-background p-2 shadow",
        "hover:border-foreground/30 hover:shadow-md",
        isSelected ? "ring-1 ring-primary bg-primary/5" : "",
        isDragging ? "opacity-40" : "",
        isDropTarget ? "border-t-2 border-t-primary" : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
    h(
      "button",
      {
        type: "button",
        title: "Edit",
        "aria-label": "Edit card",
        onClick: (e) => {
          e.stopPropagation();
          onEdit();
        },
        className:
          "absolute right-1 top-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
      },
      h(Pencil, { className: "size-3" }),
    ),
    ticket.type || ticket.priority
      ? h(
          "div",
          { className: "mb-1.5 flex flex-wrap items-center gap-1" },
          ticket.type
            ? h(
                Badge,
                { tone: TYPE_TONE[ticket.type] || "neutral", size: "sm" },
                ticket.type,
              )
            : null,
          ticket.priority
            ? h(
                Badge,
                { tone: PRIORITY_TONE[ticket.priority] || "neutral", size: "sm" },
                h(Flag, { className: "size-2.5" }),
                ticket.priority,
              )
            : null,
        )
      : null,
    h(
      "div",
      { className: "text-xs font-medium leading-snug" },
      ticket.title || h("span", { className: "text-muted-foreground italic" }, "(untitled)"),
    ),
    ticket.description
      ? h(
          "p",
          {
            className:
              "mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] text-muted-foreground",
          },
          ticket.description,
        )
      : null,
  );
};

// ---- Column ----------------------------------------------------------------

const Column = ({ ui, board, column, index, mutate, onOpenTicket, onCreateTicket, selectedTicketId, onSelectTicket, drag, setDrag, matchesFilter }) => {
  const { h, hooks, icons } = ui.react;
  const { useState, useRef, useEffect } = hooks;
  const { Plus, MoreHorizontal } = icons;
  const { Button, Input, ScrollArea } = ui.primitives;

  // Tickets surviving the active filter, in column order. Hidden cards stay in
  // the board (and in drag/move math) — they're just not rendered here.
  const visibleTicketIds = column.ticketIds.filter((tid) => {
    const t = board.tickets[tid];
    return t && matchesFilter(t);
  });
  const hiddenCount = column.ticketIds.length - visibleTicketIds.length;

  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(column.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const renameRef = useRef(null);

  useEffect(() => {
    if (renaming) {
      renameRef.current?.focus();
      renameRef.current?.select?.();
    }
  }, [renaming]);

  const commitRename = () => {
    const next = draftTitle.trim();
    setRenaming(false);
    if (next && next !== column.title) {
      mutate((b) => renameColumn(b, column.id, next));
    } else {
      setDraftTitle(column.title);
    }
  };

  const handleDelete = () => {
    const count = column.ticketIds.length;
    if (count > 0) {
      const msg = count === 1
        ? "Delete this column and its 1 ticket?"
        : `Delete this column and its ${count} tickets?`;
      if (!window.confirm(msg)) return;
    }
    mutate((b) => deleteColumn(b, column.id));
  };

  const isOverHere = drag.draggedId && drag.overColumnId === column.id;
  const dropOnEnd = isOverHere && !drag.overTicketId;

  const handleColumnDragOver = (e) => {
    if (!drag.draggedId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Hovering the column body but not a card → drop at end.
    if (drag.overColumnId !== column.id || drag.overTicketId) {
      setDrag((d) => ({ ...d, overColumnId: column.id, overTicketId: null }));
    }
  };

  const handleColumnDrop = (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    mutate((b) => moveTicket(b, draggedId, column.id, null));
    setDrag({ draggedId: null, overColumnId: null, overTicketId: null });
  };

  const handleCardDragOver = (ticketId) => {
    if (!drag.draggedId) return;
    if (drag.overColumnId !== column.id || drag.overTicketId !== ticketId) {
      setDrag({ draggedId: drag.draggedId, overColumnId: column.id, overTicketId: ticketId });
    }
  };

  const handleCardDrop = (draggedId, beforeTicketId) => {
    mutate((b) => moveTicket(b, draggedId, column.id, beforeTicketId));
    setDrag({ draggedId: null, overColumnId: null, overTicketId: null });
  };

  return h(
    "div",
    {
      className:
        "flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/40",
      onDragOver: handleColumnDragOver,
      onDrop: handleColumnDrop,
      onDragLeave: (e) => {
        // Only clear if leaving the column root, not crossing into a child.
        if (e.currentTarget === e.target && drag.overColumnId === column.id) {
          setDrag((d) => ({ ...d, overColumnId: null, overTicketId: null }));
        }
      },
    },
    h(
      "div",
      { className: "relative flex items-center gap-1 px-2.5 py-2" },
      renaming
        ? h(Input, {
            ref: renameRef,
            type: "text",
            value: draftTitle,
            onChange: (e) => setDraftTitle(e.target.value),
            onBlur: commitRename,
            onKeyDown: (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setRenaming(false);
                setDraftTitle(column.title);
              }
            },
            className: "h-7 flex-1 text-xs",
          })
        : h(
            "button",
            {
              type: "button",
              onDoubleClick: () => {
                setDraftTitle(column.title);
                setRenaming(true);
              },
              className:
                "flex-1 truncate text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground",
              title: "Double-click to rename",
            },
            column.title,
          ),
      h(
        "span",
        {
          className:
            "rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground",
        },
        String(visibleTicketIds.length),
      ),
      h(
        "div",
        { className: "relative" },
        iconBtn(h, {
          icon: MoreHorizontal,
          label: "Column actions",
          onClick: () => setMenuOpen((v) => !v),
        }),
        menuOpen
          ? h(ColumnMenu, {
              ui,
              onRename: () => {
                setDraftTitle(column.title);
                setRenaming(true);
              },
              onMoveLeft: () => mutate((b) => moveColumn(b, column.id, -1)),
              onMoveRight: () => mutate((b) => moveColumn(b, column.id, +1)),
              onDelete: handleDelete,
              canMoveLeft: index > 0,
              canMoveRight: index < board.columns.length - 1,
              onClose: () => setMenuOpen(false),
            })
          : null,
      ),
    ),
    h(
      ScrollArea,
      {
        className: "flex flex-1 min-h-0 flex-col gap-1.5 px-2 pb-2",
      },
      visibleTicketIds.length === 0
        ? h(
            "div",
            {
              className: [
                "flex min-h-[60px] items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground",
                isOverHere ? "border-primary bg-primary/5" : "border-border",
              ].join(" "),
            },
            isOverHere
              ? "Drop here"
              : hiddenCount > 0
                ? "No matching tickets"
                : "No tickets",
          )
        : visibleTicketIds.map((tid) => {
            const ticket = board.tickets[tid];
            if (!ticket) return null;
            return h(Card, {
              key: tid,
              ui,
              ticket,
              isDragging: drag.draggedId === tid,
              isDropTarget:
                drag.draggedId &&
                drag.overColumnId === column.id &&
                drag.overTicketId === tid &&
                drag.draggedId !== tid,
              isSelected: selectedTicketId === tid,
              onSelect: onSelectTicket,
              onEdit: () => onOpenTicket(ticket),
              onDragStart: (id) =>
                setDrag({ draggedId: id, overColumnId: column.id, overTicketId: null }),
              onDragEnd: () =>
                setDrag({ draggedId: null, overColumnId: null, overTicketId: null }),
              onDragOverCard: handleCardDragOver,
              onDropOnCard: handleCardDrop,
            });
          }),
      // Trailing drop zone — only visible/active while a card is being dragged
      // and the user is in this column past the last card.
      drag.draggedId && visibleTicketIds.length > 0
        ? h("div", {
            className: [
              "min-h-[16px] rounded transition-colors",
              dropOnEnd ? "bg-primary/10" : "",
            ].join(" "),
          })
        : null,
    ),
    h(
      "div",
      { className: "border-t border-border px-2 py-1.5" },
      h(
        Button,
        {
          type: "button",
          variant: "ghost",
          size: "sm",
          onClick: () => onCreateTicket(column.id),
          className: "w-full justify-start gap-1.5 text-xs text-muted-foreground",
        },
        h(Plus, { className: "size-3.5" }),
        "Add card",
      ),
    ),
  );
};

// ---- AddColumnControl ------------------------------------------------------

const AddColumnControl = ({ ui, mutate }) => {
  const { h, hooks, icons } = ui.react;
  const { useState, useRef, useEffect } = hooks;
  const { Plus } = icons;
  const { Button, Input } = ui.primitives;

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commit = () => {
    const next = title.trim();
    if (next) {
      mutate((b) => addColumn(b, next));
    }
    setTitle("");
    setOpen(false);
  };

  if (!open) {
    return h(
      Button,
      {
        type: "button",
        size: "sm",
        variant: "outline",
        onClick: () => setOpen(true),
      },
      h(Plus, { className: "size-3.5" }),
      "Add column",
    );
  }

  return h(
    "div",
    { className: "flex items-center gap-1" },
    h(Input, {
      ref: inputRef,
      type: "text",
      value: title,
      onChange: (e) => setTitle(e.target.value),
      onBlur: commit,
      onKeyDown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setTitle("");
          setOpen(false);
        }
      },
      placeholder: "Column title",
      className: "h-8 w-48 text-xs",
    }),
    h(
      Button,
      { type: "button", size: "sm", onClick: commit, disabled: !title.trim() },
      "Add",
    ),
  );
};

// ---- FilterBar -------------------------------------------------------------
// Toggle chips for type + priority. Selection is OR within a category and AND
// across categories (cf. `matchesFilter` in KanbanPage). Empty selection in a
// category = no constraint from that category.

const FilterChip = ({ ui, label, active, tone, onClick }) => {
  const { h } = ui.react;
  const { Badge } = ui.primitives;
  return h(
    Badge,
    {
      size: "sm",
      tone: active ? tone : undefined,
      variant: active ? undefined : "outline",
      className: ["cursor-pointer select-none", active ? "" : "opacity-50 hover:opacity-100"]
        .filter(Boolean)
        .join(" "),
      render: h("button", { type: "button", "aria-pressed": active, onClick }),
    },
    label,
  );
};

const FilterBar = ({ ui, typeFilter, setTypeFilter, priorityFilter, setPriorityFilter }) => {
  const { h } = ui.react;
  const { Button } = ui.primitives;

  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const hasActive = typeFilter.length > 0 || priorityFilter.length > 0;
  const groupLabel = (text) =>
    h("span", { className: "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" }, text);

  return h(
    "div",
    { className: "flex flex-wrap items-center gap-x-3 gap-y-1.5" },
    h(
      "div",
      { className: "flex flex-wrap items-center gap-1" },
      groupLabel("Type"),
      TICKET_TYPES.map((t) =>
        h(FilterChip, {
          key: t,
          ui,
          label: t,
          tone: TYPE_TONE[t] || "neutral",
          active: typeFilter.includes(t),
          onClick: () => toggle(typeFilter, setTypeFilter, t),
        }),
      ),
    ),
    h("div", { className: "h-4 w-px bg-border" }),
    h(
      "div",
      { className: "flex flex-wrap items-center gap-1" },
      groupLabel("Priority"),
      TICKET_PRIORITIES.map((p) =>
        h(FilterChip, {
          key: p,
          ui,
          label: p,
          tone: PRIORITY_TONE[p] || "neutral",
          active: priorityFilter.includes(p),
          onClick: () => toggle(priorityFilter, setPriorityFilter, p),
        }),
      ),
    ),
    hasActive
      ? h(
          Button,
          {
            type: "button",
            variant: "ghost",
            size: "sm",
            className: "h-6 px-2 text-xs text-muted-foreground",
            onClick: () => {
              setTypeFilter([]);
              setPriorityFilter([]);
            },
          },
          "Clear",
        )
      : null,
  );
};

// ---- KanbanPage ------------------------------------------------------------

const KanbanPage = ({ ui }) => {
  const { h, hooks, icons } = ui.react;
  const { useState } = hooks;
  const { KanbanSquare } = icons;
  const { EmptyState, ScrollArea } = ui.primitives;

  const { board, error, mutate } = useBoard(ui);

  const [dialog, setDialog] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [drag, setDrag] = useState({
    draggedId: null,
    overColumnId: null,
    overTicketId: null,
  });
  const [typeFilter, setTypeFilter] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState([]);

  // OR within a category, AND across categories. An empty category = no
  // constraint. A null type/priority never matches a non-empty selection.
  const matchesFilter = (ticket) => {
    if (typeFilter.length > 0 && !typeFilter.includes(ticket.type)) return false;
    if (priorityFilter.length > 0 && !priorityFilter.includes(ticket.priority)) return false;
    return true;
  };

  if (error) {
    return h(EmptyState, {
      icon: h(KanbanSquare, { className: "size-8" }),
      title: "Failed to load board",
      description: error,
    });
  }
  if (!board) {
    return h(EmptyState, {
      icon: h(KanbanSquare, { className: "size-8" }),
      title: "Loading…",
    });
  }

  const handleSelectTicket = (ticketId) =>
    setSelectedTicketId((cur) => (cur === ticketId ? null : ticketId));
  const handleOpenTicket = (ticket) =>
    setDialog({ mode: "edit", ticketId: ticket.id });
  const handleCreateTicket = (columnId) =>
    setDialog({ mode: "create", columnId });
  const closeDialog = () => setDialog(null);

  const dialogInitial =
    dialog?.mode === "edit"
      ? board.tickets[dialog.ticketId]
      : null;

  return h(
    "div",
    { className: "flex h-full min-w-0 flex-col gap-3 p-3" },
    h(
      "div",
      { className: "flex items-center justify-between" },
      h(
        "div",
        { className: "flex items-center gap-2 text-sm font-medium" },
        h(KanbanSquare, { className: "size-4" }),
        "Kanban",
      ),
      h(AddColumnControl, { ui, mutate }),
    ),
    board.columns.length > 0
      ? h(FilterBar, {
          ui,
          typeFilter,
          setTypeFilter,
          priorityFilter,
          setPriorityFilter,
        })
      : null,
    board.columns.length === 0
      ? h(EmptyState, {
          icon: h(KanbanSquare, { className: "size-8" }),
          title: "No columns yet",
          description: "Click \"Add column\" above to get started.",
        })
      : h(
          ScrollArea,
          {
            className: "flex min-h-0 flex-1 gap-3 pb-2",
            options: { overflow: { y: "hidden" } },
          },
          board.columns.map((col, idx) =>
            h(Column, {
              key: col.id,
              ui,
              board,
              column: col,
              index: idx,
              mutate,
              onOpenTicket: handleOpenTicket,
              onCreateTicket: handleCreateTicket,
              selectedTicketId,
              onSelectTicket: handleSelectTicket,
              drag,
              setDrag,
              matchesFilter,
            }),
          ),
        ),
    dialog
      ? h(TicketDialog, {
          ui,
          mode: dialog.mode,
          initial: dialogInitial,
          onSave: ({ title, description, type, priority }) => {
            if (dialog.mode === "create") {
              mutate((b) => addTicket(b, dialog.columnId, { title, description, type, priority }));
            } else {
              mutate((b) => editTicket(b, dialog.ticketId, { title, description, type, priority }));
            }
            closeDialog();
          },
          onDelete:
            dialog.mode === "edit"
              ? () => {
                  if (window.confirm("Delete this ticket?")) {
                    mutate((b) => deleteTicket(b, dialog.ticketId));
                    closeDialog();
                  }
                }
              : undefined,
          onClose: closeDialog,
        })
      : null,
  );
};

// ---- lifecycle -------------------------------------------------------------

export const onload = (ui) => {
  ui.addPage({
    id: "kanban",
    title: "Kanban",
    icon: ui.react.icons.KanbanSquare,
    order: 600,
    // Render the board in the central editor area so columns get the full
    // workspace width rather than being squeezed into the primary sidebar.
    // No sidebar contribution — the page's own toolbar already exposes every
    // control the user needs, and the activity has nothing to navigate.
    mainView: ui.react.h(KanbanPage, { ui }),
  });
  ui.log.info("renderer onload registered Kanban page");
};

export const onunload = (ui) => {
  ui.log.info("renderer onunload");
};
