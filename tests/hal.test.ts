import { describe, expect, it } from "vitest";
import { collectionElements, getLink, normalizeWorkPackageDetail } from "../src/client/hal.js";

describe("HAL helpers", () => {
  it("extracts collection elements", () => {
    const elements = [{ id: 1 }, { id: 2 }];
    expect(collectionElements({ _embedded: { elements } })).toEqual(elements);
  });

  it("extracts links and work package details", () => {
    const wp = {
      id: 42,
      subject: "Fix pump",
      description: { raw: "Check valve" },
      lockVersion: 7,
      _links: {
        self: { href: "/api/v3/work_packages/42" },
        status: { href: "/api/v3/statuses/1", title: "Open" },
        assignee: { href: "/api/v3/users/5", title: "Ada" },
        addComment: { href: "/api/v3/work_packages/42/activities", method: "post" },
      },
    };
    expect(getLink(wp, "self")?.href).toBe("/api/v3/work_packages/42");
    expect(normalizeWorkPackageDetail(wp)).toMatchObject({ id: 42, subject: "Fix pump", status: "Open", assignee: "Ada", description: "Check valve", lockVersion: 7 });
  });
});
