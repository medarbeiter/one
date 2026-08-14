import { expect, test } from "bun:test";

test("the deployment health endpoint reports ready without external dependencies", async () => {
  expect(await Bun.file(new URL("./route.ts", import.meta.url)).exists()).toBe(true);

  const { GET } = await import("./route");
  const response = GET();

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});
