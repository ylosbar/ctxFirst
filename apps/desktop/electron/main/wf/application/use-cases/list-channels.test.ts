import { describe, expect, it } from "vitest";
import { makeListChannels } from "./list-channels";
import { createFakeChannelRegistry } from "../../__tests__/fixtures/fake-registries";

describe("listChannels use-case", () => {
  it("forwards to the registry", async () => {
    const channels = createFakeChannelRegistry();
    const list = makeListChannels({ channels });
    expect(await list()).toHaveLength(1);
  });
});
