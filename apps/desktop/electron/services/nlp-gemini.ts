/**
 * Gemini Planner Service
 * Converts user speech into executable task plans
 */

import { GoogleGenAI } from "@google/genai";

export interface TaskStep {
  op: "OpenApp" | "Navigate" | "Type" | "Click" | "Shortcut" | "SystemSetting" | "Message" | "Confirm" | "Wait";
  target?: string;
  app?: string;
  text?: string;
  keys?: string[];
  value?: string;
}

export interface TaskPlan {
  task: string;
  risk: "low" | "medium" | "high";
  steps: TaskStep[];
}

export class GeminiPlannerService {
  private ai: GoogleGenAI;
  private model: string = "gemini-2.0-flash-exp";

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Generate a task plan from user speech
   */
  async generateTaskPlan(userInput: string): Promise<TaskPlan> {
    const systemPrompt = this.buildSystemPrompt();
    const fullPrompt = `${systemPrompt}\n\nUSER INSTRUCTION: "${userInput}"\n\nReturn JSON plan:`;

    console.log("[GEMINI] Sending request for:", userInput);

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: fullPrompt,
      });

      const text = response.text.trim();
      console.log("[GEMINI] Raw response:", text);

      // Extract JSON from response (sometimes Gemini wraps it in markdown)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const plan: TaskPlan = JSON.parse(jsonMatch[0]);
      
      // Validate the plan structure
      if (!plan.task || !plan.risk || !Array.isArray(plan.steps)) {
        throw new Error("Invalid plan structure");
      }

      console.log("[GEMINI] Parsed plan:", JSON.stringify(plan, null, 2));
      return plan;
    } catch (error: any) {
      console.error("[GEMINI] Error:", error.message);
      // Return a fallback plan
      return {
        task: userInput,
        risk: "low",
        steps: [
          {
            op: "Confirm",
            text: `I couldn't understand the task: "${userInput}". Please try again.`
          }
        ]
      };
    }
  }

  /**
   * Build the system prompt with examples
   */
  private buildSystemPrompt(): string {
    return `You are a Windows Task Planner AI. Your job is to convert user voice commands into executable JSON plans.

IMPORTANT RULES:
1. Return ONLY valid JSON matching the exact schema below
2. Do NOT include explanations, markdown, or any text outside the JSON
3. Choose appropriate operations from the allowed list
4. Set risk level: "low" for reading/viewing, "medium" for settings/typing, "high" for messages/emails

JSON SCHEMA:
{
  "task": "brief description of what user wants",
  "risk": "low|medium|high",
  "steps": [
    {"op": "operation", "target": "...", "value": "..."}
  ]
}

ALLOWED OPERATIONS:
- OpenApp: {"op":"OpenApp", "app":"appname"}
- SystemSetting: {"op":"SystemSetting", "target":"setting.path", "value":"value"}
- Type: {"op":"Type", "text":"text to type"}
- Shortcut: {"op":"Shortcut", "keys":["Ctrl","V"]}
- Navigate: {"op":"Navigate", "target":"location"}
- Message: {"op":"Message", "target":"person", "text":"message"}
- Confirm: {"op":"Confirm", "text":"confirmation message"}
- Wait: {"op":"Wait", "value":"1000"}

EXAMPLES:

Input: "set brightness to 30%"
Output:
{
  "task": "Set brightness to 30%",
  "risk": "low",
  "steps": [
    {"op":"SystemSetting", "target":"display.brightness", "value":"30"}
  ]
}

Input: "open settings and search for focus assist"
Output:
{
  "task": "Open Settings and search for focus assist",
  "risk": "low",
  "steps": [
    {"op":"OpenApp", "app":"ms-settings:"},
    {"op":"Wait", "value":"500"},
    {"op":"Type", "text":"focus assist"},
    {"op":"Shortcut", "keys":["Enter"]}
  ]
}

Input: "open Slack and message Didi hello"
Output:
{
  "task": "Send message to Didi on Slack",
  "risk": "high",
  "steps": [
    {"op":"OpenApp", "app":"slack"},
    {"op":"Wait", "value":"1000"},
    {"op":"Message", "target":"Didi", "text":"hello"}
  ]
}

Input: "open Chrome"
Output:
{
  "task": "Open Chrome browser",
  "risk": "low",
  "steps": [
    {"op":"OpenApp", "app":"chrome"}
  ]
}

Now convert the user's instruction into a JSON plan following these examples.`;
  }
}

/**
 * Create Gemini service from environment variable
 */
export function createGeminiService(): GeminiPlannerService | null {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.warn("[GEMINI] GEMINI_API_KEY not found in environment. Using mock responses.");
    return null;
  }

  console.log("[GEMINI] Service initialized");
  return new GeminiPlannerService(apiKey);
}

