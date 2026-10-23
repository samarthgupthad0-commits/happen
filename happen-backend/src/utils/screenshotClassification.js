const basename = (value) => String(value || '').split(/[\\/]/).pop()

const workSignals = [
  { pattern: /^(code|code-insiders|devenv|idea64|pycharm64|webstorm64|rider64|excel|winword|powerpnt|outlook|teams|slack|figma|notion|postman|windowsterminal|powershell|gitkraken|sourcetree)(\.exe)?$/i, confidence: 0.93 },
  { pattern: /(visual studio code|visual studio|microsoft excel|microsoft word|microsoft outlook|microsoft teams|github|gitlab|jira|confluence|figma|notion|asana|trello|linear)/i, confidence: 0.82 },
]

const otherSignals = [
  { pattern: /^(steam|epicgameslauncher|robloxplayerbeta|spotify|netflix)(\.exe)?$/i, confidence: 0.93 },
  { pattern: /(youtube|netflix|twitch|tiktok|instagram|facebook|steam store|roblox)/i, confidence: 0.82 },
]

export function classifyScreenshot(filename, rawActivities = []) {
  const filenameBase = basename(filename)
  const activity = rawActivities.find((item) => basename(item?.screenshot) === filenameBase)
  const processName = String(activity?.process || '').trim()
  const windowTitle = String(activity?.window_title || '').trim()
  const processEvidence = processName ? `Active process: ${processName}` : null
  const titleEvidence = windowTitle ? 'Window title matched a known app-name rule.' : null

  for (const signal of workSignals) {
    if (signal.pattern.test(processName)) {
      return { filename: filenameBase, label: 'work_related', confidence: signal.confidence, evidence: [processEvidence].filter(Boolean), source: 'app_context_rules' }
    }
  }
  for (const signal of otherSignals) {
    if (signal.pattern.test(processName)) {
      return { filename: filenameBase, label: 'other', confidence: signal.confidence, evidence: [processEvidence].filter(Boolean), source: 'app_context_rules' }
    }
  }
  for (const signal of workSignals.slice(1)) {
    if (signal.pattern.test(windowTitle)) {
      return { filename: filenameBase, label: 'work_related', confidence: signal.confidence, evidence: [titleEvidence].filter(Boolean), source: 'app_context_rules' }
    }
  }
  for (const signal of otherSignals.slice(1)) {
    if (signal.pattern.test(windowTitle)) {
      return { filename: filenameBase, label: 'other', confidence: signal.confidence, evidence: [titleEvidence].filter(Boolean), source: 'app_context_rules' }
    }
  }

  return {
    filename: filenameBase,
    label: 'other',
    confidence: 0.5,
    evidence: ['No recognized app signal; manual review recommended.'],
    source: 'app_context_rules',
  }
}