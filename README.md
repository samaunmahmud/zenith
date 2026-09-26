# AI Investment Committee

A multi-agent research tool: three analyst agents (Fundamentals, Technicals, Risk) independently analyse a stock and argue their case, then an NVIDIA Nemotron Ultra "chair" weighs the arguments, makes a BUY / HOLD / SELL call and writes an investment memo, including the dissenting view.

Built for the **Nebius x NVIDIA Global AI Hackathon** (Best Apps and Agents track), running on **Nebius Token Factory** with **NVIDIA Nemotron** models.

> ⚠️ Research and education tool only. Not financial advice.

## Status
🚧 In development.

## How Nemotron and Token Factory are used
_To be completed: which model powers each agent and why, plus cost/latency results._

## Setup
```bash
npm install
cp .env.example .env   # add your Token Factory and market data keys
npm run dev
```

## License
MIT. See [LICENSE](LICENSE).
