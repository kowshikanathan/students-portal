/**
 * DODO.FINANCE — Future-Ready eNACH Provider Abstraction
 * Currently adapts exclusively to `sandbox_enach`. Live providers remain strictly disabled.
 */

import type {
  SandboxMandate,
  SandboxDebitAttempt,
  MandateStatus,
  DebitStatus,
  AuthMethod,
} from './types';

export interface CreateMandateRequest {
  tenantId: string;
  studentId: string;
  studentName: string;
  accountReference: string;
  payerName: string;
  payerPhone: string;
  payerEmail: string;
  bankName: string;
  maskedAccount: string;
  ifscCode: string;
  feePlan: string;
  maxAmountMinor: number;
  frequency: 'monthly' | 'bi-monthly' | 'quarterly' | 'as_presented';
  startDate: string;
  endDate: string;
  authMode: AuthMethod;
}

export interface CreateMandateResponse {
  success: boolean;
  mandateReference: string;
  status: MandateStatus;
  authUrl?: string;
  error?: string;
}

export interface SubmitDebitRequest {
  tenantId: string;
  mandateId: string;
  mandateReference: string;
  studentId: string;
  studentName: string;
  accountReference: string;
  payerName: string;
  payerPhone: string;
  installmentId: string;
  installmentName: string;
  amountMinor: number;
  scheduledDate: string;
  simulationOutcome?: 'auto' | 'force_fail' | 'force_success';
}

export interface SubmitDebitResponse {
  success: boolean;
  debitAttemptId: string;
  providerReference: string;
  status: DebitStatus;
  failureCode?: string;
  failureReason?: string;
}

export interface ProviderCapabilityMatrix {
  providerId: 'sandbox_enach' | 'live_npci_enach';
  displayName: string;
  isLive: boolean;
  capabilities: {
    createMandate: boolean;
    simulateAuthorization: boolean;
    submitScheduledDebit: boolean;
    instantDebitInquiry: boolean;
    cancelMandate: boolean;
    webhookCallbacks: boolean;
    liveBankClearing: boolean;
  };
  railVersion: string;
  clearingCycle: string;
  operationalStatus: 'operational' | 'degraded' | 'maintenance' | 'disabled';
  liveActivationPrerequisites: string[];
}

export const CURRENT_PROVIDER_METRICS: ProviderCapabilityMatrix = {
  providerId: 'sandbox_enach',
  displayName: 'NPCI National Automated Clearing House / Sandbox eNACH Rail',
  isLive: false,
  capabilities: {
    createMandate: true,
    simulateAuthorization: true,
    submitScheduledDebit: true,
    instantDebitInquiry: false, // Live inquiry disabled
    cancelMandate: true,
    webhookCallbacks: true,
    liveBankClearing: false, // Strictly simulation
  },
  railVersion: 'NPCI eNACH API Spec v2.1 (Sandbox Mode)',
  clearingCycle: 'T+1 Simulated Clearing at 09:00 IST',
  operationalStatus: 'operational',
  liveActivationPrerequisites: [
    'Approved NPCI / RBI Sponsoring Member Bank Agreement',
    'Certified Production Utility Code & Credential Whitelisting',
    'Hardware Security Module (HSM) or secure Vault token storage',
    'Dual-factor cryptographic signature on mandate authorization webhooks',
    'Formal Board-level authorization for live payment collection',
  ],
};

/**
 * Adapter interface required for any future live eNACH provider
 */
export interface EnachProviderAdapter {
  providerId: string;
  getCapabilities(): ProviderCapabilityMatrix;
  createMandate(req: CreateMandateRequest): Promise<CreateMandateResponse>;
  simulateAuthorization(
    mandateReference: string,
    action: 'approve' | 'reject',
    method: AuthMethod,
    bankName: string,
  ): Promise<{ status: MandateStatus; reason?: string }>;
  submitDebit(req: SubmitDebitRequest): Promise<SubmitDebitResponse>;
  cancelMandate(mandateReference: string, reason: string): Promise<{ success: boolean }>;
  verifyWebhook(payload: unknown, signature: string): Promise<boolean>;
}

/**
 * Sandbox Adapter Implementation
 */
export class SandboxEnachAdapter implements EnachProviderAdapter {
  readonly providerId = 'sandbox_enach';

  getCapabilities(): ProviderCapabilityMatrix {
    return CURRENT_PROVIDER_METRICS;
  }

  async createMandate(req: CreateMandateRequest): Promise<CreateMandateResponse> {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const mandateReference = `UMRN-SBX-2026-${randomSuffix}`;

    return {
      success: true,
      mandateReference,
      status: 'pending_authorization',
    };
  }

  async simulateAuthorization(
    mandateReference: string,
    action: 'approve' | 'reject',
    method: AuthMethod,
    bankName: string,
  ): Promise<{ status: MandateStatus; reason?: string }> {
    if (action === 'approve') {
      return { status: 'active' };
    }
    return {
      status: 'rejected',
      reason: `Customer declined sandbox authorization via ${method} (${bankName})`,
    };
  }

  async submitDebit(req: SubmitDebitRequest): Promise<SubmitDebitResponse> {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const debitAttemptId = `deb-sbx-${Date.now().toString().slice(-6)}`;
    const providerReference = `DEB-SBX-2026-${randomSuffix}`;

    if (req.simulationOutcome === 'force_fail') {
      return {
        success: false,
        debitAttemptId,
        providerReference,
        status: 'failed',
        failureCode: 'NPCI-05',
        failureReason: 'Insufficient funds in payer bank account (Simulated NPCI-05)',
      };
    }

    return {
      success: true,
      debitAttemptId,
      providerReference,
      status: 'succeeded',
    };
  }

  async cancelMandate(mandateReference: string, reason: string): Promise<{ success: boolean }> {
    return { success: true };
  }

  async verifyWebhook(payload: unknown, signature: string): Promise<boolean> {
    return Boolean(signature && signature.startsWith('sbx_sig_'));
  }
}

export const sandboxEnachProvider = new SandboxEnachAdapter();
