import { describe, expect, it } from "vitest";

import {
  COALESCE_MS,
  HISTORY_LIMIT,
  beginHistory,
  canRedo,
  canUndo,
  commitHistory,
  initialHistory,
  redoHistory,
  settleHistory,
  undoHistory,
} from "./history-stack";
import type { EditorDoc } from "./editor-doc";

// Un doc discriminable par un simple `tag` posé dans les data d'une node.
const doc = (tag: string): EditorDoc => ({
  nodes: [
    {
      id: "step-1",
      type: "step",
      position: { x: 0, y: 0 },
      data: { tag },
    },
  ],
  edges: [],
  entryStepId: null,
  variables: [],
});

const tagsOf = (docs: readonly EditorDoc[]): string[] =>
  docs.map((d) => (d.nodes[0].data as { tag: string }).tag);

describe("commitHistory", () => {
  it("empile le present sur past et vide future", () => {
    let s = commitHistory(initialHistory, doc("a"), { now: 0 });
    // Simule un redo en attente puis un nouveau commit qui doit le purger.
    s = { ...s, future: [doc("z")] };
    s = commitHistory(s, doc("b"), { now: 10 });
    expect(tagsOf(s.past)).toEqual(["a", "b"]);
    expect(s.future).toEqual([]);
  });

  it("saute le push si le present est identique au sommet (dédup no-op)", () => {
    const s1 = commitHistory(initialHistory, doc("a"), { now: 0 });
    const s2 = commitHistory(s1, doc("a"), { now: 5 });
    expect(s2).toBe(s1);
    expect(tagsOf(s2.past)).toEqual(["a"]);
  });

  it("coalesce deux commits même clé dans la fenêtre (un seul push)", () => {
    const s1 = commitHistory(initialHistory, doc("a"), {
      coalesceKey: "cfg:1",
      now: 0,
    });
    const s2 = commitHistory(s1, doc("b"), {
      coalesceKey: "cfg:1",
      now: COALESCE_MS - 1,
    });
    expect(tagsOf(s2.past)).toEqual(["a"]);
    expect(s2.lastCommitTime).toBe(COALESCE_MS - 1); // fenêtre glissée
  });

  it("ne coalesce pas hors fenêtre ou avec une clé différente", () => {
    const s1 = commitHistory(initialHistory, doc("a"), {
      coalesceKey: "cfg:1",
      now: 0,
    });
    const outOfWindow = commitHistory(s1, doc("b"), {
      coalesceKey: "cfg:1",
      now: COALESCE_MS + 1,
    });
    expect(tagsOf(outOfWindow.past)).toEqual(["a", "b"]);

    const otherKey = commitHistory(s1, doc("c"), {
      coalesceKey: "cfg:2",
      now: 1,
    });
    expect(tagsOf(otherKey.past)).toEqual(["a", "c"]);
  });

  it("ne coalesce jamais un commit sans clé", () => {
    const s1 = commitHistory(initialHistory, doc("a"), { now: 0 });
    const s2 = commitHistory(s1, doc("b"), { now: 1 });
    expect(tagsOf(s2.past)).toEqual(["a", "b"]);
  });

  it("borne past à HISTORY_LIMIT en droppant le plus ancien (FIFO)", () => {
    let s = initialHistory;
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      s = commitHistory(s, doc(`d${i}`), { now: i });
    }
    const tags = tagsOf(s.past);
    expect(s.past.length).toBe(HISTORY_LIMIT);
    expect(tags[0]).toBe("d5");
    expect(tags[tags.length - 1]).toBe(`d${HISTORY_LIMIT + 4}`);
  });
});

describe("undo / redo", () => {
  it("undo restaure le sommet et pousse le present dans future", () => {
    const s1 = commitHistory(initialHistory, doc("a"), { now: 0 });
    const res = undoHistory(s1, doc("present"));
    expect(res).not.toBeNull();
    expect((res!.restored!.nodes[0].data as { tag: string }).tag).toBe("a");
    expect(tagsOf(res!.state.future)).toEqual(["present"]);
    expect(res!.state.past).toEqual([]);
  });

  it("undo retourne null sur past vide", () => {
    expect(undoHistory(initialHistory, doc("x"))).toBeNull();
  });

  it("redo restaure la tête de future et ré-empile le present", () => {
    const s1 = commitHistory(initialHistory, doc("a"), { now: 0 });
    const undone = undoHistory(s1, doc("b"))!;
    const redone = redoHistory(undone.state, doc("a"))!;
    expect((redone.restored!.nodes[0].data as { tag: string }).tag).toBe("b");
    expect(tagsOf(redone.state.past)).toEqual(["a"]);
    expect(redone.state.future).toEqual([]);
  });

  it("redo retourne null sur future vide", () => {
    expect(redoHistory(initialHistory, doc("x"))).toBeNull();
  });

  it("undo puis redo est un aller-retour symétrique", () => {
    const s1 = commitHistory(initialHistory, doc("a"), { now: 0 });
    const undone = undoHistory(s1, doc("b"))!;
    const redone = redoHistory(undone.state, undone.restored!)!;
    expect(canUndo(redone.state)).toBe(true);
    expect(canRedo(redone.state)).toBe(false);
    expect(tagsOf(redone.state.past)).toEqual(["a"]);
  });
});

// Régression : un geste à delta nul (drag ramené dans la même cellule au snap,
// auto-layout d'un graphe déjà rangé…) empile une frame `docKey`-égale au
// present. `commitHistory` ne la dédoublonne pas (il ne compare qu'au sommet de
// past, pas au present *post*-mutation), donc `undo`/`redo` doivent la peler
// pour ne pas gâcher une pression (« il faut appuyer plusieurs fois sur undo »).
describe("undo / redo — garde anti-no-op (frames fantômes)", () => {
  it("undo pèle la frame fantôme du sommet et restaure la suivante en un appel", () => {
    // past = [a, b], present = b (b = doc empilé par une commande à delta nul).
    let s = commitHistory(initialHistory, doc("a"), { now: 0 });
    s = commitHistory(s, doc("b"), { now: 1 });
    const res = undoHistory(s, doc("b"))!; // present === sommet fantôme b
    expect((res.restored!.nodes[0].data as { tag: string }).tag).toBe("a");
    expect(res.state.past).toEqual([]);
    // La frame fantôme est jetée ; seul l'ancien present part dans future.
    expect(tagsOf(res.state.future)).toEqual(["b"]);
  });

  it("undo ne restaure rien mais élague quand past n'a que des fantômes du present", () => {
    const s = commitHistory(initialHistory, doc("a"), { now: 0 }); // past = [a]
    const res = undoHistory(s, doc("a"))!; // present === unique entrée a
    expect(res.restored).toBeNull();
    expect(res.state.past).toEqual([]);
    expect(canUndo(res.state)).toBe(false);
  });

  it("redo pèle la tête de future fantôme et restaure la suivante", () => {
    const state = { ...initialHistory, future: [doc("a"), doc("b")] };
    const res = redoHistory(state, doc("a"))!; // present === tête fantôme a
    expect((res.restored!.nodes[0].data as { tag: string }).tag).toBe("b");
    expect(res.state.future).toEqual([]);
    expect(tagsOf(res.state.past)).toEqual(["a"]);
  });
});

describe("begin / settle", () => {
  it("settle(true) empile le pending capturé par begin", () => {
    const begun = beginHistory(initialHistory, doc("pre"));
    const settled = settleHistory(begun, { keep: true, now: 0 });
    expect(tagsOf(settled.past)).toEqual(["pre"]);
    expect(settled.pending).toBeNull();
  });

  it("settle(false) jette le pending sans rien empiler", () => {
    const begun = beginHistory(initialHistory, doc("pre"));
    const settled = settleHistory(begun, { keep: false, now: 0 });
    expect(settled.past).toEqual([]);
    expect(settled.pending).toBeNull();
  });

  it("settle sans pending est un no-op", () => {
    const settled = settleHistory(initialHistory, { keep: true, now: 0 });
    expect(settled.past).toEqual([]);
  });

  it("settle(true) dédup si le pending est identique au sommet", () => {
    const s1 = commitHistory(initialHistory, doc("a"), { now: 0 });
    const begun = beginHistory(s1, doc("a"));
    const settled = settleHistory(begun, { keep: true, now: 5 });
    expect(tagsOf(settled.past)).toEqual(["a"]);
  });
});
