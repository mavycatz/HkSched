import request from "supertest";
import type { Express } from "express";

export const PASSWORD = "HkDuty!ChangeMe1";

export type Agent = ReturnType<typeof request.agent>;

export function csrfFrom(html: string): string {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  if (!match) throw new Error("CSRF token not found in page");
  return match[1];
}

export function setCookies(res: request.Response): string[] {
  return (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
}

export function cookieNamed(res: request.Response, name: string): string | undefined {
  return setCookies(res).find((c) => c.startsWith(`${name}=`));
}

/** Create an agent, load /login, and log in as the given account (school id or email). */
export async function loginAs(app: Express, identifier: string): Promise<Agent> {
  const agent = request.agent(app);
  const page = await agent.get("/login").set("User-Agent", "Mozilla/5.0 JestTest");
  const token = csrfFrom(page.text);
  const res = await agent
    .post("/login")
    .set("User-Agent", "Mozilla/5.0 JestTest")
    .type("form")
    .send({ identifier, password: PASSWORD, _csrf: token });
  if (res.status !== 302) {
    throw new Error(`login failed for ${identifier}: ${res.status}`);
  }
  return agent;
}
