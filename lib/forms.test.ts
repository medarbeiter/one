import { expect, test } from "bun:test";
import { instantFormsUrl } from "./forms";

test("the deep link points at the page's Instant Forms library", () => {
  const url = new URL(instantFormsUrl("337164132803732"));
  expect(url.host).toBe("business.facebook.com");
  expect(url.pathname).toBe("/latest/instant_forms");
  expect(url.searchParams.get("asset_id")).toBe("337164132803732");
});
