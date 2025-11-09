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
  async generateTaskPlan(userInput: string): Promise<{ plan: TaskPlan; rawResponse: string }> {
    const systemPrompt = this.buildSystemPrompt();
    const fullPrompt = `${systemPrompt}\n\nUSER INSTRUCTION: "${userInput}"\n\nReturn JSON plan:`;

    console.log("[GEMINI] Sending request for:", userInput);

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: fullPrompt,
      });

      if (!response.text) {
        throw new Error("No text in response");
      }

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
      return { plan, rawResponse: text };
    } catch (error: any) {
      console.error("[GEMINI] Error:", error.message);
      // Return a fallback plan
      const fallbackPlan = {
        task: userInput,
        risk: "low" as const,
        steps: [
          {
            op: "Confirm" as const,
            text: `I couldn't understand the task: "${userInput}". Please try again.`
          }
        ]
      };
      return { 
        plan: fallbackPlan, 
        rawResponse: JSON.stringify(fallbackPlan, null, 2) 
      };
    }
  }

  /**
   * Classify a user query to determine if it should be handled by executors or conversationally
   * Returns "executor" if it requires task execution, "conversational" if it's just a question/greeting
   */
  async classifyQuery(userInput: string): Promise<"executor" | "conversational"> {
    const prompt = `You are a query classifier for a Windows voice assistant. Your job is to determine if a user query requires executing a task (opening apps, changing settings, typing, etc.) or if it's just a conversational question/greeting that should be answered directly.

Classify the following user query:
"${userInput}"

Respond with ONLY one word: either "executor" or "conversational"

- "executor" = The query requires performing an action (opening apps, changing system settings, typing text, sending messages, keyboard shortcuts, etc.)
- "conversational" = The query is a greeting, question, or casual conversation that doesn't require any action execution (e.g., "hello", "how are you", "what's the weather", "tell me a joke", etc.)

Examples:
- "open notepad" → executor
- "set volume to 50" → executor
- "hello" → conversational
- "how are you doing today" → conversational
- "what time is it" → conversational
- "open chrome and go to youtube" → executor
- "tell me about yourself" → conversational
- "increase brightness" → executor
- "mute the computer" → executor

Your response (one word only):`;

    console.log("[GEMINI] Classifying query:", userInput);

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
      });

      if (!response.text) {
        throw new Error("No text in response");
      }

      const classification = response.text.trim().toLowerCase();
      
      if (classification === "executor" || classification.includes("executor")) {
        console.log("[GEMINI] Query classified as: executor");
        return "executor";
      } else {
        console.log("[GEMINI] Query classified as: conversational");
        return "conversational";
      }
    } catch (error: any) {
      console.error("[GEMINI] Error classifying query:", error.message);
      // Fallback: if classification fails, check for common executor keywords
      const executorKeywords = ["open", "set", "change", "launch", "start", "close", "type", "send", "mute", "volume", "brightness", "increase", "decrease"];
      const lowerInput = userInput.toLowerCase();
      const hasExecutorKeyword = executorKeywords.some(keyword => lowerInput.includes(keyword));
      
      return hasExecutorKeyword ? "executor" : "conversational";
    }
  }

  /**
   * Generate a conversational response for simple questions or greetings
   * This is used when the user query doesn't require task execution
   */
  async generateConversationalResponse(userInput: string): Promise<{ text: string; rawResponse: string }> {
    const prompt = `You are a helpful AI assistant. The user has asked: "${userInput}"

Respond naturally and conversationally. Keep your response brief and friendly (1-2 sentences). 
If it's a greeting, respond warmly. If it's a question, answer it helpfully.
Do not include any JSON or structured data - just a natural language response.`;

    console.log("[GEMINI] Generating conversational response for:", userInput);

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
      });

      if (!response.text) {
        throw new Error("No text in response");
      }

      const text = response.text.trim();
      const rawResponse = JSON.stringify({
        type: "conversational",
        model: this.model,
        userInput: userInput,
        prompt: prompt,
        response: text,
        fullResponse: response.text,
        timestamp: new Date().toISOString(),
      }, null, 2);
      
      console.log("[GEMINI] Conversational response:", text);
      return { text, rawResponse };
    } catch (error: any) {
      console.error("[GEMINI] Error generating conversational response:", error.message);
      // Fallback response
      const fallbackText = "I'm here to help! How can I assist you today?";
      const fallbackRaw = JSON.stringify({
        error: error.message,
        fallback: true,
        response: fallbackText,
      }, null, 2);
      return { text: fallbackText, rawResponse: fallbackRaw };
    }
  }

  /**
   * Check if a task plan is executable (has real actions beyond just Confirm)
   */
  isPlanExecutable(plan: TaskPlan): boolean {
    // Check if plan has any steps that are actual actions (not just Confirm)
    const executableOps = ["OpenApp", "SystemSetting", "Type", "Shortcut", "Message", "Navigate", "Click"];
    return plan.steps.some(step => executableOps.includes(step.op));
  }

  /**
   * Build the system prompt with examples
   */
  private buildSystemPrompt(): string {
    return `You are a Windows Task Planner AI that converts natural language commands into executable JSON plans.

═══ CRITICAL RULES ═══
1. Return ONLY valid JSON - no markdown, no explanations, no extra text
2. Match the exact schema provided below
3. Use operations from the ALLOWED OPERATIONS list only
4. For apps, use lowercase simple names (chrome, notepad, spotify, etc.)
5. For system settings, use format: "category.setting" (e.g., "audio.volume")
6. Always include risk assessment

═══ JSON SCHEMA ═══
{
  "task": "brief description",
  "risk": "low|medium|high",
  "steps": [
    {"op": "OperationName", ...parameters}
  ]
}

═══ ALLOWED OPERATIONS ═══

1. OpenApp - Launch any application
   {"op":"OpenApp", "app":"appname"}
   Examples: "chrome", "notepad", "calculator", "spotify", "word", "excel"

2. SystemSetting - Change system settings
   {"op":"SystemSetting", "target":"category.setting", "value":"value"}
   Targets:
   - "audio.volume" with value "0-100"
   - "audio.mute" with value "true|false"
   - "display.brightness" with value "0-100"

3. Type - Type text
   {"op":"Type", "text":"text to type"}

4. Shortcut - Keyboard shortcuts
   {"op":"Shortcut", "keys":["Ctrl","C"]}
   Common: ["Ctrl","C"], ["Ctrl","V"], ["Win","R"], ["Alt","F4"]

5. Wait - Pause between actions
   {"op":"Wait", "value":"milliseconds"}
   Use 500-2000ms for app loading

6. Message - Send messages (email/Slack)
   {"op":"Message", "target":"person@email.com", "text":"message"}

7. Confirm - Confirmation message
   {"op":"Confirm", "text":"message"}

═══ RISK LEVELS ═══
- "low": Opening apps, viewing, reading (OpenApp, most SystemSettings)
- "medium": Typing, shortcuts, changing settings
- "high": Sending messages, emails, financial actions

═══ EXAMPLES ═══

Input: "open notepad"
Output:
{
  "task": "Open Notepad",
  "risk": "low",
  "steps": [{"op":"OpenApp", "app":"notepad"}]
}

Input: "set volume to 50"
Output:
{
  "task": "Set volume to 50%",
  "risk": "low",
  "steps": [{"op":"SystemSetting", "target":"audio.volume", "value":"50"}]
}

Input: "increase brightness to 80"
Output:
{
  "task": "Increase brightness to 80%",
  "risk": "low",
  "steps": [{"op":"SystemSetting", "target":"display.brightness", "value":"80"}]
}

Input: "mute the computer"
Output:
{
  "task": "Mute system audio",
  "risk": "low",
  "steps": [{"op":"SystemSetting", "target":"audio.mute", "value":"true"}]
}

Input: "open chrome and go to youtube"
Output:
{
  "task": "Open Chrome and navigate to YouTube",
  "risk": "low",
  "steps": [
    {"op":"OpenApp", "app":"chrome"},
    {"op":"Wait", "value":"1500"},
    {"op":"Type", "text":"youtube.com"},
    {"op":"Shortcut", "keys":["Enter"]}
  ]
}

Input: "open calculator and spotify"
Output:
{
  "task": "Open Calculator and Spotify",
  "risk": "low",
  "steps": [
    {"op":"OpenApp", "app":"calculator"},
    {"op":"Wait", "value":"500"},
    {"op":"OpenApp", "app":"spotify"}
  ]
}

Input: "decrease volume"
Output:
{
  "task": "Decrease volume to 30%",
  "risk": "low",
  "steps": [{"op":"SystemSetting", "target":"audio.volume", "value":"30"}]
}

Input: "open file explorer"
Output:
{
  "task": "Open File Explorer",
  "risk": "low",
  "steps": [{"op":"OpenApp", "app":"explorer"}]
}

Input: "open settings"
Output:
{
  "task": "Open Windows Settings",
  "risk": "low",
  "steps": [{"op":"OpenApp", "app":"settings"}]
}

Input: "launch word"
Output:
{
  "task": "Launch Microsoft Word",
  "risk": "low",
  "steps": [{"op":"OpenApp", "app":"word"}]
}

Now convert the user's instruction into a JSON plan. Return ONLY the JSON, nothing else.`;
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

