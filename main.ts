import { Application, Router } from "jsr:@oak/oak@17";
import { DatabaseSync } from "node:sqlite";

const dbPath = Deno.env.get("ZELDAS_DB") || "data/zeldas.db";
try {
  Deno.mkdirSync("data", { recursive: true });
} catch {
  /* directory may already exist */
}
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS categories(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS links(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    color TEXT,
    image TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS link_categories(
    link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY(link_id, category_id)
  );
  `);

try {
  db.exec("ALTER TABLE links ADD COLUMN color TEXT");
} catch {
  /* column already exists on existing databases */
}
try {
  db.exec("ALTER TABLE links ADD COLUMN image TEXT");
} catch {
  /* column already exists on existing databases */
}

const PUBLIC = `${Deno.cwd()}/public`;
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SVG = (inner: string) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICON_LINK = SVG(
  `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
);
const ICON_TAG = SVG(
  `<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>`,
);
const ICON_TRASH = SVG(
  `<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>`,
);

async function fetchMeta(rawUrl: string): Promise<{
  title: string | null;
  image: string | null;
  description: string | null;
}> {
  const meta = { title: null, image: null, description: null } as {
    title: string | null;
    image: string | null;
    description: string | null;
  };
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    const res = await fetch(rawUrl, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return meta;
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      const t = titleMatch[1].trim().replace(/\s+/g, " ");
      if (t) meta.title = t;
    }
    meta.image = pickMeta(html, ["og:image", "og:image:url", "twitter:image"]);
    meta.description = pickMeta(html, [
      "og:description",
      "twitter:description",
      "description",
    ]);
  } catch {
    /* best effort */
  }
  return meta;
}

function pickMeta(html: string, props: string[]): string | null {
  for (const p of props) {
    const m =
      html.match(
        new RegExp(
          `<meta[^>]+(?:property|name)="${p}"[^>]+content="([^"]*)"`,
          "i",
        ),
      ) ??
      html.match(
        new RegExp(
          `<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${p}"`,
          "i",
        ),
      );
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function resolveImage(src: string, base: URL): string | null {
  try {
    const u = new URL(src, base);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch {
    /* ignore */
  }
  return null;
}

type Link = {
  id: number;
  url: string;
  title: string | null;
  description: string | null;
  color: number | null;
  image: string | null;
  cats: { id: number; name: string }[];
};

function getLinkRows(
  opts: { search?: string; category?: string; sort?: string },
): Link[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.search) {
    const s = `%${opts.search}%`;
    where.push("(l.url LIKE ? OR l.title LIKE ? OR l.description LIKE ?)");
    params.push(s, s, s);
  }
  if (opts.category && opts.category !== "all") {
    where.push(
      "l.id IN (SELECT link_id FROM link_categories WHERE category_id = ?)",
    );
    params.push(Number(opts.category));
  }
  const sql =
    `SELECT id, url, title, description, color, image FROM links l` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    (opts.sort === "random" ? " ORDER BY random()" : " ORDER BY created_at DESC");

  const links = db.prepare(sql).all(...params) as Omit<Link, "cats">[];
  for (const l of links) {
    const cats = db
      .prepare(
        `SELECT c.id, c.name FROM categories c
         JOIN link_categories lc ON lc.category_id = c.id
         WHERE lc.link_id = ? ORDER BY c.name`,
      )
      .all(l.id) as { id: number; name: string }[];
    (l as Link).cats = cats;
  }
  return links as Link[];
}

function renderCard(l: Link): string {
  const title = l.title || l.url;
  const desc = l.description
    ? `<p class="desc">${esc(l.description)}</p>`
    : "";
  const chips = l.cats.length
    ? `<div class="chips">${l.cats
        .map(
          (c) =>
            `<span class="chip">${ICON_TAG}${esc(c.name)}</span>`,
        )
        .join("")}</div>`
    : "";
  const hue = l.color != null && !Number.isNaN(Number(l.color))
    ? Number(l.color)
    : Math.floor(Math.random() * 360);
  const pastel = `hsl(${hue} 72% 86%)`;
  const pastelBorder = `hsl(${hue} 55% 70%)`;
  const cover = l.image
    ? `<img class="card-cover" src="${esc(l.image)}" alt="" loading="lazy" onerror="this.remove()">`
    : "";
  return `<article class="card pastel" style="background:${pastel};border-color:${pastelBorder};color:#1b1e25">
    <a class="card-open" href="${esc(l.url)}" target="_blank" rel="noopener" aria-label="${esc(
      title,
    )}"></a>
    ${cover}
    <div class="card-head">
      <span class="card-ic">${ICON_LINK}</span>
      <h3>${esc(title)}</h3>
      <button
        type="button"
        class="del"
        title="Delete"
        @click.prevent="openDelete(${l.id})"
      >${ICON_TRASH}</button>
    </div>
    ${desc}
    ${chips}
  </article>`;
}

function renderGrid(links: Link[], sort?: string): string {
  if (!links.length) {
    return `<p class="empty">No links yet. Add your first one!</p>`;
  }
  if (sort !== "category") {
    return `<div class="grid">${links.map(renderCard).join("")}</div>`;
  }
  const groups = new Map<string, Link[]>();
  const push = (name: string, l: Link) => {
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(l);
  };
  for (const l of links) {
    if (!l.cats.length) push("Uncategorized", l);
    else for (const c of l.cats) push(c.name, l);
  }
  const names = [...groups.keys()].sort((a, b) =>
    a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b),
  );
  return names
    .map(
      (n) =>
        `<section class="group"><h2>${esc(n)}</h2><div class="grid">${
          groups.get(n)!.map(renderCard).join("")
        }</div></section>`,
    )
    .join("");
}

function renderCheckboxes(): string {
  const cats = db
    .prepare("SELECT id, name FROM categories ORDER BY name")
    .all() as { id: number; name: string }[];
  if (!cats.length) {
    return `<p class="hint">No categories yet. Add one below.</p>`;
  }
  return cats
    .map(
      (c) =>
        `<label class="cat-opt"><input type="checkbox" name="categories" value="${c.id}" class="visually-hidden">${ICON_TAG}<span>${esc(
          c.name,
        )}</span></label>`,
    )
    .join("");
}

function renderOptions(): string {
  const cats = db
    .prepare("SELECT id, name FROM categories ORDER BY name")
    .all() as { id: number; name: string }[];
  const opts = cats
    .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
    .join("");
  return `<option value="all">All categories</option>${opts}`;
}

const router = new Router();

router.get("/api/links", (ctx) => {
  const q = ctx.request.url.searchParams;
  const links = getLinkRows({
    search: q.get("search") || undefined,
    category: q.get("category") || "all",
    sort: q.get("sort") || "random",
  });
  ctx.response.type = "text/html; charset=utf-8";
  ctx.response.body = renderGrid(links, q.get("sort") || "random");
});

router.delete("/api/links/:id", (ctx) => {
  const id = Number(ctx.params.id);
  if (Number.isInteger(id)) {
    db.prepare("DELETE FROM links WHERE id = ?").run(id);
  }
  ctx.response.headers.set("HX-Trigger", "refresh-grid");
  ctx.response.type = "text/html; charset=utf-8";
  ctx.response.body = "";
});

router.post("/api/links", async (ctx) => {
  const form = await ctx.request.body.formData();
  const raw = String(form.get("url") || "").trim();
  const description = String(form.get("description") || "").trim() || null;
  const cats = form
    .getAll("categories")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    ctx.response.status = 400;
    ctx.response.body = "Invalid URL";
    return;
  }
  const meta = await fetchMeta(u.toString());
  const title = meta.title ?? u.hostname;
  const desc = description ?? (meta.description || null);
  const colorRaw = Number(form.get("color"));
  const color = Number.isInteger(colorRaw) && colorRaw >= 0 && colorRaw <= 359
    ? colorRaw
    : null;
  const image = meta.image ? resolveImage(meta.image, u) : null;
  const info = db
    .prepare(
      "INSERT INTO links(url, title, description, color, image) VALUES(?, ?, ?, ?, ?)",
    )
    .run(u.toString(), title, desc, color, image);
  const linkId = Number(info.lastInsertRowid);
  for (const cid of cats) {
    db.prepare(
      "INSERT OR IGNORE INTO link_categories(link_id, category_id) VALUES(?, ?)",
    ).run(linkId, cid);
  }
  ctx.response.headers.set("HX-Trigger", "refresh-categories, refresh-grid");
  ctx.response.type = "text/html; charset=utf-8";
  ctx.response.body = "";
});

router.get("/api/categories/checkboxes", (ctx) => {
  ctx.response.type = "text/html; charset=utf-8";
  ctx.response.body = renderCheckboxes();
});

router.get("/api/categories/options", (ctx) => {
  ctx.response.type = "text/html; charset=utf-8";
  ctx.response.body = renderOptions();
});

router.post("/api/categories", async (ctx) => {
  const form = await ctx.request.body.formData();
  const name = String(form.get("name") || "").trim();
  if (name) {
    db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(name);
  }
  ctx.response.headers.set("HX-Trigger", "refresh-categories");
  ctx.response.type = "text/html; charset=utf-8";
  ctx.response.body = "";
});

router.get("/(.*)", (ctx) => {
  const reqPath = ctx.params[0] || "index.html";
  if (reqPath.includes("..")) {
    ctx.response.status = 403;
    return;
  }
  const full = `${PUBLIC}/${reqPath}`;
  try {
    const data = Deno.readFileSync(full);
    const dot = full.lastIndexOf(".");
    const ext = dot >= 0 ? full.slice(dot) : "";
    ctx.response.type = TYPES[ext] || "application/octet-stream";
    ctx.response.body = data;
  } catch {
    ctx.response.status = 404;
  }
});

function seedIfEmpty() {
  const dev =
    Deno.args.includes("--dev") || Deno.env.get("DENO_ENV") === "development";
  if (!dev) return;
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM links").get() as {
    n: number;
  };
  if (n > 0) return;

  const categories = [
    "News",
    "Dev",
    "Design",
    "Music",
    "Tech",
    "Reading",
    "Recipes",
  ];
  const catIds: number[] = [];
  for (const name of categories) {
    const info = db.prepare("INSERT INTO categories(name) VALUES(?)").run(name);
    catIds.push(Number(info.lastInsertRowid));
  }

  const words = [
    "Deno",
    "Rust",
    "Coffee",
    "Mountains",
    "Ocean",
    "Pixel",
    "Loom",
    "Quartz",
    "Maple",
    "Nova",
    "Echo",
    "Drift",
    "Cinder",
    "Violet",
  ];
  const hosts = [
    "example.com",
    "deno.com",
    "github.com",
    "news.ycombinator.com",
    "wikipedia.org",
    "arxiv.org",
  ];
  const total = 100 + Math.floor(Math.random() * 101);
  for (let i = 0; i < total; i++) {
    const title =
      words[Math.floor(Math.random() * words.length)] + " " +
      words[Math.floor(Math.random() * words.length)];
    const url =
      `https://${hosts[Math.floor(Math.random() * hosts.length)]}/` +
      Math.floor(Math.random() * 9999);
    const color = Math.floor(Math.random() * 360);
    const description = Math.random() > 0.5 ? `A note about ${title}` : null;
    const image = `https://picsum.photos/seed/${i}/400/260`;
    const info = db
      .prepare(
        "INSERT INTO links(url, title, description, color, image) VALUES(?, ?, ?, ?, ?)",
      )
      .run(url, title, description, color, image);
    const linkId = Number(info.lastInsertRowid);
    const picks = 1 + Math.floor(Math.random() * 2);
    const chosen = [...catIds].sort(() => Math.random() - 0.5).slice(0, picks);
    for (const cid of chosen) {
      db.prepare(
        "INSERT OR IGNORE INTO link_categories(link_id, category_id) VALUES(?, ?)",
      ).run(linkId, cid);
    }
  }
  console.log(
    `Seeded ${total} sample links and ${categories.length} categories.`,
  );
}

seedIfEmpty();

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

const port = Number(Deno.env.get("PORT")) || 8000;
console.log(`zeldas running on http://localhost:${port}`);
await app.listen({ port });
