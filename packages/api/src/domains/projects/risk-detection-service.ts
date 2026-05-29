/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { IntentCard, RiskDetectionResult } from '@openjiuwen/relay-shared';

const HOLLOW_VERBS = /\b(improve|optimize|enhance|support|manage|ensure|streamline|facilitate|leverage|utilize)\b/i;
const SYSTEM_ACTORS = /^(the system|system|n\/a|none|tbd|)$/i;
const DATA_WORDS = /\b(database|data|query|fetch|api|records?|storage|table)\b/i;
const EDGE_WORDS =
  /\b(error|empty|permission|denied|fail|timeout|invalid|overflow|limit|boundary|edge case|concurrent)\b/i;
const SCOPE_WORDS = /\b(enterprise|all modules|everything|full.?suite|end.?to.?end|comprehensive)\b/i;

export function detectRisks(card: IntentCard): RiskDetectionResult[] {
  const results: RiskDetectionResult[] = [];

  // 1. hollow_verbs
  if (HOLLOW_VERBS.test(card.goal)) {
    results.push({
      signal: 'hollow_verbs',
      severity: 'high',
      evidence: `Goal contains vague verb: "${card.goal.match(HOLLOW_VERBS)?.[0]}"`,
      autoDetected: true,
    });
  }

  // 2. missing_actors
  if (SYSTEM_ACTORS.test(card.actor.trim())) {
    results.push({
      signal: 'missing_actors',
      severity: 'critical',
      evidence: `Actor is "${card.actor}" — no real human actor specified`,
      autoDetected: true,
    });
  }

  // 3. unknown_data_source
  if (!card.sourceDetail.trim() && DATA_WORDS.test(`${card.goal} ${card.objectState}`)) {
    results.push({
      signal: 'unknown_data_source',
      severity: 'high',
      evidence: 'References data but sourceDetail is empty',
      autoDetected: true,
    });
  }

  // 4. missing_success_signal
  if (!card.successSignal.trim()) {
    results.push({
      signal: 'missing_success_signal',
      severity: 'critical',
      evidence: 'successSignal is empty — no observable verification criteria',
      autoDetected: true,
    });
  }

  // 5. missing_edge_cases
  const allText = [card.goal, card.objectState, card.nonGoal, card.successSignal].join(' ');
  if (!EDGE_WORDS.test(allText) && !card.nonGoal.trim()) {
    results.push({
      signal: 'missing_edge_cases',
      severity: 'medium',
      evidence: 'No mention of error handling, boundaries, or edge cases; nonGoal is empty',
      autoDetected: true,
    });
  }

  // 6. hidden_dependencies
  if (card.dependencyTags.length >= 4) {
    results.push({
      signal: 'hidden_dependencies',
      severity: 'high',
      evidence: `${card.dependencyTags.length} dependency tags — high coupling risk`,
      autoDetected: true,
    });
  }

  // 7. ai_fake_specificity
  if (card.sourceTag === 'A' && !card.objectState.trim()) {
    results.push({
      signal: 'ai_fake_specificity',
      severity: 'critical',
      evidence: 'AI-inferred card with empty objectState — looks specific but lacks grounding',
      autoDetected: true,
    });
  }

  // 8. scope_creep
  if (SCOPE_WORDS.test(card.goal)) {
    results.push({
      signal: 'scope_creep',
      severity: 'high',
      evidence: `Goal contains expansive language: "${card.goal.match(SCOPE_WORDS)?.[0]}"`,
      autoDetected: true,
    });
  }

  return results;
}
