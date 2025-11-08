/**
 * Message Executor
 * Sends messages via email (Outlook/Gmail) and Slack
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface MessageStep {
  op: "Message";
  target: string;  // Email address, Slack user, etc.
  text: string;
}

/**
 * Execute Message command
 */
export async function executeMessage(step: MessageStep): Promise<string> {
  console.log(`[EXECUTOR:Message] Sending to ${step.target}: ${step.text}`);
  
  try {
    // Determine message type based on target
    if (step.target.includes("@")) {
      // Email address - open in default mail client
      return await sendEmail(step.target, step.text);
    } else {
      // Assume Slack username or other messaging
      return await sendSlackMessage(step.target, step.text);
    }
  } catch (error: any) {
    console.error(`[EXECUTOR:Message] Error:`, error.message);
    throw new Error(`Failed to send message: ${error.message}`);
  }
}

/**
 * Send email using default mail client
 */
async function sendEmail(to: string, body: string, subject?: string): Promise<string> {
  const subjectParam = subject || "Message from PersonaForge";
  const mailto = `mailto:${to}?subject=${encodeURIComponent(subjectParam)}&body=${encodeURIComponent(body)}`;
  
  // Open mailto link in default mail client
  await execAsync(`start "${mailto}"`);
  
  return `Opened email to ${to}`;
}

/**
 * Send Slack message
 * Note: Requires SLACK_BOT_TOKEN in environment for API method
 * Otherwise, opens Slack app with UI automation hint
 */
async function sendSlackMessage(user: string, text: string): Promise<string> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  
  if (slackToken) {
    // TODO: Implement Slack API call when token is available
    // For now, fall back to UI automation
    return await sendSlackViaUI(user, text);
  } else {
    return await sendSlackViaUI(user, text);
  }
}

/**
 * Send Slack message via UI automation
 */
async function sendSlackViaUI(user: string, text: string): Promise<string> {
  // Open Slack
  await execAsync("start slack");
  
  // Wait for Slack to open
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Use keyboard shortcuts to search and send
  const ps = `
    $wshell = New-Object -ComObject wscript.shell
    Start-Sleep -Milliseconds 1000
    $wshell.SendKeys("^k")  # Ctrl+K to open quick switcher
    Start-Sleep -Milliseconds 500
    $wshell.SendKeys("${user}")
    Start-Sleep -Milliseconds 500
    $wshell.SendKeys("{ENTER}")
    Start-Sleep -Milliseconds 500
    $wshell.SendKeys("${text.replace(/"/g, '""')}")
    Start-Sleep -Milliseconds 300
    $wshell.SendKeys("{ENTER}")
  `;
  
  await execAsync(`powershell -Command "${ps.replace(/\n/g, " ")}"`);
  
  return `Sent Slack message to ${user}`;
}

/**
 * Open Gmail compose window
 */
export async function openGmailCompose(to?: string, subject?: string, body?: string): Promise<string> {
  let url = "https://mail.google.com/mail/?view=cm&fs=1";
  
  if (to) url += `&to=${encodeURIComponent(to)}`;
  if (subject) url += `&su=${encodeURIComponent(subject)}`;
  if (body) url += `&body=${encodeURIComponent(body)}`;
  
  await execAsync(`start "${url}"`);
  
  return `Opened Gmail compose`;
}

/**
 * Open Outlook
 */
export async function openOutlook(to?: string): Promise<string> {
  if (to) {
    await execAsync(`start outlook:?to=${encodeURIComponent(to)}`);
    return `Opened Outlook to compose email to ${to}`;
  } else {
    await execAsync("start outlook");
    return `Opened Outlook`;
  }
}

