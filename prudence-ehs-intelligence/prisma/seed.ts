/**
 * Database Seed Script
 * Populates references, rule packs, rules, required elements, and reading level templates.
 *
 * Usage: npm run db:seed
 */

import { PrismaClient } from '@prisma/client';
import { oshaReferences } from '../src/data/references/osha-references';
import { ashraeReferences } from '../src/data/references/ashrae-references';
import { oshaRulePacks } from '../src/data/rules/osha-rules';
import { ashraeRulePacks } from '../src/data/rules/ashrae-rules';
import { READING_LEVELS } from '../src/data/reading-levels';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Prudence EHS Intelligence Engine...\n');

  // --- References ---
  console.log('Seeding references...');
  const allRefs = [...oshaReferences, ...ashraeReferences];
  for (const ref of allRefs) {
    await prisma.reference.upsert({
      where: { referenceId: ref.referenceId },
      update: {},
      create: {
        referenceId: ref.referenceId,
        authorityName: ref.authorityName,
        authorityType: ref.authorityType === 'regulatory'
          ? 'REGULATORY'
          : ref.authorityType === 'consensus_standard'
          ? 'CONSENSUS_STANDARD'
          : ref.authorityType === 'guidance'
          ? 'GUIDANCE'
          : 'INTERNAL_MEMO',
        domain: ref.domain,
        jurisdiction: ref.jurisdiction,
        citationText: ref.citationText,
        title: ref.title,
        sectionNumber: ref.sectionNumber,
        effectiveDate: new Date(ref.effectiveDate),
        status: ref.status === 'active' ? 'ACTIVE' : ref.status === 'superseded' ? 'SUPERSEDED' : 'DRAFT',
        officialSourceUrl: ref.officialSourceUrl,
        plainLanguageSummary: ref.plainLanguageSummary,
        applicabilityTags: ref.applicabilityTags,
        triggerTags: ref.triggerTags,
        requiredElements: ref.requiredElements,
        exceptions: ref.exceptions,
        crossReferences: ref.crossReferences,
        enforceabilityLevel: ref.enforceabilityLevel,
      },
    });
  }
  console.log(`  ${allRefs.length} references seeded.\n`);

  // --- Rule Packs + Rules + Required Elements ---
  console.log('Seeding rule packs...');
  const allPacks = [...oshaRulePacks, ...ashraeRulePacks];
  for (const pack of allPacks) {
    const dbPack = await prisma.rulePack.upsert({
      where: { packId: pack.packId },
      update: {},
      create: {
        packId: pack.packId,
        name: pack.name,
        topic: pack.topic,
        domain: pack.domain,
        version: pack.version,
        description: pack.description,
        isEnabled: true,
      },
    });

    for (const rule of pack.rules) {
      const dbRule = await prisma.rule.upsert({
        where: { ruleCode: rule.ruleCode },
        update: {},
        create: {
          ruleCode: rule.ruleCode,
          rulePackId: dbPack.id,
          topic: rule.topic,
          description: rule.description,
          triggerConditions: rule.triggerConditions,
          requiredEvidence: rule.requiredEvidence,
          comparisonLogic: {},
          findingTitle: rule.findingTitle,
          findingClassification:
            rule.findingClassification === 'regulatory_deficiency'
              ? 'REGULATORY_DEFICIENCY'
              : rule.findingClassification === 'technical_benchmark_gap'
              ? 'TECHNICAL_BENCHMARK_GAP'
              : rule.findingClassification === 'best_practice_improvement'
              ? 'BEST_PRACTICE_IMPROVEMENT'
              : rule.findingClassification === 'unable_to_determine'
              ? 'UNABLE_TO_DETERMINE'
              : 'EXPERT_REVIEW_REQUIRED',
          defaultSeverity:
            rule.defaultSeverity === 'critical'
              ? 'CRITICAL'
              : rule.defaultSeverity === 'high'
              ? 'HIGH'
              : rule.defaultSeverity === 'moderate'
              ? 'MODERATE'
              : rule.defaultSeverity === 'low'
              ? 'LOW'
              : 'INFORMATIONAL',
          citationBundle: rule.citationBundle,
          outputTemplate: rule.outputTemplate,
          escalationThreshold: rule.escalationThreshold,
          isEnabled: true,
        },
      });

      // Required Elements
      for (const elem of rule.requiredElements) {
        await prisma.requiredElement.create({
          data: {
            ruleId: dbRule.id,
            elementKey: elem.elementKey,
            label: elem.label,
            description: elem.description,
            isCritical: elem.isCritical,
            sourceReference: elem.sourceReference,
          },
        });
      }
    }
    console.log(`  ${pack.name}: ${pack.rules.length} rules seeded.`);
  }
  console.log();

  // --- Reading Level Templates ---
  console.log('Seeding reading level templates...');
  for (const level of READING_LEVELS) {
    await prisma.readingLevelTemplate.upsert({
      where: { levelKey: level.levelKey },
      update: {},
      create: {
        levelKey: level.levelKey,
        label: level.label,
        description: level.description,
        gradeLevel: level.gradeLevel,
        promptInstructions: level.promptInstructions,
      },
    });
  }
  console.log(`  ${READING_LEVELS.length} reading levels seeded.\n`);

  // --- Summary ---
  const refCount = await prisma.reference.count();
  const packCount = await prisma.rulePack.count();
  const ruleCount = await prisma.rule.count();
  const elemCount = await prisma.requiredElement.count();
  const levelCount = await prisma.readingLevelTemplate.count();

  console.log('Seed complete!');
  console.log(`  References:        ${refCount}`);
  console.log(`  Rule Packs:        ${packCount}`);
  console.log(`  Rules:             ${ruleCount}`);
  console.log(`  Required Elements: ${elemCount}`);
  console.log(`  Reading Levels:    ${levelCount}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
