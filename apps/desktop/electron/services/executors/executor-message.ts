/**
 * Message Executor - SIMPLIFIED VERSION
 * Send emails and messages
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface MessageStep {
  op: "Message";
  target: string;
  text: string;
}

/**
 * Execute Message command - SIMPLE
 */
export async function executeMessage(step: MessageStep): Promise<string> {
  console.log(`[EXECUTOR:Message] To: ${step.target}`);
  
  try {
    // Check if it's an email
    if (step.target.includes("@")) {
      return await sendEmail(step.target, step.text);
    } else {
      // Try to open messaging app
      return await openMessagingApp(step.target, step.text);
    }
  } catch (error: any) {
    throw new Error(`Failed to send message: ${error.message}`);
  }
}

/**
 * Send email using mailto: link
 */
async function sendEmail(to: string, body: string): Promise<string> {
  const subject = "Message from PersonaForge";
  const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  
  await execAsync(`cmd /c start "" "${mailto}"`, {
    windowsHide: true,
    timeout: 3000
  });
  
  return `Opened email to ${to}`;
}

/**
 * Open messaging app (Slack, Teams, etc.)
 */
async function openMessagingApp(user: string, text: string): Promise<string> {
  // Try to open Slack first
  try {
    await execAsync(`cmd /c start slack://`, {
      windowsHide: true,
      timeout: 3000
    });
    return `Opened Slack (message ${user}: "${text}")`;
  } catch {
    // Fallback: just return the info
    return `Message for ${user}: "${text}" (open Slack/Teams manually)`;
  }
}
