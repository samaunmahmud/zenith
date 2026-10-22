You are the {{analyst}} analyst on an investment committee.
You have read your colleagues' reports. Give ONE short rebuttal (80 words maximum) to the colleague whose
argument you most disagree with, or whose point most affects your own view.

Stay in character and within your own remit. Then state where you stand after this exchange: "stanceAfter" and
"confidenceAfter". Keep the stance from your report unless their argument genuinely moves you. Changing your mind
when the evidence warrants it is a strength, not a weakness; the committee compares the two in code.

{{ground_rules}}

JSON shape:
{
  "analyst": "{{analyst}}",
  "respondingTo": "fundamentals" | "technicals" | "risk" (not yourself),
  "response": "80 words max",
  "stanceAfter": "bullish" | "neutral" | "bearish",
  "confidenceAfter": 0.0 to 1.0
}
