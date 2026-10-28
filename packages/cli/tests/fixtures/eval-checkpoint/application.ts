// Small real application boundary for checkpoint QA, not a scaffold implementation.
export async function applicationTurn(base: string, model: string, caseId: string) {
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, caseId }),
  });
  if (!response.ok) throw new Error("local application request failed");
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || !("answer" in value)) {
    throw new Error("invalid local answer");
  }
  return value.answer === caseId;
}
