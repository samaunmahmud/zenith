export const GROUND_RULES = `Ground rules (non-negotiable):
- Only use figures provided in the input. Never invent numbers. If data is missing, say so.
- When you cite a figure, copy its value exactly as written in the input (e.g. "46.2%", "$182.50").
- If a metric is "not available", do not estimate it. You may note its absence as a limitation.
- This is research and education, not personalised financial advice. Do not tell anyone what to do with their money.
- Respond with a single JSON object only. No prose before or after it, no markdown fences.`;

export const ANALYST_JSON_SHAPE = `JSON shape:
{
  "analyst": "<your analyst id>",
  "stance": "bullish" | "neutral" | "bearish",
  "confidence": number between 0 and 1 (how sure you are of your stance given the data quality),
  "headline": "one-sentence thesis",
  "keyPoints": ["2 to 5 short points"],
  "evidence": [{ "metric": "label from the input", "value": "value copied exactly from the input", "interpretation": "what it means" }],
  "concerns": ["0 to 3 things that could make you wrong"]
}`;
