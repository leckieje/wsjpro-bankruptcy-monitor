# WSJ Pro Bankruptcy Monitor

A machine-learning tool that estimates the probability of a publicly traded company entering financial distress within the next two quarters (6 months). Built for financial journalists, credit analysts, and research analysts tracking early warning signals.

---

## What It Predicts

The monitor produces a single output per company: a **Distress Probability** from 0% to 100%, representing the model's confidence that the company will transition into financial distress in the near term.

It uses a **two-model system**, because the Altman Z-Score — the primary distress metric for non-financial companies — structurally misclassifies financial institutions (banks routinely carry ~90% leverage ratios, which the Z-Score interprets as extreme distress even for healthy firms):

**Main model** (~906 non-financial companies): Predicts Z-Score zone transitions — the likelihood a company currently above the Altman Z-Score distress threshold (Z > 1.81) will fall below it within two quarters. The Z ≤ 1.81 threshold was validated as the strongest prediction target across five thresholds tested (1.23, 1.50, 1.81, 2.50, 2.99), achieving the highest discriminative power.

**Financial sector model** (~258 companies — banks, insurance, REITs, other financial): Uses sector-specific distress definitions calibrated against historical sector distress events:

| Sector | Distress Definition |
|--------|-------------------|
| Banks | NPL Ratio > 5% OR Texas Ratio > 100% OR ROA < -0.5% OR Loan Loss Provisions/Loans > 0.5% |
| Insurance | Combined Ratio > 120% OR 2 consecutive quarters of negative NI/NPE |
| REITs | Interest Coverage < 1.5x AND Debt/Assets > 65% |
| Other Financial | ROA < -1% AND negative net income |

Removing financial companies from the main model improved its AUC by +3.4 percentage points.

---

## How the Models Work

### Architecture

| Component | Main Model | Financial Model |
|-----------|-----------|----------------|
| Algorithm | Random Forest + Gradient Boosting ensemble | XGBoost + Random Forest ensemble |
| Universe | ~906 non-financial companies | ~258 financial companies |
| Lookback window | 6 quarters | 6 quarters |
| Target | Z-Score zone transition (Z > 1.81 → Z ≤ 1.81) | Sector-specific distress entry |
| Class weighting | Balanced | scale_pos_weight = 3× (penalizes missed distress) |

### Feature Engineering

Each model engineers features from a **6-quarter lookback window** per indicator: current value, mean, trend slope, minimum, maximum, volatility, distance from distress threshold, and interaction terms. This produces ~56 features for the main model and ~80 for the financial model.

**Main model indicators:**

| Indicator | Category |
|-----------|----------|
| Altman Z-Score | Composite financial health |
| Quick Ratio | Liquidity |
| EBIT / Total Assets | Profitability |
| Debt / EBITDA | Leverage |
| Total Liabilities / Total Assets | Leverage |
| Factiva Sentiment Signals | Market signal |

**Financial model feature groups:** ROA and net income trajectory, leverage and equity ratio, loan loss provisions / NIM (banks), loan-to-deposit ratio and efficiency ratio (banks), underwriting margin and reserve leverage (insurance), debt service coverage and Debt/EBITDA (REITs), plus ROA × leverage interaction terms.

---

## Validation

Both models were validated using **walk-forward temporal backtesting** — the gold standard for financial time-series models. The data is split chronologically, never randomly. Each fold trains on all prior quarters and predicts the next unseen quarter, exactly simulating how the model would perform in production. This prevents any future data from leaking into training.

### Performance

**Main model (non-financial):**

| Metric | Value | What It Means |
|--------|-------|---------------|
| Walk-forward pooled AUC | 0.933 | Robust discrimination across all time periods |
| Single-split AUC | 0.922 | Top-decile for Z-Score transition models |
| PR-AUC | 0.354 | Strong precision-recall at a 3.3% base rate |
| Brier Score | 0.037 | Well-calibrated probability estimates |

**Financial sector model:**

| Metric | Value | What It Means |
|--------|-------|---------------|
| Walk-forward pooled AUC | 0.884 | Strong discrimination using sector-appropriate targets |
| Walk-forward mean AUC | 0.895 ± 0.057 | Stable across 6 temporal folds |
| PR-AUC | 0.373 | Effective at identifying rare sector distress |
| Brier Score | 0.033 | Well-calibrated |

Per-sector AUC: Banks 0.858 · Insurance 0.801 · REITs 0.944 · Other Financial 0.931

### Operating characteristics (at 30% threshold)

- **Main model**: Precision 32%, Recall 56% — catches more than half of companies that will enter distress, with roughly 1-in-3 flags confirmed
- **Financial model**: "Warning" tier flags highest sector-specific risk; "Alert" tier (15%+) flags emerging risk

### Model comparison

| Configuration | AUC |
|--------------|-----|
| Main: RF+GB, 6Q, excl. financials **(selected)** | 0.922 |
| Main: RF+GB, 4Q, excl. financials | 0.892 |
| Main: RF+GB, 4Q, with financials | 0.889 |
| Financial: XGBoost+RF, 6Q, cost_ratio=3 **(selected)** | 0.884 |
| Logistic Regression | 0.784 |
| Baseline Z-Score only | 0.726 |
| Simple Weighted Average | 0.436 |

### Survivor bias audit

9 companies went bankrupt during the study period. 5 were already in the Z-Score Distress Zone before the study began (ineligible for the transition target). Reconstructing the panel with the 1 captured transition (iRobot) changed AUC by ±0.2 pp — negligible. Survivor bias does not materially inflate model performance.

---

## What This Is Not

- **Not a bankruptcy predictor.** The model predicts entry into financial distress zones, not bankruptcy filing. Many companies remain in distress for extended periods without filing. Bankruptcy involves legal, strategic, and market-access factors beyond financial ratios.
- **Not investment advice.** For informational and journalistic purposes only. Does not constitute a buy, sell, or hold recommendation.
- **Not real-time.** Financial data updates quarterly. Probabilities are static between updates, even if a company's situation changes rapidly.
- **Not infallible.** At a 30% threshold, roughly 2 in 3 flagged companies will not enter distress. The model trades precision for recall — it aims to catch deterioration early, accepting some false alarms.
- **Not explanatory.** The model identifies statistical patterns associated with distress transitions. It does not explain why a company is deteriorating. The indicator breakdown shows which inputs contribute most, but correlation is not causation.
- **Not universal.** Companies with fewer than 6 quarters of financial history, no Z-Score data, or market cap below $5M are excluded from scoring.

---

## Data Sources

| Data | Provider |
|------|----------|
| Financial statements (balance sheet, income statement, cash flow) | LSEG |
| Market data (market cap, price) | LSEG |
| Bank-specific data (loan loss provisions, NPLs, deposits, NIM) | LSEG |
| Insurance-specific data (combined ratio, net premiums earned) | LSEG |
| REIT-specific data (debt service, interest coverage) | LSEG |
| Sentiment signals (article counts, sentiment scores, weekly change) | Factiva Sentiment Signals |

---

## Tech Stack

- **Frontend**: React + Vite
- **Visualization**: Recharts
- **Data parsing**: PapaParse
- **State**: Immer
- **Data pipeline**: Python (pandas, numpy, scikit-learn)
- **Deployment**: GitHub Pages (auto-deploys on push to `main`)

## Local Development

```bash
npm install
npm run dev
```

## Rebuilding Data

```bash
cd api-data-pull
pip install -r requirements.txt
python3 run_pipeline.py
```

Use `--no-fss` to skip the Factiva Sentiment API call.
