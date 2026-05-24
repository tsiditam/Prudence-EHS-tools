/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Single-choice ("ch") question helper.
 */

// "Other" is the selected / free-text-expanded option when the stored
// value is a custom entry — i.e. NOT one of the predefined non-"Other"
// options. The earlier check used opts.slice(0,-1), which assumed
// "Other" was the last option; when it wasn't (e.g. PID lamp energy ends
// with "No PID used"), selecting the genuine last option also lit up
// "Other". Comparing against every non-"Other" option fixes that.
export const isOtherChoice = (opts, value) =>
  !!value && !(opts || []).some((o) => o !== 'Other' && o === value)
