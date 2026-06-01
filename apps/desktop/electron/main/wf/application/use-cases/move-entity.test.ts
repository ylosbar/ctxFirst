import { describe, expect, it } from "vitest";
// eslint-disable-next-line no-restricted-imports -- type-only mirror of the use-case under test (cf. move-entity.ts).
import type Database from "better-sqlite3";
import { makeMoveEntity } from "./move-entity";

type Call = { sql: string; params: unknown[] };

const fakeDb = () => {
  const calls: Call[] = [];
  const db = {
    prepare(sql: string) {
      return {
        run(...params: unknown[]) {
          calls.push({ sql, params });
          return { changes: 1, lastInsertRowid: 0 } as never;
        },
      };
    },
  } as unknown as Database.Database;
  return { db, calls };
};

describe("moveEntity use-case", () => {
  it("templates: runs the right UPDATE with (channelId, id, version)", async () => {
    const { db, calls } = fakeDb();
    const move = makeMoveEntity({ db });
    await move({
      kind: "template",
      ref: { id: "tpl-1", version: "v1" },
      channelId: "dst",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/UPDATE wf_templates SET channel_id = \?/);
    expect(calls[0].params).toEqual(["dst", "tpl-1", "v1"]);
  });

  it("supports channelId=null (make the entity global)", async () => {
    const { db, calls } = fakeDb();
    const move = makeMoveEntity({ db });
    await move({
      kind: "template",
      ref: { id: "tpl-1", version: "v1" },
      channelId: null,
    });
    expect(calls[0].params[0]).toBeNull();
  });

  it("skills: targets wf_skills by ref", async () => {
    const { db, calls } = fakeDb();
    const move = makeMoveEntity({ db });
    await move({ kind: "skill", ref: { ref: "my-skill" }, channelId: "dst" });
    expect(calls[0].sql).toMatch(/UPDATE wf_skills SET channel_id = \? WHERE ref = \?/);
    expect(calls[0].params).toEqual(["dst", "my-skill"]);
  });

  it("artifactSchema: targets wf_artifact_schemas by (id, version)", async () => {
    const { db, calls } = fakeDb();
    const move = makeMoveEntity({ db });
    await move({
      kind: "artifactSchema",
      ref: { id: "Foo", version: "v1" },
      channelId: "dst",
    });
    expect(calls[0].sql).toMatch(/UPDATE wf_artifact_schemas SET channel_id = \?/);
    expect(calls[0].params).toEqual(["dst", "Foo", "v1"]);
  });

  it("parser: targets wf_parsers by (id, version)", async () => {
    const { db, calls } = fakeDb();
    const move = makeMoveEntity({ db });
    await move({
      kind: "parser",
      ref: { id: "p1", version: "v1" },
      channelId: "dst",
    });
    expect(calls[0].sql).toMatch(/UPDATE wf_parsers SET channel_id = \?/);
    expect(calls[0].params).toEqual(["dst", "p1", "v1"]);
  });

  it("rejects template ref missing id/version", async () => {
    const { db } = fakeDb();
    const move = makeMoveEntity({ db });
    await expect(
      move({
        kind: "template",
        ref: { id: "", version: "v1" },
        channelId: "dst",
      }),
    ).rejects.toThrow(/template ref requires/);
  });

  it("rejects skill ref missing the ref field", async () => {
    const { db } = fakeDb();
    const move = makeMoveEntity({ db });
    await expect(
      move({ kind: "skill", ref: { ref: "" }, channelId: "dst" }),
    ).rejects.toThrow(/skill ref requires/);
  });

  it("rejects artifactSchema / parser refs missing id/version", async () => {
    const { db } = fakeDb();
    const move = makeMoveEntity({ db });
    await expect(
      move({
        kind: "artifactSchema",
        ref: { id: "x", version: "" },
        channelId: "dst",
      }),
    ).rejects.toThrow(/artifactSchema ref requires/);
    await expect(
      move({
        kind: "parser",
        ref: { id: "p", version: "" },
        channelId: "dst",
      }),
    ).rejects.toThrow(/parser ref requires/);
  });

  it("throws on unknown kind (exhaustive guard)", async () => {
    const { db } = fakeDb();
    const move = makeMoveEntity({ db });
    await expect(
      move({
        kind: "ghost" as never,
        ref: { id: "x", version: "v1" },
        channelId: "dst",
      }),
    ).rejects.toThrow(/unknown movable entity kind/);
  });
});
