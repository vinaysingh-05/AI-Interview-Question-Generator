// ─────────────────────────────────────────────────────────
// Types — kept identical so callers need no changes
// ─────────────────────────────────────────────────────────

export interface GraniteQuestion {
  question: string;
  answer: string;
  difficulty: string;
  category: string;
}

export interface GraniteResponse {
  questions: GraniteQuestion[];
}

export interface GenerateParams {
  jobRole: string;
  experienceLevel: string;
  difficulty: string;
  questionType: string;
  programmingLanguage: string;
  numberOfQuestions: number;
}

// ─────────────────────────────────────────────────────────
// API key validation
// ─────────────────────────────────────────────────────────

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/**
 * Returns true when VITE_GEMINI_API_KEY is present and non-empty.
 * Named isGraniteConfigured for backwards-compatibility with App.tsx.
 */
export function isGraniteConfigured(): boolean {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

/** Alias used by any code that imports the new name directly. */
export const isGeminiConfigured = isGraniteConfigured;

// ─────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────

function buildPrompt(p: GenerateParams): string {
  const lang =
    p.programmingLanguage !== "Not Applicable"
      ? ` Use ${p.programmingLanguage} for code examples where relevant.`
      : "";
  const diff =
    p.difficulty === "Mixed"
      ? "vary difficulty across Easy, Medium, and Hard"
      : `set difficulty to ${p.difficulty}`;
  const type =
    p.questionType === "All"
      ? "Technical, Behavioral, System Design, and Problem Solving"
      : p.questionType;

  return (
    `You are an expert technical interviewer. Generate exactly ${p.numberOfQuestions} interview questions for a ${p.experienceLevel} ${p.jobRole}.\n` +
    `Question type: ${type}. Difficulty: ${diff}.${lang}\n\n` +
    `Rules:\n` +
    `- Each question must have a thorough, accurate answer.\n` +
    `- Difficulty must be exactly one of: Easy, Medium, Hard.\n` +
    `- Category must be a concise label (e.g. "JavaScript", "System Design", "Behavioral").\n` +
    `- Return ONLY valid JSON — no markdown fences, no extra text.\n\n` +
    `Required JSON format:\n` +
    `{"questions":[{"question":"","answer":"","difficulty":"Easy|Medium|Hard","category":""}]}`
  );
}

// ─────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────

export async function generateQuestions(params: GenerateParams): Promise<GraniteResponse> {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  if (!API_KEY || (API_KEY as string).trim().length === 0) {
    throw new Error(
      "Gemini API key is not configured. Add VITE_GEMINI_API_KEY to your .env file and restart the dev server."
    );
  }

  let res: Response;
  try {
    res = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(API_KEY as string)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(params) }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      }),
    });
  } catch {
    throw new Error("Network error: unable to reach Gemini. Check your internet connection.");
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 400) {
      let detail = "";
      try { detail = JSON.parse(body)?.error?.message ?? body.slice(0, 300); } catch { detail = body.slice(0, 300); }
      throw new Error(`Gemini API bad request: ${detail || "unknown reason"}. Please try again.`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Gemini API key is invalid or unauthorized. Check VITE_GEMINI_API_KEY in your .env file."
      );
    }
    if (res.status === 429) {
      throw new Error("Gemini API rate limit exceeded. Please wait a moment and try again.");
    }
    throw new Error(`Gemini API error (${res.status})${body ? `: ${body.slice(0, 200)}` : "."}`);
  }

  const data = await res.json();

  // Gemini response shape: data.candidates[0].content.parts[0].text
  const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!raw.trim()) {
    throw new Error("Gemini returned an empty response. Please try again.");
  }

  // Strip optional markdown fences the model may still emit
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  // Find the JSON object that contains "questions"
  const jsonMatch = stripped.match(/\{[\s\S]*"questions"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI returned an unexpected format. Please try again.");
  }

  let parsed: GraniteResponse;
  try {
    parsed = JSON.parse(jsonMatch[0]) as GraniteResponse;
  } catch {
    throw new Error("Failed to parse AI response. Please try again.");
  }

  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error("AI returned no questions. Please try again with a different configuration.");
  }

  return parsed;
}
