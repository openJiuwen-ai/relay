/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * One-shot mechanical rename in packages/web/src (identifiers only).
 * Run from repo root: node scripts/decat-web-identifiers.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('packages/web/src');

const REPLACEMENTS = [
  ['CatAvatarProps', 'AgentAvatarProps'],
  ['CatTokenUsageProps', 'AgentTokenUsageProps'],
  ['CatSelectorProps', 'AgentSelectorProps'],
  ['CatInvocationInfo', 'AgentInvocationInfo'],
  ['CatStatusType', 'AgentStatusType'],
  ['CatFamily', 'AgentFamily'],
  ['CatQuotaSnapshot', 'AgentQuotaSnapshot'],
  ['CatDailyUsage', 'AgentDailyUsage'],
  ['CatOption', 'AgentOption'],
  ['CatStrategyEntry', 'AgentStrategyEntry'],
  ['CatConfig', 'AgentDeskConfig'],
  ['callerCatId', 'callerAgentId'],
  ['senderCatId', 'senderAgentId'],
  ['resumeCatId', 'resumeAgentId'],
  ['catInvocations', 'agentInvocations'],
  ['catStatuses', 'agentStatuses'],
  ['setCatInvocation', 'setAgentInvocation'],
  ['updateThreadCatStatus', 'updateThreadAgentStatus'],
  ['replaceThreadTargetCats', 'replaceThreadTargetAgents'],
  ['setThreadTargetCats', 'setThreadTargetAgents'],
  ['setTargetCats', 'setTargetAgents'],
  ['targetCats', 'targetAgents'],
  ['preferredCats', 'preferredAgentIds'],
  ['leadCat', 'leadAgentId'],
  ['preferCats', 'preferAgentIds'],
  ['avoidCats', 'avoidAgentIds'],
  ['getCatById', 'getAgentById'],
  ['useCatData', 'useAgentData'],
  ['CatData', 'AgentData'],
  ['formatCatName', 'formatAgentName'],
  ['getCachedCats', 'getCachedAgents'],
  ['_resetCatDataCache', '_resetAgentDataCache'],
  ['CatAvatar', 'AgentAvatar'],
  ['CatTokenUsage', 'AgentTokenUsage'],
  ['ThreadCatStatus', 'ThreadAgentStatus'],
  ['ThreadCatSettings', 'ThreadAgentSettings'],
  ['CatSelector', 'AgentSelector'],
  ['HubCatEditor', 'HubAgentEditor'],
  ['hub-cat-editor', 'hub-agent-editor'],
  ['firstAvailableCatId', 'firstAvailableAgentId'],
  ['catOptions', 'agentOptions'],
  ['catFamilies', 'agentFamilies'],
  ['setCatFamilies', 'setAgentFamilies'],
  ['catIds', 'agentIds'],
  ['catLabel', 'agentLabel'],
  ['filterCatIds', 'filterAgentIds'],
  ['CAT_CONFIGS', 'OFFICE_CLAW_CONFIGS'],
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p, []));
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

let filesChanged = 0;
for (const file of walk(ROOT)) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  for (const [a, b] of REPLACEMENTS) {
    s = s.split(a).join(b);
  }
  // Word-ish: catId → agentId (avoid touching "application", "catch", etc.)
  s = s.replace(/\bcatId\b/g, 'agentId');
  if (s !== orig) {
    fs.writeFileSync(file, s, 'utf8');
    filesChanged += 1;
  }
}
console.log(`Updated ${filesChanged} files under packages/web/src`);
