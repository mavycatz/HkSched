import request from "supertest";
import { createApp } from "../src/app";

describe("smoke", () => {
  it("responds on /health", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
  });
});
