// Dateien und Ordner, die man aus dem Explorer auf die Seite zieht. Das geht auch bei Ordnern, die der Browser beim
// "Ordner wählen" sperrt (zum Beispiel unter C:\Program Files), weil hier nur die gezogenen Inhalte gelesen werden.

type DirReader = { readEntries(ok: (entries: FsEntry[]) => void, err?: (e: unknown) => void): void };
export type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => DirReader;
};

export type Dropped = { label: string; read: () => Promise<File> };

const MAX_FILES = 400;
const MAX_ENTRIES = 5000;
const MAX_DEPTH = 3;
// In diese Ordner wird hineingesehen (so wie bei "Ordner wählen"). Alles andere im Spielordner bleibt unberührt.
const DIVE = /^(logbackups|live|ptu|eptu|hotfix|starcitizen)$/i;

const readAll = (reader: DirReader) =>
  new Promise<FsEntry[]>((resolve, reject) => {
    const all: FsEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length || all.length > MAX_ENTRIES) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });

export async function collectLogFiles(roots: FsEntry[]): Promise<Dropped[]> {
  const out: Dropped[] = [];
  let seen = 0;

  async function walk(entry: FsEntry, depth: number, label: string, top: boolean) {
    if (out.length >= MAX_FILES || seen++ > MAX_ENTRIES) return;
    if (entry.isFile) {
      if (/\.(log|txt)$/i.test(entry.name) && entry.file) {
        const fileFn = entry.file;
        out.push({ label: label + entry.name, read: () => new Promise<File>((ok, err) => fileFn.call(entry, ok, err)) });
      }
      return;
    }
    if (entry.isDirectory && entry.createReader && depth <= MAX_DEPTH && (top || DIVE.test(entry.name))) {
      let children: FsEntry[] = [];
      try {
        children = await readAll(entry.createReader());
      } catch {
        return;
      }
      for (const c of children) await walk(c, depth + 1, `${label}${entry.name}/`, false);
    }
  }

  for (const r of roots) await walk(r, 0, "", true);
  return out;
}
