import { eq } from "drizzle-orm";
import mammoth from "mammoth";
import type { Database } from "../client";
import { schema } from "../index";
import { parseDocumentStatus, slugify } from "./helpers";

interface Chapter {
  slug: string;
  title: string;
  sortOrder: number;
  status: "defined" | "partial" | "pending";
  bodyMarkdown: string;
}

/**
 * Convert a .docx to a compact markdown string. mammoth ships an unofficial
 * `convertToMarkdown` but it isn't in the .d.ts and can drop; we go through
 * HTML and do a targeted regex pass instead — the Bible uses only headings,
 * paragraphs, bold, italics and bullet lists.
 */
async function docxToMarkdown(path: string): Promise<string> {
  const { value: html } = await mammoth.convertToHtml({ path });
  return html
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, (_, s) => `\n\n# ${stripTags(s)}\n\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (_, s) => `\n\n## ${stripTags(s)}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, (_, s) => `\n\n### ${stripTags(s)}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_, s) => `- ${stripTags(s).trim()}\n`)
    .replace(/<\/?(ul|ol)[^>]*>/g, "\n")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (_, s) => `\n${stripTags(s).trim()}\n`)
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/g, (_, s) => `**${s}**`)
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/g, (_, s) => `*${s}*`)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function splitBible(md: string): Chapter[] {
  const chapters: Chapter[] = [];
  const headings = [...md.matchAll(/^# +(.+)$/gm)];

  const firstHeading = headings[0];
  if (firstHeading && firstHeading.index !== undefined && firstHeading.index > 0) {
    const preamble = md.slice(0, firstHeading.index).trim();
    if (preamble) {
      chapters.push({
        slug: "preamble",
        title: "Preamble",
        sortOrder: 0,
        status: "defined",
        bodyMarkdown: preamble,
      });
    }
  }

  for (let i = 0; i < headings.length; i++) {
    const m = headings[i]!;
    const title = (m[1] ?? "").trim();
    const start = (m.index ?? 0) + m[0].length;
    const next = headings[i + 1];
    const end = next?.index ?? md.length;
    const body = md.slice(start, end).trim();
    const statusMatch = body.match(/^(?:\*\*)?Status(?:\*\*)?:\s*(.+?)$/m);
    const status = statusMatch ? parseDocumentStatus(statusMatch[1] ?? "") : "pending";
    chapters.push({
      slug: slugify(title),
      title,
      sortOrder: chapters.length + 1,
      status,
      bodyMarkdown: body,
    });
  }
  return chapters;
}

async function upsertDocument(db: Database, doc: Chapter): Promise<void> {
  const existing = await db
    .select({ id: schema.designDocuments.id })
    .from(schema.designDocuments)
    .where(eq(schema.designDocuments.slug, doc.slug))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(schema.designDocuments)
      .set({
        title: doc.title,
        sortOrder: doc.sortOrder,
        status: doc.status,
        bodyMarkdown: doc.bodyMarkdown,
        updatedAt: new Date(),
      })
      .where(eq(schema.designDocuments.slug, doc.slug));
  } else {
    await db.insert(schema.designDocuments).values(doc);
  }
}

export async function seedBible(db: Database, path: string): Promise<void> {
  console.log(`reading ${path}...`);
  const md = await docxToMarkdown(path);
  const chapters = splitBible(md);
  for (const c of chapters) await upsertDocument(db, c);
  console.log(`  design_documents (bible): ${chapters.length}`);
}

export async function seedRoadmap(db: Database, path: string): Promise<void> {
  console.log(`reading ${path}...`);
  const md = await docxToMarkdown(path);
  await upsertDocument(db, {
    slug: "roadmap",
    title: "Roadmap",
    sortOrder: 999,
    status: "partial",
    bodyMarkdown: md,
  });
  console.log("  design_documents (roadmap): 1");
}

export async function noteDevLog(path: string): Promise<void> {
  console.log(`reading ${path}... (source of truth is the xlsx Changelog sheet)`);
}
