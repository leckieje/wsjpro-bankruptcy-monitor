# About the WSJ Pro Distress Monitor

## What This Is

The WSJ Pro Distress Monitor is a machine-learning-powered tool that estimates the probability of a publicly traded company entering financial distress within the next two quarters (6 months). It uses a **two-model system** to cover both non-financial companies (~906) and financial-sector companies (~258), each with domain-appropriate distress definitions.

The tool produces a single output per company: a **Distress Probability** from 0% to 100%, representing the model's confidence that the company will transition into its sector-appropriate distress state in the near term.

---

## What It Measures

### Non-Financial Companies (Main Model)

The main model predicts **Z-Score zone transitions** — specifically, the likelihood that a company currently above the Altman Z-Score distress threshold (Z > 1.81) will fall below it within two quarters.

This is distinct from identifying companies that are *already* in distress. Companies already in the Distress Zone are flagged separately and excluded from probability prediction, since the event the model forecasts has already occurred.

The Altman Z-Score Distress Zone (Z ≤ 1.81) was validated as the strongest prediction target across multiple thresholds tested (1.23, 1.50, 1.81, 2.50, 2.99), achieving the highest discriminative power at 1.81.

### Financial-Sector Companies (Sector Model)

The Z-Score structurally misclassifies financial companies — banks routinely carry Total Liabilities / Total Assets ratios of ~90%, which the Z-Score interprets as extreme distress even for healthy institutions. A separate model uses **sector-specific distress definitions**:

| Sector | Distress Definition |
|--------|-------------------|
| Banks | NPL Ratio > 5% OR Texas Ratio > 100% OR ROA < -0.5% OR Loan Loss Provisions/Loans > 0.5% |
| Insurance | Combined Ratio > 120% OR 2 consecutive quarters of negative NI/NPE |
| REITs | Interest Coverage < 1.5x AND Debt/Assets > 65% |
| Other Financial | ROA < -1% AND negative net income |

These thresholds were calibrated against historical sector distress events, with proxy-based features (LLP ratio, NIM, efficiency ratio) filling coverage gaps in raw NPL and Combined Ratio data.

### Main Model Indicators

The main model tracks six financial and market indicators per company:

| Indicator | Category | What It Captures |
|-----------|----------|-----------------|
| Altman Z-Score | Composite | Overall financial health (5-component formula) |
| Quick Ratio | Liquidity | Ability to meet short-term obligations without selling inventory |
| EBIT / Total Assets | Profitability | Operating return on assets |
| Debt / EBITDA | Leverage | Debt burden relative to earnings |
| Total Liabilities / Total Assets | Leverage | Overall indebtedness |
| Factiva Sentiment Signals | Market Signal | Media and news sentiment |

For each indicator, the model engineers features using a **6-quarter lookback window**: current value, mean, trend slope, minimum, maximum, and volatility — plus two derived features (distance from distress threshold, and Z-Score level × slope interaction). This produces approximately 56 features fed into the ensemble.

### Financial Model Indicators

The financial model uses sector-specific features engineered from a 6-quarter lookback:

| Feature Group | Sectors | What It Captures |
|--------------|---------|-----------------|
| ROA, Net Income trajectory | All | Profitability deterioration and earnings volatility |
| Leverage, Equity ratio | All | Capital adequacy and erosion trends |
| LLP/Loans ratio, NIM | Banks | Credit quality deterioration via loan loss provisioning |
| Loan/Deposit ratio, Efficiency | Banks | Funding stability and cost-to-income |
| Underwriting margin, Reserve leverage | Insurance | Underwriting profitability and reserve adequacy |
| Debt/EBITDA, Debt service coverage | REITs | Leverage relative to cash generation |
| Interaction terms (ROA × leverage, equity erosion) | All | Non-linear distress signals |

The financial model produces approximately 80 features including sector indicators, temporal statistics, and cross-term interactions.

---

## How to Use It

### Main View
- Companies are ranked by distress probability (highest risk first by default)
- Use the **Sort** dropdown to reorder by probability, Z-Score, or alphabetically
- Use the **Taxonomy Filter** to narrow by sector, sub-sector, or industry
- Row tinting indicates risk level: red for companies in distress, amber for elevated probability

### Company Detail View
Click any company row to open the detail view, which shows:

- **Probability Score**: The headline number — probability of entering distress within 2 quarters
- **Change Indicator**: Direction and magnitude vs. last quarter
- **Breakdown Bar**: Which indicators are contributing most to the probability (via SHAP values)
- **Projection Chart**: Historical probability trend with a 2-quarter forward projection cone (OLS center line with confidence bands)
- **Indicator Toggles**: Enable/disable individual indicators to see how the probability changes (precomputed for all 64 combinations — instant response)
- **Financial Data Table**: All available financial fields organized by category (9 sections, ~40 fields)

### Interpreting the Probability

| Range | Interpretation |
|-------|---------------|
| < 10% | Low risk — no signs of deterioration |
| 10–30% | Emerging risk — probability trending upward |
| 30–50% | Elevated risk — monitor closely |
| > 50% | High risk — significant probability of entering distress |

### Interpreting the Projection Cone

The shaded cone on the chart shows where the model expects the probability to land over the next two quarters. It is *not* a separate model — it is a trend extrapolation of the model's own output over time.

**Center line**: An Ordinary Least Squares (OLS) regression fitted to the most recent 4–6 quarters of probability values, projected forward 2 quarters. This represents the "most likely" trajectory if current trends continue. The line is dashed to distinguish it from historical actuals. If the trend slope is extreme (>15 percentage points per quarter), it is dampened by 50% to avoid wild extrapolations from short-term noise.

**Confidence band**: The shaded area around the center line represents forecast uncertainty. It widens as you move further into the future because predictions become less certain over time.

- For companies with 4+ quarters of history, the band is computed from that specific company's historical residuals — how much its actual probability deviated from its own trend in the past. The band is ±1.5× the residual standard deviation at Q+1 (one quarter out) and ±2.0× at Q+2 (two quarters out), corresponding roughly to an 80% confidence interval.
- For companies with less history (<4 quarters), the band falls back to the model's overall backtest standard deviation (approximately ±9 percentage points at Q+1, ±12 at Q+2).
- A minimum band width of ±3 percentage points at Q+1 and ±5 at Q+2 is always enforced — even very stable companies have irreducible forecast uncertainty.

**How to read it**:

| Cone Shape | Interpretation |
|-----------|---------------|
| Narrow and flat | Stable risk, low uncertainty — the company's probability has been consistent |
| Narrow and rising | Clear deterioration trend with high confidence |
| Wide | Volatile history — the company's probability has swung significantly between quarters |
| Cone includes 0% | Even the pessimistic projection doesn't reach meaningful risk levels |
| Cone crosses 30% | The upside scenario enters elevated-risk territory — warrants monitoring |

The cone is always clipped to 0–100% since probabilities cannot go negative or exceed certainty. In practice, values above ~70% are rare; 100% would require every indicator to be catastrophically deteriorating simultaneously.

---

## Who This Is For

### Primary Users
- **Financial journalists** covering corporate distress, restructuring, and bankruptcy beats
- **Credit analysts** screening portfolios for emerging risk
- **Research analysts** seeking early signals ahead of rating downgrades or covenant breaches

### Use Cases
- **Early warning screening**: Identify companies whose risk is rising before it becomes headline news
- **Watchlist prioritization**: Focus attention on the companies most likely to deteriorate
- **Trend analysis**: Track how a company's risk profile has evolved over multiple quarters
- **Comparative analysis**: Benchmark companies within an industry or sector
- **Indicator exploration**: Understand which financial factors are driving risk for a specific company

---

## Model & Validation

### Architecture

The system uses two models, one for each population:

| Component | Main Model | Financial Model |
|-----------|-----------|----------------|
| Algorithm | Random Forest + Gradient Boosting ensemble | XGBoost + Random Forest ensemble |
| Lookback | 6 quarters | 6 quarters |
| Universe | ~906 non-financial companies | ~258 financial companies (banks, insurance, REITs) |
| Target | Z-Score zone transition (Z > 1.81 → Z ≤ 1.81) | Sector-specific distress entry |
| Cost-sensitive | Balanced class weights | scale_pos_weight = 3× (penalizes missed distress) |

Both models average the probability outputs of their constituent classifiers to produce the final score. Financial-sector companies (293 identified by TRBC industry classification) are excluded from the main model and scored exclusively by the financial model — removing them improved the main model's performance by +3.4 pp AUC.

### Training Data
- **Source**: LSEG (London Stock Exchange Group) financial data via Capital IQ fields, supplemented by Factiva Sentiment Signals sentiment data and S&P market data
- **Period**: 13 quarters (Q1 2023 – Q1 2026) for production scoring; 26 quarters (Q4 2019 – Q1 2026) for validation
- **Main model universe**: ~906 non-financial companies with valid market capitalization and financial data
- **Financial model universe**: 258 companies across 4 sub-sectors (banks, insurance, REITs, other financial)
- **Positive rates**: Main model 3.3%, Financial model 4.0%

### Validation Method
Both models were validated using **walk-forward temporal backtesting** — the gold standard for time-series financial models. This means:

- The data is split chronologically, never randomly
- The model only ever sees past data when making predictions (no future leakage)
- Expanding-window evaluation folds simulate how the model would have performed in production over time
- Each fold trains on all prior quarters and predicts the next unseen quarter

### Performance Metrics

**Main Model (non-financial):**

| Metric | Value | Interpretation |
|--------|-------|---------------|
| Single-split AUC | 0.922 | Excellent discrimination — top-decile for Z-Score transition models |
| Walk-forward pooled AUC | 0.933 | Robust across time periods |
| PR-AUC | 0.354 | Strong precision-recall given 3.3% base rate |
| Brier Score | 0.037 | Well-calibrated probability estimates |

**Financial Model (sector-specific):**

| Metric | Value | Interpretation |
|--------|-------|---------------|
| Walk-forward pooled AUC | 0.884 | Strong discrimination using sector-appropriate targets |
| Walk-forward mean AUC | 0.895 ± 0.057 | Stable across 6 temporal folds |
| PR-AUC | 0.373 | Effective at identifying rare sector distress |
| Brier Score | 0.033 | Well-calibrated |
| Per-sector: Banks | 0.858 | |
| Per-sector: Insurance | 0.801 | |
| Per-sector: REITs | 0.944 | |
| Per-sector: Other Financial | 0.931 | |

### Operating Characteristics
At a 30% probability threshold (main model):
- **Precision**: 32% — about 1 in 3 flagged companies actually enters distress
- **Recall**: 56% — catches more than half of companies that will enter distress

At a 30% probability threshold (financial model):
- Companies flagged as "Warning" — highest sector-specific distress risk
- At 15%: "Alert" tier — emerging sector risk warranting monitoring

### Model Comparison
The two-model system was selected after testing multiple configurations:

| Configuration | AUC | Notes |
|--------------|-----|-------|
| Main: 6Q RF+GB, excl financials (selected) | 0.922 | Best main model config |
| Main: 4Q RF+GB, excl financials | 0.892 | Previous baseline |
| Main: 4Q RF+GB, with financials | 0.889 | Deprecated — financial noise |
| Financial: XGBoost+RF, 6Q, cost_ratio=3 (selected) | 0.884 | Walk-forward pooled |
| Financial: RF+GB, 4Q, single split | 0.782 | Previous baseline |
| Logistic Regression | 0.784 | |
| Baseline Z-Score only | 0.726 | |
| Simple Weighted Average | 0.436 | |

### Calibration
The main model's probability outputs are well-calibrated — a 20% prediction genuinely corresponds to roughly a 1-in-5 chance of entering distress, not an arbitrary score.

### Survivor Bias Audit
The training universe is fixed across all quarters (companies that exist today). A dedicated audit identified 9 companies that went bankrupt during the study period and quantified the impact:

- 5 of 9 were already in the Z-Score Distress Zone before the study began (ineligible for our transition target)
- 1 company (iRobot) had a verified Safe → Distress transition captured in quarterly data
- Panel reconstruction with this company changed AUC by ±0.2 pp (negligible)
- **Conclusion**: Survivor bias does not materially inflate model performance for this specific prediction target

---

## What This Is Not

- **Not a bankruptcy predictor**: The model predicts entry into financial distress zones, not bankruptcy filing. Many companies remain in distress for extended periods without filing. Actual bankruptcy involves legal, strategic, and market-access factors beyond financial ratios.

- **Not investment advice**: This tool is for informational and journalistic purposes. It does not constitute a buy, sell, or hold recommendation for any security.

- **Not real-time**: Financial data updates quarterly. The Factiva Sentiment score can update more frequently (weekly), but the model's primary inputs are quarterly fundamentals. Between quarterly updates, probabilities are static.

- **Not infallible**: At a 30% threshold, roughly 2 out of 3 flagged companies will *not* enter distress (false positives). The model trades precision for recall — it aims to catch deterioration early, accepting some false alarms.

- **Not explanatory**: The model identifies statistical patterns associated with distress transitions. It does not explain *why* a company is deteriorating or what specific business events are driving the risk. The breakdown bar shows which indicators contribute most, but correlation is not causation.

- **Not applicable to all companies**: Companies without sufficient financial history (< 6 quarters for full lookback), companies with no Z-Score data, and micro-caps below $5M market capitalization are excluded from scoring.

- **Not a single model**: Financial-sector companies are scored by a separate model with sector-appropriate targets. The main model's Z-Score-based target is structurally invalid for banks, insurance companies, and REITs due to their high-leverage business models.

---

## What Informed the Model

### Academic Foundation
The model's construction draws on decades of bankruptcy prediction research:

- **Altman (1968)**: Original Z-Score model establishing the discriminant analysis framework and the five financial ratios that remain predictive 50+ years later
- **Ohlson (1980)**: Introduced logistic regression to bankruptcy prediction, demonstrating that probabilistic outputs outperform binary classification
- **Shumway (2001)**: Established that hazard models incorporating time-varying covariates outperform static models — the theoretical basis for our lookback window approach
- **Barboza et al. (2017)**: Comprehensive comparison showing ensemble methods (RF, GB) outperform traditional statistical approaches on modern data
- **Mai et al. (2019)**: Demonstrated that feature engineering from temporal patterns (trends, volatility) adds significant predictive power beyond point-in-time values
- **Carmona et al. (2019)**: Validated CAMEL+ indicators and XGBoost for bank failure prediction; demonstrated cost-sensitive learning improves rare-event detection
- **Ekinci & Sen (2024)**: Showed cost-sensitive ensemble methods achieve 0.985 AUC for financial distress with appropriate feature engineering and class imbalance handling

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Two-model system | Financial companies structurally break Z-Score assumptions; removing them improves the main model (+3.4 pp AUC) while a dedicated model handles them with appropriate targets |
| 6-quarter lookback | Captures medium-term trends; longer windows add noise, shorter miss patterns. Validated: +3.0 pp AUC over 4-quarter for main model |
| RF + GB ensemble (main) | Complementary error profiles; RF handles non-linearity, GB captures residual patterns |
| XGBoost + RF (financial) | XGBoost's cost-sensitive learning (scale_pos_weight) handles the rare-event problem better than sklearn GB for sector distress |
| Cost ratio = 3 (financial) | Missing a distress event is 3× worse than a false alarm. Calibrated via walk-forward grid search |
| Z ≤ 1.81 target (main) | Best discriminative power across all thresholds tested. Gray zone (2.99) and other alternatives underperform |
| Sector-specific targets (financial) | Bank distress ≠ REIT distress ≠ insurance distress. Combined model with sector indicators outperforms sector-isolated models |
| Walk-forward validation | Only method that prevents temporal leakage in financial time series. Cross-validation would overstate performance |
| Financials excluded from main | 293 financial companies contributed 10.7% of false positives but only 5.5% of samples — noise from Z-Score structural artifacts |

### Data Sources

| Source | Provider | Fields |
|--------|----------|--------|
| Financial statements | LSEG / Capital IQ | Balance sheet, income statement, cash flow (IQ_* fields) |
| Market data | S&P / Capital IQ | Market cap, price high/low/open (SP_* fields) |
| Sentiment | Factiva Sentiment Signals | Article counts, sentiment scores, weekly change (FSS_* fields) |
| Bank-specific | LSEG | Loan loss provisions, gross loans, deposits, net interest income, NPLs |
| Insurance-specific | LSEG | Combined ratio, net premiums earned, underwriting metrics |
| REIT-specific | LSEG | EBITDA, interest expense, debt service metrics |
| Derived ratios | Computed | Z-Score, Debt/EBITDA, TL/TA, EBIT/TA, ROA, NIM, LLP ratio, Texas ratio |
