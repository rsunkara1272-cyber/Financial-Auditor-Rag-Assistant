import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Document, Message } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const SYSTEM_PROMPT = `Role: You are a Senior Financial Auditor and RAG Assistant.

Core Mandate: Answer questions using ONLY the uploaded documents. If the answer is not present, state: "I cannot find this information in the provided financial records."

Primary Source Logic:
- If a document is marked as "PRIMARY SOURCE", prioritize its data over all other documents.
- Use other documents only for supplementary information or if the primary source does not contain the answer.
- Always cross-reference data points if multiple documents are provided.

Data Handling & Table Parsing:
- The text context uses tabs (\\t) to separate columns in tables. Interpret these as structured data.
- For quarterly data in a 10-K, look for sections titled "Selected Quarterly Financial Data", "Quarterly Results", or "Unaudited Quarterly Data".
- Formatting: ALL financial data, including Revenue, Net Income, and especially Ratios (Current Ratio, Debt-to-Equity, etc.), MUST be presented in Markdown Tables. Do not use bullet points or plain text for these metrics.
- Citations: Every fact must include a source tag: [Document Name, Page #].
- Precision: Never round numbers unless the document does. Use exactly what is written.
- Safety: Do not provide investment advice or "buy/sell" ratings. Stick to factual retrieval.

Troubleshooting:
- If you cannot find the exact answer, explain what you DO see (e.g., "I see annual revenue but not a quarterly breakdown") and suggest where it might be or what specific terminology is used in the document.

Context from uploaded documents:
{DOCUMENTS_CONTEXT}`;

export async function summarizeRisks(document: Document): Promise<string> {
  const systemInstruction = `Role: You are a Senior Risk Compliance Auditor.
  
Task: Extract and summarize the "Risk Factors" (Item 1A) from the provided financial document.
  
Requirements:
1. Categorize risks (e.g., Operational, Financial, Regulatory, Market).
2. For each category, provide a concise bulleted summary of the key threats.
3. Highlight any "New" or "Emerging" risks mentioned.
4. Use a professional, high-density reporting style.
5. Formatting: Use Markdown headers and bold text for emphasis.
6. Citation: Include page numbers for each risk category.

If the document does not contain a clear "Risk Factors" section, analyze the entire text for potential business risks and state that you are performing a general risk assessment.`;

  const contents = [
    {
      role: "user",
      parts: [{ text: `Please provide a comprehensive Risk Insight Summary for the document: ${document.name}\n\nContent:\n${document.content}` }],
    },
  ];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: contents as any,
      config: {
        systemInstruction,
        temperature: 0.2,
      },
    });

    return response.text || "Unable to generate risk summary.";
  } catch (error: any) {
    console.error("Risk Summary Error:", error);
    return `Error generating risk summary: ${error?.message}`;
  }
}

export async function askAuditor(
  question: string,
  documents: Document[],
  history: Message[]
): Promise<string> {
  const documentsContext = documents
    .map((doc) => `--- DOCUMENT: ${doc.name}${doc.isPrimary ? " [PRIMARY SOURCE]" : ""} ---\n${doc.content}\n--- END DOCUMENT ---`)
    .join("\n\n");

  const systemInstruction = SYSTEM_PROMPT.replace("{DOCUMENTS_CONTEXT}", documentsContext);

  const contents = [
    ...history.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    })),
    {
      role: "user",
      parts: [{ text: question }],
    },
  ];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: contents as any,
      config: {
        systemInstruction,
        temperature: 0.1, // Low temperature for precision
      },
    });

    return response.text || "I encountered an error processing your request.";
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const errorMessage = error?.message || "Unknown API error";
    return `I cannot find this information in the provided financial records due to a technical error: ${errorMessage}. This may be due to the document size or an API limitation.`;
  }
}
