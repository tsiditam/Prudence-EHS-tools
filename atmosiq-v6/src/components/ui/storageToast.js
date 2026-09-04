/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * storageToast — surface a failed local write.
 *
 * `STO.set` (src/utils/storage.js) returns `false` when localStorage
 * throws — in practice the origin quota (5–10 MB) on a photo-heavy device.
 * Every caller used to ignore that return value, so the autosave silently
 * stopped saving and the user found out when a draft came back empty
 * (audit 2026-09 §6: "storage.js:26 returns false on quota with no user
 * feedback").
 *
 *   reportStorageWrite(await STO.set(draftId, draft), 'draft')
 *
 * One toast per run of failures: the autosave fires every ~1.2 s while
 * typing, so the warning is shown once and re-armed by the next
 * successful write.
 */

import { toast } from 'sonner'

let warned = false

export function reportStorageWrite(ok, what = 'changes') {
  if (ok !== false) { warned = false; return true }
  if (!warned) {
    warned = true
    toast.error(
      `This device's storage is full — your ${what} could not be saved locally. ` +
      'Empty the Trash or remove old reports to free space; signed-in work still syncs to the cloud.',
      { id: 'af-storage-full', duration: 12000 },
    )
  }
  return false
}

/** Test hook. */
export function __resetStorageWarning() { warned = false }
