import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import type { Metadata } from "next";
import { C, MONO } from "@/lib/ui";

// PUBLIC page (whitelisted in middleware) — renders the committed theme-editing
// primer so teammates (and their Claude) can read it without any login. The .md
// is a trusted, committed file, so rendering it directly is safe.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Editing your Moment Skis theme — guide",
  description: "How to edit your Shopify theme safely and publish through the console.",
};

export default async function ThemeEditingGuide() {
  let md = "";
  try {
    md = fs.readFileSync(path.join(process.cwd(), "MOMENT-SKIS-THEME-EDITING.md"), "utf8");
  } catch {
    md = "# Guide unavailable\n\nThe primer file could not be loaded.";
  }
  marked.setOptions({ gfm: true, breaks: false });
  const html = await marked.parse(md);

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        color: C.ink,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 80px" }}>
        <div
          className="md"
          style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 16, padding: "32px 34px" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <div style={{ textAlign: "center", color: C.faint, fontSize: 12.5, marginTop: 22 }}>
          Publish console: <a href="/" style={{ color: C.accent }}>moment-skis.valier.dev</a>
        </div>
      </div>
      <style>{`
        .md { line-height: 1.65; font-size: 15.5px; }
        .md h1 { font-size: 27px; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.01em; }
        .md h2 { font-size: 19px; font-weight: 650; margin: 30px 0 10px; padding-top: 18px; border-top: 1px solid ${C.line}; }
        .md h2:first-of-type { border-top: none; padding-top: 0; }
        .md h3 { font-size: 16px; font-weight: 650; margin: 20px 0 8px; }
        .md p { margin: 10px 0; color: ${C.ink}; }
        .md ul, .md ol { margin: 10px 0; padding-left: 22px; }
        .md li { margin: 6px 0; }
        .md li::marker { color: ${C.faint}; }
        .md strong { font-weight: 650; }
        .md hr { border: none; border-top: 1px solid ${C.line}; margin: 26px 0; }
        .md a { color: ${C.accent}; }
        .md code { font-family: ${MONO}; font-size: 0.88em; background: ${C.codeBg}; border: 1px solid ${C.line}; border-radius: 5px; padding: 1px 5px; }
        .md blockquote { margin: 12px 0; padding: 10px 16px; border-left: 3px solid ${C.accent}; background: ${C.accentTint}; border-radius: 0 8px 8px 0; color: ${C.ink}; }
        .md blockquote p { margin: 4px 0; }
        .md input[type="checkbox"] { margin-right: 8px; }
        .md li:has(input[type="checkbox"]) { list-style: none; margin-left: -18px; }
      `}</style>
    </div>
  );
}
