import { useState } from "react";

/**
 * The `.webp` emblem of a class or element, addressed by code.
 *
 * It hides itself when the file is missing instead of leaving the browser's
 * broken-image glyph in the row. That is not defensive noise: emblems are
 * authored art, and a class or element can legitimately exist in the catalog
 * before anyone has drawn it — CLS-004 and CLS-005 lived that way until their
 * emblems arrived in 2026-08. The alternative was shipping placeholder art,
 * which is worse, because a placeholder that renders looks finished and never
 * gets replaced.
 *
 * The cost of the choice: it swallows a wholesale break as quietly as a single
 * gap. In 2026-08 a redesigned set landed as `.png` while this line still
 * asked for `.webp`, and every emblem 404'd with no symptom but an icon-less
 * bestiary. All ten codes have art today, so one blank icon means art nobody
 * has drawn yet — a blank *column* means the extension or the filenames drifted
 * from this line, not that the catalog grew.
 *
 * `alt` is empty by design: the code itself is rendered as text right next to
 * the icon, so announcing it twice is noise for a screen reader.
 */
export function CodeIcon({ code, className }: { code: string; className?: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return (
    <img
      src={`/${code}.webp`}
      alt=""
      className={className ?? "h-5 w-5 shrink-0"}
      onError={() => setMissing(true)}
    />
  );
}
