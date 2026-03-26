import { describe, expect, it } from "vitest";
import { HelloWorld } from "../src";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";

describe("HelloWorld", () => {
  it("should say hello", async () => {
    const algorand = AlgorandClient.defaultLocalNet();
    const sender = await algorand.account.dispenserFromEnvironment();
    const helloWorld = await HelloWorld.create(algorand, sender);
    expect(await helloWorld.hello(sender)).toBe("Hello, world!");
  });
});
