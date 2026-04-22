import { getTotal } from '../utils/scoringModel.js'

export default function WeightSliders({
  weightColumns,
  weights,
  defaultWeights,
  onWeightsChange,
  onScore,
  optionalColumns,
  availableOptionalColumns,
  onOptionalColumnsChange,
  onReset,
}) {
  const total = getTotal(weights)
  const isValid = total === 100

  function handleSliderChange(col, value) {
    onWeightsChange({ ...weights, [col]: Number(value) })
  }

  function handleAddOptional(e) {
    const col = e.target.value
    if (!col) return
    onOptionalColumnsChange([...optionalColumns, col])
  }

  function handleRemoveOptional(col) {
    onOptionalColumnsChange(optionalColumns.filter((c) => c !== col))
  }

  if (weightColumns.length === 0) return null

  const dropdownOptions = availableOptionalColumns.filter(
    (col) => !optionalColumns.includes(col)
  )

  return (
    <div className="sliders-panel">
      <div className="sliders-header">
        <h2>Score Weights</h2>
        <span className={`total-display ${isValid ? 'total--valid' : 'total--invalid'}`}>
          Total: {total} / 100 {isValid ? '✓' : ''}
        </span>
      </div>

      <div className="sliders-list">
        {weightColumns.map((col) => (
          <div key={col} className="slider-row">
            <label className="slider-label" title={col}>{col}</label>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={weights[col] ?? 0}
              onChange={(e) => handleSliderChange(col, e.target.value)}
              className="slider-input"
            />
            <span className="slider-value">{weights[col] ?? 0}</span>
          </div>
        ))}
      </div>

      {availableOptionalColumns.length > 0 && (
        <div className="optional-weights-section">
          <div className="optional-weights-header">
            <span className="optional-weights-label">Optional Weights</span>
            <select
              className="optional-weights-select"
              value=""
              onChange={handleAddOptional}
              disabled={dropdownOptions.length === 0}
            >
              <option value="" disabled>
                {dropdownOptions.length === 0 ? 'All columns added' : 'Add a column…'}
              </option>
              {dropdownOptions.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>

          {optionalColumns.map((col) => (
            <div key={col} className="slider-row slider-row--optional">
              <label className="slider-label" title={col}>{col}</label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={weights[col] ?? 0}
                onChange={(e) => handleSliderChange(col, e.target.value)}
                className="slider-input"
              />
              <span className="slider-value">{weights[col] ?? 0}</span>
              <button
                className="optional-remove-btn"
                onClick={() => handleRemoveOptional(col)}
                title={`Remove ${col}`}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="sliders-actions">
        <button className="btn btn-secondary" onClick={onReset}>
          Reset to Default
        </button>
        <button
          className="btn btn-primary"
          onClick={onScore}
          disabled={!isValid}
          title={isValid ? '' : 'Weights must sum to 100'}
        >
          Score
        </button>
      </div>
    </div>
  )
}
