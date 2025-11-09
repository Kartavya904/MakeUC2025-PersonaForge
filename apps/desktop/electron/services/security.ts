/**
 * Security Service - External Security Layer for PersonaForge
 * 
 * Provides comprehensive security for voice assistant operations:
 * - Action validation and sanitization
 * - Whitelisting/blacklisting
 * - Rate limiting
 * - Permission checks
 * - Audit logging
 * - Kill switch
 */

import { createHash, randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types
export type RiskLevel = 'low' | 'medium' | 'high';
export type Operation = 'OpenApp' | 'Navigate' | 'Type' | 'Click' | 'Shortcut' | 'SystemSetting' | 'Message' | 'Confirm' | 'Wait';

export interface TaskStep {
  op: Operation;
  target?: string;
  app?: string;
  text?: string;
  keys?: string[];
  value?: string;
}

export interface TaskPlan {
  task: string;
  risk: RiskLevel;
  steps: TaskStep[];
}

export interface SecurityConfig {
  requireApprovalForMedium: boolean;
  requireApprovalForHigh: boolean;
  requirePinForHigh: boolean;
  maxActionsPerMinute: number;
  enableWhitelist: boolean;
  enableBlacklist: boolean;
  enableAuditLog: boolean;
  killSwitchEnabled: boolean;
}

export interface AuditLogEntry {
  timestamp: number;
  action: string;
  risk: RiskLevel;
  userInput: string;
  plan: TaskPlan;
  approved: boolean;
  executed: boolean;
  error?: string;
  hash: string;
  prevHash?: string;
}

export interface SecurityResult {
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
  requiresPin?: boolean;
}

// Default security configuration
const DEFAULT_CONFIG: SecurityConfig = {
  requireApprovalForMedium: true,
  requireApprovalForHigh: true,
  requirePinForHigh: false, // Can be enabled for extra security
  maxActionsPerMinute: 10,
  enableWhitelist: true,
  enableBlacklist: true,
  enableAuditLog: true,
  killSwitchEnabled: true,
};

// Whitelist of safe operations (allowed without approval)
const SAFE_OPERATIONS: Operation[] = ['Confirm', 'Wait'];

// Whitelist of safe apps (can be opened without approval)
const SAFE_APPS: string[] = [
  'ms-settings:',
  'notepad',
  'calc',
  'mspaint',
  'explorer',
];

// Blacklist of dangerous operations (always blocked)
const DANGEROUS_PATTERNS: RegExp[] = [
  /rm\s+-rf/i,
  /del\s+\/s/i,
  /format\s+/i,
  /shutdown/i,
  /restart/i,
  /reg\s+delete/i,
  /net\s+user/i,
  /wmic\s+process/i,
];

// Dangerous system settings that should be blocked
const DANGEROUS_SETTINGS: string[] = [
  'system.shutdown',
  'system.restart',
  'network.firewall.disable',
  'security.antivirus.disable',
  'user.delete',
  'system.format',
];

export class SecurityService {
  private config: SecurityConfig;
  private auditLogPath: string;
  private actionHistory: Array<{ timestamp: number; action: string }> = [];
  private killSwitchActive: boolean = false;
  private lastAuditHash: string | null = null;
  private whitelist: Set<string> = new Set();
  private blacklist: Set<string> = new Set();

  constructor(config?: Partial<SecurityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Setup audit log directory
    const logDir = path.join(__dirname, '../../security-logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.auditLogPath = path.join(logDir, `audit-${new Date().toISOString().split('T')[0]}.jsonl`);
    
    // Load whitelist/blacklist if they exist
    this.loadLists();
  }

  /**
   * Validate and sanitize a task plan before execution
   */
  validateTaskPlan(plan: TaskPlan, userInput: string): SecurityResult {
    // Check kill switch
    if (this.killSwitchActive) {
      return {
        allowed: false,
        reason: 'Kill switch is active. All actions are blocked.',
      };
    }

    // Validate plan structure
    if (!plan || !plan.task || !plan.steps || !Array.isArray(plan.steps)) {
      return {
        allowed: false,
        reason: 'Invalid task plan structure',
      };
    }

    // Check rate limiting
    const rateLimitResult = this.checkRateLimit();
    if (!rateLimitResult.allowed) {
      return rateLimitResult;
    }

    // Validate each step
    for (const step of plan.steps) {
      const stepResult = this.validateStep(step, userInput);
      if (!stepResult.allowed) {
        return stepResult;
      }
    }

    // Check if approval is required based on risk level
    const requiresApproval = 
      (plan.risk === 'medium' && this.config.requireApprovalForMedium) ||
      (plan.risk === 'high' && this.config.requireApprovalForHigh);

    const requiresPin = plan.risk === 'high' && this.config.requirePinForHigh;

    return {
      allowed: true,
      requiresApproval,
      requiresPin,
    };
  }

  /**
   * Validate a single step
   */
  private validateStep(step: TaskStep, userInput: string): SecurityResult {
    // Check for dangerous patterns in user input
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(userInput)) {
        return {
          allowed: false,
          reason: `Dangerous command pattern detected: ${pattern}`,
        };
      }
    }

    // Validate operation type
    if (!step.op || typeof step.op !== 'string') {
      return {
        allowed: false,
        reason: 'Invalid operation type',
      };
    }

    // Check blacklist
    if (this.config.enableBlacklist && this.blacklist.has(step.op)) {
      return {
        allowed: false,
        reason: `Operation "${step.op}" is blacklisted`,
      };
    }

    // Check whitelist (if enabled)
    if (this.config.enableWhitelist && !SAFE_OPERATIONS.includes(step.op)) {
      if (this.whitelist.size > 0 && !this.whitelist.has(step.op)) {
        return {
          allowed: false,
          reason: `Operation "${step.op}" is not whitelisted`,
        };
      }
    }

    // Operation-specific validation
    switch (step.op) {
      case 'OpenApp':
        return this.validateOpenApp(step);
      
      case 'SystemSetting':
        return this.validateSystemSetting(step);
      
      case 'Message':
        return this.validateMessage(step);
      
      case 'Type':
        return this.validateType(step);
      
      case 'Shortcut':
        return this.validateShortcut(step);
      
      case 'Navigate':
      case 'Click':
      case 'Confirm':
      case 'Wait':
        return { allowed: true };
      
      default:
        return {
          allowed: false,
          reason: `Unknown operation: ${step.op}`,
        };
    }
  }

  /**
   * Validate OpenApp operation
   */
  private validateOpenApp(step: TaskStep): SecurityResult {
    if (!step.app) {
      return {
        allowed: false,
        reason: 'OpenApp requires an app name',
      };
    }

    // Sanitize app name
    const appName = step.app.toLowerCase().trim();
    
    // Check for command injection attempts
    if (appName.includes(';') || appName.includes('|') || appName.includes('&') || appName.includes('`')) {
      return {
        allowed: false,
        reason: 'Invalid characters in app name (potential command injection)',
      };
    }

    // Check if app is in safe list
    if (SAFE_APPS.includes(appName)) {
      return { allowed: true };
    }

    // For other apps, require approval if not whitelisted
    return { allowed: true, requiresApproval: true };
  }

  /**
   * Validate SystemSetting operation
   */
  private validateSystemSetting(step: TaskStep): SecurityResult {
    if (!step.target) {
      return {
        allowed: false,
        reason: 'SystemSetting requires a target',
      };
    }

    // Check for dangerous settings
    const target = step.target.toLowerCase();
    for (const dangerous of DANGEROUS_SETTINGS) {
      if (target.includes(dangerous.toLowerCase())) {
        return {
          allowed: false,
          reason: `Dangerous system setting blocked: ${step.target}`,
        };
      }
    }

    // Validate value if present
    if (step.value) {
      // Sanitize value
      const value = String(step.value);
      if (value.includes(';') || value.includes('|') || value.includes('&')) {
        return {
          allowed: false,
          reason: 'Invalid characters in setting value (potential command injection)',
        };
      }
    }

    return { allowed: true, requiresApproval: true };
  }

  /**
   * Validate Message operation
   */
  private validateMessage(step: TaskStep): SecurityResult {
    if (!step.target || !step.text) {
      return {
        allowed: false,
        reason: 'Message requires both target and text',
      };
    }

    // Sanitize message text
    const text = String(step.text);
    if (text.length > 1000) {
      return {
        allowed: false,
        reason: 'Message text too long (max 1000 characters)',
      };
    }

    // Messages are always high risk - require approval
    return { allowed: true, requiresApproval: true };
  }

  /**
   * Validate Type operation
   */
  private validateType(step: TaskStep): SecurityResult {
    if (!step.text) {
      return {
        allowed: false,
        reason: 'Type operation requires text',
      };
    }

    // Check for dangerous patterns in typed text
    const text = String(step.text);
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(text)) {
        return {
          allowed: false,
          reason: 'Dangerous command pattern detected in typed text',
        };
      }
    }

    return { allowed: true, requiresApproval: step.text.length > 50 };
  }

  /**
   * Validate Shortcut operation
   */
  private validateShortcut(step: TaskStep): SecurityResult {
    if (!step.keys || !Array.isArray(step.keys)) {
      return {
        allowed: false,
        reason: 'Shortcut requires an array of keys',
      };
    }

    // Block dangerous shortcuts
    const keys = step.keys.map(k => k.toLowerCase());
    const keyCombo = keys.join('+');
    
    // Block system shutdown shortcuts
    if (keys.includes('alt') && keys.includes('f4')) {
      return {
        allowed: false,
        reason: 'Alt+F4 shortcut is blocked for security',
      };
    }

    // Block task manager (Ctrl+Shift+Esc) - could be used maliciously
    if (keys.includes('ctrl') && keys.includes('shift') && keys.includes('esc')) {
      return {
        allowed: false,
        reason: 'Task Manager shortcut is blocked for security',
      };
    }

    return { allowed: true, requiresApproval: true };
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(): SecurityResult {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove old entries
    this.actionHistory = this.actionHistory.filter(
      entry => entry.timestamp > oneMinuteAgo
    );

    // Check if limit exceeded
    if (this.actionHistory.length >= this.config.maxActionsPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${this.config.maxActionsPerMinute} actions per minute`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record an action for rate limiting
   */
  recordAction(action: string): void {
    this.actionHistory.push({
      timestamp: Date.now(),
      action,
    });
  }

  /**
   * Log an action to audit log
   */
  async logAction(
    userInput: string,
    plan: TaskPlan,
    approved: boolean,
    executed: boolean,
    error?: string
  ): Promise<void> {
    if (!this.config.enableAuditLog) return;

    const entry: AuditLogEntry = {
      timestamp: Date.now(),
      action: plan.task,
      risk: plan.risk,
      userInput,
      plan,
      approved,
      executed,
      error,
      hash: this.generateHash(plan, userInput),
      prevHash: this.lastAuditHash || undefined,
    };

    this.lastAuditHash = entry.hash;

    // Append to audit log file
    const logLine = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.auditLogPath, logLine, 'utf-8');
  }

  /**
   * Generate hash for audit chain
   */
  private generateHash(plan: TaskPlan, userInput: string): string {
    const data = JSON.stringify({ plan, userInput, timestamp: Date.now() });
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Activate kill switch
   */
  activateKillSwitch(): void {
    this.killSwitchActive = true;
    console.log('[SECURITY] Kill switch activated - all actions blocked');
  }

  /**
   * Deactivate kill switch
   */
  deactivateKillSwitch(): void {
    this.killSwitchActive = false;
    console.log('[SECURITY] Kill switch deactivated');
  }

  /**
   * Check if kill switch is active
   */
  isKillSwitchActive(): boolean {
    return this.killSwitchActive;
  }

  /**
   * Update security configuration
   */
  updateConfig(config: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  /**
   * Load whitelist and blacklist from files
   */
  private loadLists(): void {
    const listsDir = path.join(__dirname, '../../security-lists');
    if (!fs.existsSync(listsDir)) {
      fs.mkdirSync(listsDir, { recursive: true });
      return;
    }

    // Load whitelist
    const whitelistPath = path.join(listsDir, 'whitelist.json');
    if (fs.existsSync(whitelistPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(whitelistPath, 'utf-8'));
        this.whitelist = new Set(data.operations || []);
      } catch (err) {
        console.error('[SECURITY] Failed to load whitelist:', err);
      }
    }

    // Load blacklist
    const blacklistPath = path.join(listsDir, 'blacklist.json');
    if (fs.existsSync(blacklistPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(blacklistPath, 'utf-8'));
        this.blacklist = new Set(data.operations || []);
      } catch (err) {
        console.error('[SECURITY] Failed to load blacklist:', err);
      }
    }
  }

  /**
   * Get audit log entries
   */
  getAuditLogs(limit: number = 100): AuditLogEntry[] {
    if (!fs.existsSync(this.auditLogPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(this.auditLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      const entries = lines
        .map(line => {
          try {
            return JSON.parse(line) as AuditLogEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is AuditLogEntry => entry !== null)
        .slice(-limit);
      
      return entries.reverse(); // Most recent first
    } catch (err) {
      console.error('[SECURITY] Failed to read audit log:', err);
      return [];
    }
  }
}

// Singleton instance
let securityServiceInstance: SecurityService | null = null;

/**
 * Get or create security service instance
 */
export function getSecurityService(): SecurityService {
  if (!securityServiceInstance) {
    securityServiceInstance = new SecurityService();
  }
  return securityServiceInstance;
}

