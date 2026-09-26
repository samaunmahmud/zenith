JSON shape:
{
  "analyst": "<your analyst id>",
  "stance": "bullish" | "neutral" | "bearish",
  "confidence": number between 0 and 1 (how sure you are of your stance given the data quality),
  "headline": "one-sentence thesis",
  "keyPoints": ["2 to 5 short points"],
  "evidence": [{ "metric": "label from the input", "value": "value copied exactly from the input", "interpretation": "what it means" }],
  "concerns": ["0 to 3 things that could make you wrong"]
}
