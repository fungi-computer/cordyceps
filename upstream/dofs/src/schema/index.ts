import { createWorkspaceError } from "../errors.js";
import type { Database } from "../storage.js";
import {
  CORE_STATEMENTS,
  META_STATEMENT,
  ROOT_INODE,
  SCHEMA_VERSION,
} from "./core.js";
import { SYNC_STATEMENTS } from "./sync.js";

export { ROOT_INODE, SCHEMA_VERSION } from "./core.js";

interface MetaRow {
  v: number;
}

export function initializeSchema(db: Database, now: () => number): void {
  db.transactionSync(() => {
    // Check compatibility before creating the remaining current-schema
    // tables. Only the metadata table is needed to read the version.
    db.run(META_STATEMENT);
    const storedVersion = db.one<MetaRow>(
      "SELECT v FROM vfs_meta WHERE k = ?",
      "schema_version",
    )?.v;
    const onDiskVersion = storedVersion ?? 0;

    if (onDiskVersion !== 0 && onDiskVersion !== SCHEMA_VERSION) {
      throw createWorkspaceError(
        "EIO",
        `Unsupported workspace filesystem schema version ${onDiskVersion}`,
      );
    }

    // Fresh and current databases use the same complete baseline DDL.
    for (const statement of CORE_STATEMENTS.slice(1)) db.run(statement);
    for (const statement of SYNC_STATEMENTS) db.run(statement);

    // Stamp the current version and seed boot rows idempotently.
    db.run("INSERT OR IGNORE INTO vfs_meta (k, v) VALUES (?, ?)", "schema_version", SCHEMA_VERSION);
    db.run("UPDATE vfs_meta SET v = ? WHERE k = ?", SCHEMA_VERSION, "schema_version");
    db.run("INSERT OR IGNORE INTO vfs_meta (k, v) VALUES (?, ?)", "rev", 1);
    db.run(
      "INSERT OR IGNORE INTO _vfs_watermark (k, backend, v) VALUES (?, 'default', ?)",
      "pushRev",
      0,
    );
    db.run(
      "INSERT OR IGNORE INTO _vfs_watermark (k, backend, v) VALUES (?, 'default', ?)",
      "fetchRev",
      0,
    );
    db.run(
      "INSERT OR IGNORE INTO _vfs_fetch_cursor (k, backend, path) VALUES (?, 'default', ?)",
      "fetch",
      null,
    );

    db.run(
      `INSERT OR IGNORE INTO vfs_nodes
        (inode, type, mode, mtime, rev)
        VALUES (?, 'dir', ?, ?, 0)`,
      ROOT_INODE,
      0o755,
      now(),
    );
  });
}
