import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  // Read lazily so the server can start (e.g. /api/health) before keys are set up.
  tokenFactory: () => ({
    apiKey: required("TOKEN_FACTORY_API_KEY"),
    baseURL: required("TOKEN_FACTORY_BASE_URL"),
    models: {
      nano: required("NEMOTRON_NANO_MODEL"),
      super: required("NEMOTRON_SUPER_MODEL"),
      ultra: required("NEMOTRON_ULTRA_MODEL"),
    },
  }),
  alphaVantageKey: () => required("ALPHA_VANTAGE_API_KEY"),
};
