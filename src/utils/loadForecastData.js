import modelData from '../data/model_data.json'

export function loadModelData() {
  const { metadata, companies, ticker_index } = modelData

  const companiesByCode = {}
  const companiesByTicker = {}

  for (const [code, entry] of Object.entries(companies)) {
    companiesByCode[code] = entry
    if (entry.ticker) {
      companiesByTicker[entry.ticker] = { ...entry, company_code: code }
    }
  }

  return { metadata, companiesByCode, companiesByTicker, ticker_index }
}

export function getCompanyData(modelDataResult, companyCodeOrTicker) {
  if (!modelDataResult || !companyCodeOrTicker) return null
  return (
    modelDataResult.companiesByCode[companyCodeOrTicker] ||
    modelDataResult.companiesByTicker[companyCodeOrTicker] ||
    null
  )
}

export function getToggleProbability(companyData, toggleKey) {
  if (!companyData?.toggle_states) return null
  return companyData.toggle_states[toggleKey] ?? null
}

export function getIndicatorOrder(modelDataResult) {
  return modelDataResult?.metadata?.indicator_order_for_toggle_key || [
    'z_score', 'quick_ratio', 'ebit_ta', 'debt_ebitda', 'tl_ta', 'fss_score'
  ]
}

export function buildToggleKey(enabledIndicators, indicatorOrder) {
  return indicatorOrder.map(ind => enabledIndicators.includes(ind) ? '1' : '0').join('')
}
