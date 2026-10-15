import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

import { Database } from "../storage.js";
import {
  readFetchCursor,
  readWatermark,
  writeFetchCursor,
  writeWatermark,
} from "../sync/watermarks.js";
import { SQLiteTestStorage } from "../testing.js";
import { initializeSchema, ROOT_INODE, SCHEMA_VERSION } from "./index.js";

it("creates the current VFS schema and reopens it without changing mount modes", () => {
  const root = mkdtempSync(join(tmpdir(), "dofs-current-schema-"));
  const filename = join(root, "workspace.sqlite");
  try {
    const firstStorage = new SQLiteTestStorage(filename);
    try {
      const first = new Database(firstStorage);
      initializeSchema(first, () => 100);
      expect(
        first.one<{ v: number }>(
          "SELECT v FROM vfs_meta WHERE k='schema_version'",
        )?.v,
      ).toBe(SCHEMA_VERSION);
      expect(
        first.one<{ size: number }>(
          "SELECT size FROM vfs_nodes WHERE inode=?",
          ROOT_INODE,
        )?.size,
      ).toBe(0);
      expect(
        first.one<{ wr: number }>(
          "SELECT wr FROM pragma_table_list WHERE name='vfs_dirents'",
        )?.wr,
      ).toBe(1);
      first.run(
        "INSERT INTO _vfs_mounts(root,kind,indexed,mode) VALUES(?,?,?,?)",
        "/read-only",
        "local",
        1,
        "read-only",
      );
      first.run(
        "INSERT INTO _vfs_mounts(root,kind,indexed,mode) VALUES(?,?,?,?)",
        "/read-write",
        "local",
        1,
        "read-write",
      );
      writeWatermark(first, "pushRev", 7, "team-a");
      writeFetchCursor(first, { rev: 4, path: "/notes.txt" }, "team-a");
    } finally {
      firstStorage.close();
    }

    const reopenedStorage = new SQLiteTestStorage(filename);
    try {
      const reopened = new Database(reopenedStorage);
      initializeSchema(reopened, () => 200);
      expect(
        reopened
          .all<{ root: string; mode: string }>(
            "SELECT root,mode FROM _vfs_mounts ORDER BY root",
          )
          .map(({ root: mount, mode }) => [mount, mode]),
      ).toEqual([
        ["/read-only", "read-only"],
        ["/read-write", "read-write"],
      ]);
      expect(
        reopened.one<{ total: number }>(
          "SELECT COUNT(*) AS total FROM vfs_nodes WHERE inode=?",
          ROOT_INODE,
        )?.total,
      ).toBe(1);
      expect(readWatermark(reopened, "pushRev", "team-a")).toBe(7);
      expect(readFetchCursor(reopened, "team-a")).toEqual({
        rev: 4,
        path: "/notes.txt",
      });
    } finally {
      reopenedStorage.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.each([1, 2, 3, 4, 6])(
  "refuses incompatible nonzero schema version %i without creating VFS tables",
  (version) => {
    const storage = new SQLiteTestStorage();
    try {
      const db = new Database(storage);
      db.run("CREATE TABLE vfs_meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)");
      db.run(
        "INSERT INTO vfs_meta (k,v) VALUES ('schema_version',?)",
        version,
      );

      expect(() => initializeSchema(db, () => 100)).toThrowError(
        expect.objectContaining({
          code: "EIO",
          message: `Unsupported workspace filesystem schema version ${String(version)}`,
        }),
      );
      expect(
        db.one<{ total: number }>(
          "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name='vfs_nodes'",
        )?.total,
      ).toBe(0);
      expect(
        db.one<{ v: number }>(
          "SELECT v FROM vfs_meta WHERE k='schema_version'",
        )?.v,
      ).toBe(version);
    } finally {
      storage.close();
    }
  },
);
