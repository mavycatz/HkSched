import request from "supertest";
import { createApp } from "../src/app";
import { assetVersion, computeAssetVersion, listAssetFiles, refreshAssetVersion } from "../src/lib/assets";
import { loginAs } from "./helpers";

jest.setTimeout(30000);

const app = createApp();

/** Every stylesheet and script URL the rendered HTML references. */
function assetRefs(html: string): string[] {
  const refs: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)) {
    const href = match[0].match(/href=["']([^"']+)["']/i);
    if (href) refs.push(href[1]);
  }
  for (const match of html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)) {
    refs.push(match[1]);
  }
  return refs;
}

describe("asset version digest", () => {
  const files = [
    { path: "css/theme.css", size: 10, mtimeMs: 1000, hash: "aaa" },
    { path: "js/shell.js", size: 20, mtimeMs: 2000, hash: "bbb" },
  ];

  test("is stable while the files are unchanged", () => {
    const first = computeAssetVersion(files);
    expect(first).toMatch(/^[0-9a-f]{12}$/);
    expect(computeAssetVersion(files)).toBe(first);
  });

  test("changes when a file's modification time changes", () => {
    const touched = [{ ...files[0], mtimeMs: 1500 }, files[1]];
    expect(computeAssetVersion(touched)).not.toBe(computeAssetVersion(files));
  });

  test("changes when a file's content changes", () => {
    const edited = [files[0], { ...files[1], hash: "ccc" }];
    expect(computeAssetVersion(edited)).not.toBe(computeAssetVersion(files));
  });

  test("assetVersion() returns a stable token for the assets actually served", () => {
    const version = assetVersion();
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    expect(refreshAssetVersion()).toBe(version);
  });

  test("the served tree contains the vendored framework files and the project stylesheet", () => {
    const paths = listAssetFiles().map((file) => file.path);
    expect(paths).toContain("vendor/bootstrap/bootstrap.min.css");
    expect(paths).toContain("vendor/bootstrap/js/bootstrap.bundle.min.js");
    expect(paths).toContain("vendor/bootstrap-icons/bootstrap-icons.min.css");
    expect(paths).toContain("vendor/bootstrap-icons/fonts/bootstrap-icons.woff");
    expect(paths).toContain("vendor/bootstrap-icons/fonts/bootstrap-icons.woff2");
    expect(paths).toContain("css/theme.css");
  });
});

describe("rendered pages reference only same-origin, versioned assets", () => {
  const pages: [string, string][] = [
    ["/login", ""],
    ["/csdl/dashboard", "CSDL-001"],
    ["/csdl/duty-management", "CSDL-001"],
    ["/my-schedule", "T-001"],
    ["/schedule", "S-001"],
    ["/profile", "S-001"],
  ];

  for (const [path, account] of pages) {
    test(`${path} loads every stylesheet and script from this origin with a version`, async () => {
      const agent = account ? await loginAs(app, account) : request(app);
      const res = await agent.get(path);
      expect(res.status).toBe(200);

      const refs = assetRefs(res.text);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(ref.startsWith("/")).toBe(true);
        expect(ref).toMatch(/\?v=[0-9a-f]{12}$/);
      }

      // No external origin is referenced for any asset.
      expect(res.text).not.toContain("cdn.jsdelivr.net");
      expect(res.text).not.toContain("fonts.googleapis.com");
      expect(res.text).not.toContain("fonts.gstatic.com");
      expect(res.text).not.toMatch(/<(link|script)[^>]+(href|src)=["']https?:/i);
    });
  }

  test("the vendor stylesheet and script are referenced by their same-origin paths", async () => {
    const agent = await loginAs(app, "CSDL-001");
    const res = await agent.get("/csdl/dashboard");
    expect(res.text).toContain("/vendor/bootstrap/bootstrap.min.css?v=");
    expect(res.text).toContain("/vendor/bootstrap-icons/bootstrap-icons.min.css?v=");
    expect(res.text).toContain("/vendor/bootstrap/js/bootstrap.bundle.min.js?v=");
    expect(res.text).toContain("/css/theme.css?v=");
  });
});

describe("static asset delivery", () => {
  test("every vendored asset that the templates reference is served with a 200", async () => {
    const files = [
      "/vendor/bootstrap/bootstrap.min.css",
      "/vendor/bootstrap/js/bootstrap.bundle.min.js",
      "/vendor/bootstrap-icons/bootstrap-icons.min.css",
      "/vendor/bootstrap-icons/fonts/bootstrap-icons.woff",
      "/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2",
      "/css/theme.css",
    ];
    for (const file of files) {
      const res = await request(app).get(file);
      expect(`${file} ${res.status}`).toBe(`${file} 200`);
    }
  });

  test("a versioned request is cached indefinitely, an unversioned one is not", async () => {
    const version = assetVersion();

    const versioned = await request(app).get(`/css/theme.css?v=${version}`);
    expect(versioned.status).toBe(200);
    expect(versioned.headers["content-type"]).toMatch(/text\/css/);
    expect(versioned.headers["cache-control"]).toBe("public, max-age=31536000, immutable");

    const vendor = await request(app).get(`/vendor/bootstrap/bootstrap.min.css?v=${version}`);
    expect(vendor.status).toBe(200);
    expect(vendor.headers["cache-control"]).toBe("public, max-age=31536000, immutable");

    const plain = await request(app).get("/css/theme.css");
    expect(plain.status).toBe(200);
    expect(plain.headers["cache-control"]).not.toContain("immutable");
  });

  test("the icon font is served with its font content type", async () => {
    const res = await request(app).get("/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/font\/woff2/);
  });
});
