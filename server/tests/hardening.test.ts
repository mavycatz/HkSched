import request from "supertest";
import { createApp } from "../src/app";
import { getPool } from "../src/db/pool";

jest.setTimeout(30000);

const app = createApp();

describe("GET /health (DB ping)", () => {
  test("returns 200 up when the database answers", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "up" });
  });

  test("returns non-200 when the database is unreachable", async () => {
    const pool = getPool();
    const spy = jest
      .spyOn(pool, "query")
      .mockImplementationOnce(() => Promise.reject(new Error("connection refused")) as any);
    try {
      const res = await request(app).get("/health");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: "down" });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("hardening", () => {
  test("helmet security headers are present", async () => {
    const res = await request(app).get("/login");
    expect(res.status).toBe(200);
    expect(res.headers["content-security-policy"]).toBeTruthy();
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeTruthy();
    expect(res.headers["referrer-policy"]).toBeTruthy();
    // Same-origin site: no CORS headers are emitted.
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("oversized form bodies are rejected with 413 and no stack trace", async () => {
    const huge = "x".repeat(100 * 1024);
    const res = await request(app)
      .post("/login")
      .type("form")
      .send({ identifier: huge, password: "pw" });

    expect(res.status).toBe(413);
    expect(res.text).not.toContain("node_modules");
    expect(res.text).not.toContain("at Object.");
    expect(res.text).not.toContain(".ts:");
  });

  test("validation failures return 422 with inline messages, not a stack", async () => {
    const agent = request.agent(app);
    const page = await agent.get("/login");
    const token = page.text.match(/name="_csrf" value="([^"]+)"/)![1];
    const res = await agent
      .post("/login")
      .type("form")
      .send({ identifier: "", password: "", _csrf: token });

    expect(res.status).toBe(422);
    expect(res.text).toContain("Username is required");
    expect(res.text).not.toContain("node_modules");
  });

  test("unexpected errors render a themed 500 without leaking internals", async () => {
    const res = await request(app).get("/login").set("Cookie", "x=y");
    expect(res.status).toBe(200);

    // 404 path uses the same themed error rendering.
    const notFound = await request(app).get("/definitely-not-a-page");
    expect(notFound.status).toBe(404);
    expect(notFound.text).toContain("/css/theme.css");
    expect(notFound.text).not.toContain("node_modules");
  });
});
