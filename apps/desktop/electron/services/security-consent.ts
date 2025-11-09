/**
 * Security Consent Service
 * Handles user consent prompts for risky operations
 */

import { BrowserWindow, dialog } from 'electron';
import { SecurityService, TaskPlan, SecurityResult } from './security.js';

export interface ConsentResult {
  approved: boolean;
  pinVerified?: boolean;
}

export class SecurityConsentService {
  private securityService: SecurityService;
  private pendingConsents: Map<string, { resolve: (result: ConsentResult) => void; reject: (err: Error) => void }> = new Map();

  constructor(securityService: SecurityService) {
    this.securityService = securityService;
  }

  /**
   * Request user consent for a task plan
   */
  async requestConsent(
    plan: TaskPlan,
    userInput: string,
    window?: BrowserWindow
  ): Promise<ConsentResult> {
    const validation = this.securityService.validateTaskPlan(plan, userInput);
    
    // If approval not required, auto-approve
    if (!validation.requiresApproval) {
      return { approved: true };
    }

    // If PIN required, show PIN dialog
    if (validation.requiresPin) {
      return await this.requestPinConsent(plan, window);
    }

    // Show approval dialog
    return await this.requestApprovalConsent(plan, userInput, window);
  }

  /**
   * Request approval via dialog
   */
  private async requestApprovalConsent(
    plan: TaskPlan,
    userInput: string,
    window?: BrowserWindow
  ): Promise<ConsentResult> {
    const message = this.buildConsentMessage(plan, userInput);
    
    if (!window) {
      // If no window, default to blocking
      console.warn('[SECURITY] No window available for consent, blocking action');
      return { approved: false };
    }

    try {
      const result = await dialog.showMessageBox(window, {
        type: 'question',
        buttons: ['Approve', 'Deny'],
        defaultId: 1, // Default to Deny for safety
        cancelId: 1,
        title: 'Security Approval Required',
        message: 'Action requires your approval',
        detail: message,
        noLink: true,
      });

      return {
        approved: result.response === 0, // 0 = Approve, 1 = Deny
      };
    } catch (err) {
      console.error('[SECURITY] Error showing consent dialog:', err);
      return { approved: false };
    }
  }

  /**
   * Request PIN verification
   */
  private async requestPinConsent(
    plan: TaskPlan,
    window?: BrowserWindow
  ): Promise<ConsentResult> {
    // For now, we'll use a simple dialog. In production, you'd want a proper PIN input
    if (!window) {
      return { approved: false };
    }

    try {
      const result = await dialog.showMessageBox(window, {
        type: 'question',
        buttons: ['Approve with PIN', 'Deny'],
        defaultId: 1,
        cancelId: 1,
        title: 'PIN Verification Required',
        message: 'High-risk action requires PIN verification',
        detail: `Task: ${plan.task}\n\nThis is a high-risk operation. Please verify your PIN to proceed.`,
        noLink: true,
      });

      // TODO: Implement actual PIN verification
      // For now, if user clicks "Approve with PIN", we'll approve
      // In production, show a PIN input dialog and verify against stored hash
      return {
        approved: result.response === 0,
        pinVerified: result.response === 0,
      };
    } catch (err) {
      console.error('[SECURITY] Error showing PIN dialog:', err);
      return { approved: false };
    }
  }

  /**
   * Build consent message
   */
  private buildConsentMessage(plan: TaskPlan, userInput: string): string {
    const riskEmoji = {
      low: '🟢',
      medium: '🟡',
      high: '🔴',
    }[plan.risk];

    return `${riskEmoji} Risk Level: ${plan.risk.toUpperCase()}\n\n` +
           `Task: ${plan.task}\n\n` +
           `User Input: "${userInput}"\n\n` +
           `Steps to execute:\n${plan.steps.map((s, i) => `  ${i + 1}. ${s.op}${s.target ? ` (${s.target})` : ''}`).join('\n')}\n\n` +
           `Do you want to approve this action?`;
  }
}

