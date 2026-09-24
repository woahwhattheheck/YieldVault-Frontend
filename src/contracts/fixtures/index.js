import validationError from './validation-error.json';
import authorizationError from './authorization-error.json';
import providerFailure from './provider-failure.json';
import terminalError from './terminal-error.json';
import depositSuccess from './deposit-success.json';
import withdrawPending from './withdraw-pending.json';
import withdrawFailed from './withdraw-failed.json';
import positionList from './position-list.json';
import transactionsPage from './transactions-page.json';
import vaultList from './vault-list.json';

/** Checked-in API contract fixtures (aligned with YieldVault-Backend v1). */
export const fixtures = Object.freeze({
  validationError,
  authorizationError,
  providerFailure,
  terminalError,
  depositSuccess,
  withdrawPending,
  withdrawFailed,
  positionList,
  transactionsPage,
  vaultList,
});

/** Map fixture file → contract name for validation scripts/tests. */
export const fixtureContracts = Object.freeze({
  'validation-error.json': 'errorResponse',
  'authorization-error.json': 'errorResponse',
  'provider-failure.json': 'errorResponse',
  'terminal-error.json': 'errorResponse',
  'deposit-success.json': 'depositSuccess',
  'withdraw-pending.json': 'withdrawSuccess',
  'withdraw-failed.json': 'withdrawSuccess',
  'position-list.json': 'positionList',
  'transactions-page.json': 'transactionPage',
  'vault-list.json': 'vaultList',
});

export {
  validationError,
  authorizationError,
  providerFailure,
  terminalError,
  depositSuccess,
  withdrawPending,
  withdrawFailed,
  positionList,
  transactionsPage,
  vaultList,
};
