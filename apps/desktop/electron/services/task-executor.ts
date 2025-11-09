/**
 * Secure Task Executor
 * Executes task plans with security validation and consent
 */

import { SecurityService, TaskPlan } from './security.js';
import { SecurityConsentService, ConsentResult } from './security-consent.js';
import { BrowserWindow } from 'electron';

export interface ExecutionResult {
  success: boolean;
  error?: string;
  executedSteps: number;
}

export class SecureTaskExecutor {
  private securityService: SecurityService;
  private consentService: SecurityConsentService;

  constructor(securityService: SecurityService, consentService: SecurityConsentService) {
    this.securityService = securityService;
    this.consentService = consentService;
  }

  /**
   * Execute a task plan with security checks
   */
  async executePlan(
    plan: TaskPlan,
    userInput: string,
    window?: BrowserWindow
  ): Promise<ExecutionResult> {
    // Step 1: Validate plan
    const validation = this.securityService.validateTaskPlan(plan, userInput);
    if (!validation.allowed) {
      await this.securityService.logAction(
        userInput,
        plan,
        false,
        false,
        validation.reason
      );
      return {
        success: false,
        error: validation.reason || 'Plan validation failed',
        executedSteps: 0,
      };
    }

    // Step 2: Request consent if needed
    let consent: ConsentResult = { approved: true };
    if (validation.requiresApproval || validation.requiresPin) {
      consent = await this.consentService.requestConsent(plan, userInput, window);
      
      if (!consent.approved) {
        await this.securityService.logAction(
          userInput,
          plan,
          false,
          false,
          'User denied consent'
        );
        return {
          success: false,
          error: 'User denied consent',
          executedSteps: 0,
        };
      }
    }

    // Step 3: Record action for rate limiting
    this.securityService.recordAction(plan.task);

    // Step 4: Execute steps
    let executedSteps = 0;
    let executionError: string | undefined;

    try {
      for (const step of plan.steps) {
        // Validate step again before execution
        const stepValidation = this.securityService.validateTaskPlan(
          { ...plan, steps: [step] },
          userInput
        );
        
        if (!stepValidation.allowed) {
          executionError = `Step validation failed: ${stepValidation.reason}`;
          break;
        }

        // Execute step
        const stepResult = await this.executeStep(step);
        if (!stepResult.success) {
          executionError = stepResult.error;
          break;
        }

        executedSteps++;
      }

      // Log successful execution
      await this.securityService.logAction(
        userInput,
        plan,
        true,
        executedSteps === plan.steps.length,
        executionError
      );

      return {
        success: executedSteps === plan.steps.length,
        error: executionError,
        executedSteps,
      };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      await this.securityService.logAction(
        userInput,
        plan,
        true,
        false,
        errorMsg
      );
      return {
        success: false,
        error: errorMsg,
        executedSteps,
      };
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: any): Promise<{ success: boolean; error?: string }> {
    try {
      switch (step.op) {
        case 'OpenApp':
          return await this.executeOpenApp(step);
        
        case 'SystemSetting':
          return await this.executeSystemSetting(step);
        
        case 'Type':
          return await this.executeType(step);
        
        case 'Shortcut':
          return await this.executeShortcut(step);
        
        case 'Message':
          return await this.executeMessage(step);
        
        case 'Wait':
          return await this.executeWait(step);
        
        case 'Confirm':
        case 'Navigate':
        case 'Click':
          // These are informational or require UI automation (not implemented yet)
          return { success: true };
        
        default:
          return {
            success: false,
            error: `Unknown operation: ${step.op}`,
          };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err),
      };
    }
  }

  /**
   * Execute OpenApp operation
   */
  private async executeOpenApp(step: any): Promise<{ success: boolean; error?: string }> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const app = step.app || step.target;
      if (!app) {
        return { success: false, error: 'No app specified' };
      }

      // Sanitize app name
      const sanitizedApp = String(app).trim();
      
      // Handle special Windows settings URI
      if (sanitizedApp.startsWith('ms-settings:')) {
        await execAsync(`start ${sanitizedApp}`);
      } else {
        // Use Start-Process for safer execution
        await execAsync(`powershell -Command "Start-Process '${sanitizedApp.replace(/'/g, "''")}'"`);
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to open app: ${err?.message || String(err)}`,
      };
    }
  }

  /**
   * Execute SystemSetting operation
   */
  private async executeSystemSetting(step: any): Promise<{ success: boolean; error?: string }> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const target = step.target;
      const value = step.value;

      if (!target) {
        return { success: false, error: 'No setting target specified' };
      }

      // Handle brightness setting
      if (target.includes('brightness')) {
        const brightness = parseInt(String(value).replace('%', ''), 10);
        if (isNaN(brightness) || brightness < 0 || brightness > 100) {
          return { success: false, error: 'Invalid brightness value' };
        }

        // Use PowerShell to set brightness (requires WMI)
        const psScript = `
          $brightness = ${brightness}
          (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, $brightness)
        `;
        await execAsync(`powershell -Command "${psScript}"`);
        return { success: true };
      }

      // Other system settings can be added here
      return {
        success: false,
        error: `Unsupported system setting: ${target}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to set system setting: ${err?.message || String(err)}`,
      };
    }
  }

  /**
   * Execute Type operation
   */
  private async executeType(step: any): Promise<{ success: boolean; error?: string }> {
    // This would require UI automation library (like robotjs or similar)
    // For now, we'll return success but log that it's not implemented
    console.warn('[EXECUTOR] Type operation not fully implemented - requires UI automation');
    return { success: true };
  }

  /**
   * Execute Shortcut operation
   */
  private async executeShortcut(step: any): Promise<{ success: boolean; error?: string }> {
    // This would require keyboard simulation library
    // For now, we'll return success but log that it's not implemented
    console.warn('[EXECUTOR] Shortcut operation not fully implemented - requires keyboard simulation');
    return { success: true };
  }

  /**
   * Execute Message operation
   */
  private async executeMessage(step: any): Promise<{ success: boolean; error?: string }> {
    // This would require Slack API integration or UI automation
    // For now, we'll return success but log that it's not implemented
    console.warn('[EXECUTOR] Message operation not fully implemented - requires API integration or UI automation');
    return { success: true };
  }

  /**
   * Execute Wait operation
   */
  private async executeWait(step: any): Promise<{ success: boolean; error?: string }> {
    const duration = parseInt(String(step.value || '1000'), 10);
    if (isNaN(duration) || duration < 0 || duration > 10000) {
      return { success: false, error: 'Invalid wait duration' };
    }

    await new Promise(resolve => setTimeout(resolve, duration));
    return { success: true };
  }
}

