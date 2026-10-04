import { describe, expect, it } from 'vitest';
import {
  adaptCaughtError,
  adaptDepositSuccess,
  adaptErrorPayload,
  adaptPositionList,
  adaptTransactionPage,
  adaptWithdrawSuccess,
  API_ERROR_KIND,
  ContractApiError,
} from '../../src/services/apiAdapter.js';
import {
  authorizationError,
  depositSuccess,
  positionList,
  providerFailure,
  terminalError,
  transactionsPage,
  validationError,
  withdrawFailed,
  withdrawPending,
} from '../../src/contracts/fixtures/index.js';

describe('apiAdapter', () => {
  it('honors an explicit provider retry veto without changing its kind or correlation', () => {
    const payload = structuredClone(providerFailure);
    payload.error.details = { ...payload.error.details, retryable: false };
    expect(adaptErrorPayload(payload)).toMatchObject({
      kind: API_ERROR_KIND.PROVIDER,
      retryable: false,
      requestId: providerFailure.error.requestId,
    });

    delete payload.error.details;
    expect(adaptErrorPayload(payload).retryable).toBe(true);
  });

  it('does not let a retry hint enable retries for non-provider error kinds', () => {
    for (const fixture of [validationError, authorizationError, terminalError]) {
      const payload = structuredClone(fixture);
      payload.error.details = { retryable: true };
      const adapted = adaptErrorPayload(payload);
      expect(adapted.kind).toBe(adaptErrorPayload(fixture).kind);
      expect(adapted.retryable).toBe(false);
      expect(adapted).not.toHaveProperty('details');
    }
  });

  it('maps validation / authorization / provider / terminal fixtures to UI kinds', () => {
    expect(adaptErrorPayload(validationError).kind).toBe(API_ERROR_KIND.VALIDATION);
    expect(adaptErrorPayload(authorizationError).kind).toBe(API_ERROR_KIND.AUTHORIZATION);
    expect(adaptErrorPayload(providerFailure)).toMatchObject({
      kind: API_ERROR_KIND.PROVIDER,
      retryable: true,
      requestId: 'req_fixture_provider_001',
    });
    expect(adaptErrorPayload(terminalError)).toMatchObject({
      kind: API_ERROR_KIND.TERMINAL,
      retryable: false,
      requestId: 'req_fixture_terminal_001',
    });
  });

  it('never leaks raw details arrays or JSON into the UI message', () => {
    const adapted = adaptErrorPayload(validationError);
    expect(adapted.message).not.toMatch(/vaultId is required/);
    expect(adapted.message).not.toMatch(/\[/);
    expect(adapted).not.toHaveProperty('details');
    expect(JSON.stringify(adapted)).not.toContain('vaultId is required');
  });

  it('parses precision-safe numeric fields from deposit and position fixtures', () => {
    const deposit = adaptDepositSuccess(depositSuccess);
    expect(deposit.position.shares).toBe(1000);
    expect(deposit.position.value).toBe(1000);
    expect(deposit.status).toBe('confirmed');

    const positions = adaptPositionList(positionList, {
      vault_fixture_001: 'USDC',
    });
    expect(positions.count).toBe(1);
    expect(positions.positions[0]).toMatchObject({
      vaultId: 'vault_fixture_001',
      asset: 'USDC',
      shares: 1000,
      value: 1000,
      earned: 0,
    });
  });

  it('exposes pagination and correlation metadata from transaction pages', () => {
    const page = adaptTransactionPage(transactionsPage);
    expect(page.pagination).toEqual({
      total: 2,
      limit: 20,
      offset: 0,
      hasMore: false,
    });
    expect(page.transactions[0].correlationId).toBe('tx_fixture_deposit_001');
    expect(page.transactions[1].assets).toBe(125.125);
  });

  it('classifies pending and failed withdraw fixtures', () => {
    expect(adaptWithdrawSuccess(withdrawPending).kind).toBe(API_ERROR_KIND.PENDING);
    expect(adaptWithdrawSuccess(withdrawFailed).kind).toBe(API_ERROR_KIND.TERMINAL);
  });

  it('ContractApiError carries adapted UI fields without exposing details', () => {
    const err = new ContractApiError(providerFailure);
    expect(err).toBeInstanceOf(Error);
    expect(err.adapted.kind).toBe(API_ERROR_KIND.PROVIDER);
    expect(err.message).not.toContain('retryable');
    expect(adaptCaughtError(err)).toBe(err.adapted);
  });

  it.each([10.1234567, 1e-7])('rejects over-precision amount %s with actionable diagnostics', (amount) => {
    const bad = structuredClone(depositSuccess);
    bad.tx.amount = amount;
    expect(() => adaptDepositSuccess(bad)).toThrow(/tx\.amount/);
  });
});
