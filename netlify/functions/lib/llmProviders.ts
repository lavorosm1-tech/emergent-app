/**
 * Elenco modelli disponibili (porting di LLM_OPTIONS in server.py, con Groq
 * aggiunto). DeepSeek e Groq sono entrambi compatibili con l'API OpenAI,
 * quindi condividono lo stesso "adapter" generico — cambia solo base URL,
 * chiave e nome modello.
 */

export type LlmOption = {
  id: string;
  label: string;
  provider: "deepseek" | "groq" | "gemini" | "anthropic" | "openai";
  model: string;
  cost_per_pred: number;
  speed: string;
  quality: string;
  desc: string;
};

export const LLM_OPTIONS: LlmOption[] = [
  { id: "deepseek-chat", label: "DeepSeek V4 Lite", provider: "deepseek", model: "deepseek-chat",
    cost_per_pred: 0.0014, speed: "Veloce", quality: "Buono", desc: "Economicissimo (~€1,56/mese per 40 pred/giorno)" },
  { id: "deepseek-reasoner", label: "DeepSeek V4 Pro", provider: "deepseek", model: "deepseek-reasoner",
    cost_per_pred: 0.0027, speed: "Lento", quality: "Ottimo", desc: "Ragionamento profondo, costo ridotto (~€3/mese)" },
  { id: "groq-qwen", label: "Qwen 3 32B (Groq)", provider: "groq", model: "qwen/qwen3-32b",
    cost_per_pred: 0, speed: "Velocissimo", quality: "Buono", desc: "Gratuito — nessun costo, limiti di velocità generosi" },
  { id: "groq-deepseek-r1", label: "DeepSeek R1 Distill (Groq)", provider: "groq", model: "deepseek-r1-distill-llama-70b",
    cost_per_pred: 0, speed: "Veloce", quality: "Ottimo", desc: "Gratuito — ragionamento più profondo, nessun costo" },
  { id: "groq-llama", label: "Llama 3.3 70B (Groq)", provider: "groq", model: "llama-3.3-70b-versatile",
    cost_per_pred: 0, speed: "Velocissimo", quality: "Buono", desc: "Gratuito — molto veloce, nessun costo" },
  { id: "gemini-flash", label: "Gemini 2.5 Flash", provider: "gemini", model: "gemini-2.5-flash",
    cost_per_pred: 0.002, speed: "Veloce", quality: "Buono", desc: "Veloce e bilanciato" },
  { id: "gemini-pro", label: "Gemini 2.5 Pro", provider: "gemini", model: "gemini-2.5-pro",
    cost_per_pred: 0.025, speed: "Medio", quality: "Ottimo", desc: "Ragionamento più profondo" },
  { id: "claude-haiku", label: "Claude Haiku 4.5", provider: "anthropic", model: "claude-haiku-4-5-20251001",
    cost_per_pred: 0.005, speed: "Veloce", quality: "Buono", desc: "Bilanciato economia/qualità" },
  { id: "claude-sonnet", label: "Claude Sonnet 4.5", provider: "anthropic", model: "claude-sonnet-4-5-20250929",
    cost_per_pred: 0.016, speed: "Medio", quality: "Eccellente", desc: "Top ragionamento, più costoso" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai", model: "gpt-4o-mini",
    cost_per_pred: 0.003, speed: "Veloce", quality: "Buono", desc: "Veloce e ben bilanciato" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai", model: "gpt-4o",
    cost_per_pred: 0.020, speed: "Medio", quality: "Ottimo", desc: "Eccellente per analisi complesse" },
];

export const DEFAULT_LLM = "deepseek-chat";

/** Provider gia' collegati con una chiave funzionante (aggiornato man mano che l'utente le fornisce). */
export const CONFIGURED_PROVIDERS = new Set(["deepseek", "groq"]);

const PROVIDER_BASE_URL: Record<string, string> = {
  deepseek: "https://api.deepseek.com",
  groq: "https://api.groq.com/openai/v1",
};

const PROVIDER_ENV_KEY: Record<string, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  groq: "GROQ_API_KEY",
};

declare const Netlify: { env: { get(key: string): string | undefined } } | undefined;

function readEnv(key: string): string | undefined {
  try {
    // Le variabili segnate come "secret" su Netlify non sono esposte su
    // process.env per motivi di sicurezza: vanno lette con Netlify.env.get().
    // @ts-ignore — Netlify e' un global iniettato a runtime dalla piattaforma
    if (typeof Netlify !== "undefined" && Netlify?.env?.get) {
      // @ts-ignore
      const v = Netlify.env.get(key);
      if (v) return v;
    }
  } catch {
    /* Netlify global non disponibile in questo contesto, uso il fallback */
  }
  return process.env[key];
}

export async function callLlm(
  option: LlmOption,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!CONFIGURED_PROVIDERS.has(option.provider)) {
    throw new Error(
      `Provider "${option.provider}" non ancora configurato (manca la API key). Scegli DeepSeek o Groq, oppure fornisci la chiave per abilitare "${option.label}".`
    );
  }

  const baseUrl = PROVIDER_BASE_URL[option.provider];
  const apiKey = readEnv(PROVIDER_ENV_KEY[option.provider]);
  if (!apiKey) {
    throw new Error(`Variabile d'ambiente ${PROVIDER_ENV_KEY[option.provider]} non configurata su Netlify`);
  }

  const maxTokens = option.model.includes("reasoner") || option.model.includes("r1") ? 8000 : 2000;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: option.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt + "\n\nIMPORTANTE: rispondi SOLO con il JSON, niente testo introduttivo, niente ragionamento, solo l'oggetto JSON." },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Errore ${option.provider} (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  let text: string = msg?.content || msg?.reasoning_content || "";
  if (!text.trim() && msg?.reasoning_content) text = msg.reasoning_content;
  return text;
}

