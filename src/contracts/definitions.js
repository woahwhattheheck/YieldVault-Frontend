/**
 * YieldVault API response contracts (v1), aligned with YieldVault-Backend.
 * Precision is capped at 6 decimal places for monetary fields.
 */

const id = { type: 'string', minLength: 3, maxLength: 128 };
const timestamp = {
  type: 'string',
  pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
};
const amount = { type: 'number', min: 0, precision: 6 };

const transaction = {
  type: 'object',
  additionalProperties: false,
  required: ['txHash', 'operation', 'status', 'timestamp'],
  properties: {
    txHash: id,
    operation: { type: 'string', enum: ['deposit', 'withdraw'] },
    status: { type: 'string', enum: ['pending', 'submitted', 'confirmed', 'failed'] },
    timestamp,
    user: id,
    vaultId: id,
    amount,
    shares: amount,
    assets: amount,
  },
};

const position = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'user',
    'vaultId',
    'shares',
    'assetValue',
    'earnings',
    'principal',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id,
    user: id,
    vaultId: id,
    shares: amount,
    assetValue: amount,
    earnings: { type: 'number', precision: 6 },
    principal: amount,
    createdAt: { type: 'integer', min: 0 },
    updatedAt: { type: 'integer', min: 0 },
  },
};

const pagination = {
  type: 'object',
  additionalProperties: false,
  required: ['total', 'limit', 'offset', 'hasMore'],
  properties: {
    total: { type: 'integer', min: 0 },
    limit: { type: 'integer', min: 1, max: 100 },
    offset: { type: 'integer', min: 0 },
    hasMore: { type: 'boolean' },
  },
};

const vault = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'name',
    'asset',
    'apy',
    'tvl',
    'totalAssets',
    'totalShares',
    'pricePerShare',
    'createdAt',
  ],
  properties: {
    id,
    name: { type: 'string', minLength: 1, maxLength: 128 },
    asset: { type: 'string', enum: ['USDC', 'XLM', 'EURC'] },
    apy: { type: 'number', min: 0, max: 1, precision: 6 },
    tvl: amount,
    totalAssets: amount,
    totalShares: amount,
    pricePerShare: { type: 'number', min: 0, precision: 6 },
    createdAt: { type: 'integer', min: 0 },
  },
};

const error = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'status'],
  properties: {
    message: { type: 'string', minLength: 1, maxLength: 256 },
    status: { type: 'integer', min: 400, max: 599 },
    code: { type: 'string', pattern: /^[A-Z][A-Z0-9_]+$/ },
    requestId: id,
    details: { type: ['object', 'array'], nullable: true },
  },
};

export const definitions = {
  vaultList: {
    type: 'object',
    additionalProperties: false,
    required: ['count', 'vaults'],
    properties: {
      count: { type: 'integer', min: 0 },
      vaults: { type: 'array', items: vault },
    },
  },
  positionList: {
    type: 'object',
    additionalProperties: false,
    required: ['count', 'positions'],
    properties: {
      count: { type: 'integer', min: 0 },
      positions: { type: 'array', items: position },
    },
  },
  depositSuccess: {
    type: 'object',
    additionalProperties: false,
    required: ['position', 'tx'],
    properties: { position, tx: transaction },
  },
  withdrawSuccess: {
    type: 'object',
    additionalProperties: false,
    required: ['withdrawnAssets', 'tx', 'position'],
    properties: {
      withdrawnAssets: amount,
      tx: transaction,
      position: { ...position, nullable: true },
    },
  },
  transactionPage: {
    type: 'object',
    additionalProperties: false,
    required: ['count', 'pagination', 'transactions'],
    properties: {
      count: { type: 'integer', min: 0 },
      pagination,
      transactions: { type: 'array', items: transaction },
    },
  },
  errorResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['error'],
    properties: { error },
  },
};

export const version = 'v1';
export { pagination, position, timestamp, transaction, vault };
