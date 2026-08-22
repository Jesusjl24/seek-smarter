/** Minimal line diff (LCS) used for the before/after resume comparison. */

export type DiffOp = "unchanged" | "added" | "removed";

export interface DiffLine {
  op: DiffOp;
  text: string;
}

export function diffLines(before: string[], after: string[]): DiffLine[] {
  const n = before.length;
  const m = after.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        before[i] === after[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({ op: "unchanged", text: before[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ op: "removed", text: before[i] });
      i++;
    } else {
      out.push({ op: "added", text: after[j] });
      j++;
    }
  }
  while (i < n) out.push({ op: "removed", text: before[i++] });
  while (j < m) out.push({ op: "added", text: after[j++] });
  return out;
}

export function diffStats(diff: DiffLine[]): { added: number; removed: number; unchanged: number } {
  return diff.reduce(
    (acc, l) => {
      acc[l.op] += 1;
      return acc;
    },
    { added: 0, removed: 0, unchanged: 0 }
  );
}

export function diffText(before: string, after: string): DiffLine[] {
  return diffLines(before.split("\n"), after.split("\n"));
}
