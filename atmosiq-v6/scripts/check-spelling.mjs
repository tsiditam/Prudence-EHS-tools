/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * check-spelling — American English throughout, enforced at lint time.
 *
 * A client report read "Odour: moderate persistent — musty / earthy" three
 * lines above "odors migrating from adjacent space" (2026-09). The spelling
 * had drifted file by file for months, and nothing noticed because nothing
 * looked. One pass brought 173 files onto American English; this check is
 * what keeps them there, because a convention that lives only in a
 * document is re-broken by the next contributor who did not read it.
 *
 * Whole-word, exact-form matching against a fixed list — never stem
 * matching — so `characteristic`, `synthesis`, `emphasis`, `promise` and
 * `enterprise` are not candidates. Case is honored on the first letter and
 * for ALL-CAPS.
 *
 * Two escape hatches, both deliberate and both visible:
 *   • a line carrying the marker `spelling-ok` is skipped — for a term list
 *     that must match both spellings of user input, an alias list that
 *     quotes a source verbatim, or a negative test case;
 *   • this file and its own test are skipped by path, since they carry the
 *     list itself.
 *
 * Words that are accepted American variants are NOT on the list
 * (`cancelled`, `judgement`, `acknowledgement`, `towards`), so contract
 * values and stored field names keep their spelling.
 *
 * Usage:
 *   node scripts/check-spelling.mjs            # exits 1 with a report on any hit
 *   npm run lint:spelling                      # wired in package.json
 *
 * The pure function `findBritishSpellings(rootDir)` is exported so the
 * regression test can exercise it against a fixture tree.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** British form → American form. Exact forms only; add both halves of a pair. */
export const BRITISH_TO_AMERICAN = Object.freeze({
  // -our → -or
  colour: 'color', colours: 'colors', coloured: 'colored', colouring: 'coloring', colourful: 'colorful',
  odour: 'odor', odours: 'odors',
  behaviour: 'behavior', behaviours: 'behaviors', behavioural: 'behavioral',
  honour: 'honor', honours: 'honors', honoured: 'honored', honouring: 'honoring',
  neighbour: 'neighbor', neighbours: 'neighbors', neighbouring: 'neighboring', neighbourhood: 'neighborhood',
  favour: 'favor', favours: 'favors', favoured: 'favored', favourable: 'favorable', favourite: 'favorite',
  vapour: 'vapor', vapours: 'vapors', rigour: 'rigor', humour: 'humor',
  // -re → -er
  centre: 'center', centres: 'centers', centred: 'centered', centring: 'centering',
  fibre: 'fiber', fibres: 'fibers', metre: 'meter', metres: 'meters', litre: 'liter', litres: 'liters',
  // doubled consonant
  labelled: 'labeled', labelling: 'labeling', travelled: 'traveled', travelling: 'traveling', traveller: 'traveler',
  modelled: 'modeled', modelling: 'modeling', signalled: 'signaled', signalling: 'signaling',
  totalled: 'totaled', totalling: 'totaling', dialled: 'dialed', levelled: 'leveled', levelling: 'leveling',
  channelled: 'channeled', fuelled: 'fueled',
  // -ise → -ize
  recognise: 'recognize', recognised: 'recognized', recognises: 'recognizes', recognising: 'recognizing',
  recognisable: 'recognizable', unrecognised: 'unrecognized', unrecognisable: 'unrecognizable',
  summarise: 'summarize', summarised: 'summarized', summarises: 'summarizes', summarising: 'summarizing', summariser: 'summarizer',
  normalise: 'normalize', normalised: 'normalized', normalises: 'normalizes', normalising: 'normalizing', normalisation: 'normalization',
  denormalise: 'denormalize', denormalised: 'denormalized',
  initialise: 'initialize', initialised: 'initialized', initialises: 'initializes', initialising: 'initializing',
  initialiser: 'initializer', initialisation: 'initialization',
  utilise: 'utilize', utilised: 'utilized', utilisation: 'utilization',
  characterise: 'characterize', characterised: 'characterized', characterises: 'characterizes',
  characterising: 'characterizing', characterisation: 'characterization',
  minimise: 'minimize', minimised: 'minimized', minimising: 'minimizing', minimisation: 'minimization',
  maximise: 'maximize', maximised: 'maximized',
  optimise: 'optimize', optimised: 'optimized', optimises: 'optimizes', optimising: 'optimizing', optimisation: 'optimization',
  prioritise: 'prioritize', prioritised: 'prioritized', prioritisation: 'prioritization',
  organise: 'organize', organised: 'organized', organising: 'organizing', organisation: 'organization', organisations: 'organizations',
  standardise: 'standardize', standardised: 'standardized', standardisation: 'standardization',
  visualise: 'visualize', visualised: 'visualized', visualisation: 'visualization',
  customise: 'customize', customised: 'customized', customisable: 'customizable',
  categorise: 'categorize', categorised: 'categorized', categorisation: 'categorization',
  emphasise: 'emphasize', emphasised: 'emphasized', realise: 'realize', realised: 'realized',
  finalise: 'finalize', finalised: 'finalized', finalising: 'finalizing',
  synthesise: 'synthesize', synthesised: 'synthesized', neutralise: 'neutralize', neutralised: 'neutralized',
  materialise: 'materialize', materialised: 'materialized', materialises: 'materializes',
  centralise: 'centralize', centralised: 'centralized',
  authorise: 'authorize', authorised: 'authorized', authorises: 'authorizes', authorisation: 'authorization',
  sanitise: 'sanitize', sanitised: 'sanitized', sanitisation: 'sanitization',
  serialise: 'serialize', serialised: 'serialized', serialisation: 'serialization',
  deserialise: 'deserialize', deserialised: 'deserialized',
  canonicalise: 'canonicalize', canonicalised: 'canonicalized',
  rasterise: 'rasterize', rasterised: 'rasterized', rasteriser: 'rasterizer',
  memoise: 'memoize', memoised: 'memoized', itemise: 'itemize', itemised: 'itemized',
  analyse: 'analyze', analysed: 'analyzed', analysing: 'analyzing',
  // one-offs
  grey: 'gray', greys: 'grays', greyed: 'grayed', catalogue: 'catalog', catalogues: 'catalogs', catalogued: 'cataloged',
  licence: 'license', licences: 'licenses', defence: 'defense', offence: 'offense',
  storey: 'story', storeys: 'stories', mould: 'mold', mouldy: 'moldy', moulds: 'molds',
  sulphur: 'sulfur', aluminium: 'aluminum', artefact: 'artifact', artefacts: 'artifacts',
  programme: 'program', programmes: 'programs', whilst: 'while', amongst: 'among',
  skilful: 'skillful', fulfil: 'fulfill', enrol: 'enroll', instil: 'instill',
  practise: 'practice', practised: 'practiced', practising: 'practicing',
  ageing: 'aging', draught: 'draft', draughts: 'drafts',
})

/** A line carrying this marker is deliberately exempt. */
export const ALLOW_MARKER = 'spelling-ok'

const SCAN_DIRS = ['src', 'api', 'lib', 'components', 'pages', 'scripts', 'tests', 'docs', 'server']
const ROOT_FILES = ['CLAUDE.md', 'CHANGELOG.md', 'ARCHITECTURE.md', 'README.md']
// `server/handlers/` is bundle:api output (gitignored) — it inherits whatever
// api/ says, which is scanned at the source.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.vercel', '.git', 'handlers'])
const EXT_RE = /\.(m?js|cjs|jsx|tsx?|md|json)$/
// The list itself, and the fixtures that exercise it.
const SELF = new Set(['scripts/check-spelling.mjs', 'tests/scripts/check-spelling.test.ts'])

const WORD_RE = new RegExp(`\\b(${Object.keys(BRITISH_TO_AMERICAN).join('|')})\\b`, 'gi')

async function walk(dir, out) {
  let entries
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else if (EXT_RE.test(e.name)) out.push(p)
  }
}

/** Every file the check reads, relative to `rootDir`. */
export async function listScannedFiles(rootDir) {
  const files = []
  for (const d of SCAN_DIRS) await walk(path.join(rootDir, d), files)
  for (const f of ROOT_FILES) {
    try { await fs.access(path.join(rootDir, f)); files.push(path.join(rootDir, f)) } catch { /* absent */ }
  }
  return files.map((f) => path.relative(rootDir, f)).filter((rel) => !SELF.has(rel.split(path.sep).join('/'))).sort()
}

/**
 * @returns {Promise<Array<{file:string, line:number, word:string, replacement:string, text:string}>>}
 *   every British spelling found, with the American form to use
 */
export async function findBritishSpellings(rootDir) {
  const hits = []
  for (const rel of await listScannedFiles(rootDir)) {
    const text = await fs.readFile(path.join(rootDir, rel), 'utf8')
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.includes(ALLOW_MARKER)) continue
      WORD_RE.lastIndex = 0
      let m
      while ((m = WORD_RE.exec(line)) !== null) {
        const word = m[1]
        const american = BRITISH_TO_AMERICAN[word.toLowerCase()]
        const replacement = word === word.toUpperCase() && word.length > 1
          ? american.toUpperCase()
          : word[0] === word[0].toUpperCase() ? american[0].toUpperCase() + american.slice(1) : american
        hits.push({ file: rel.split(path.sep).join('/'), line: i + 1, word, replacement, text: line.trim() })
      }
    }
  }
  return hits
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isMain) {
  const root = process.cwd()
  findBritishSpellings(root).then((hits) => {
    if (!hits.length) {
      console.log('check-spelling: clean (American English throughout)')
      process.exit(0)
    }
    console.error(`check-spelling: ${hits.length} British spelling${hits.length === 1 ? '' : 's'} found. Use the American form, or mark a deliberate line with \`${ALLOW_MARKER}\`.\n`)
    for (const h of hits) console.error(`  ${h.file}:${h.line}: "${h.word}" → "${h.replacement}"`)
    process.exit(1)
  }).catch((err) => {
    console.error('check-spelling: failed —', err && err.message)
    process.exit(1)
  })
}
