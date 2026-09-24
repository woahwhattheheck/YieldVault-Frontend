import { useState, useEffect, useCallback } from 'react';
import * as vaultService from '../services/vault.js';
import { useWallet } from './useWallet.js';
import { adaptPositionList, ContractApiError } from '../services/apiAdapter.js';

/**
 * Load the connected user's vault positions. Returns an empty list when
 * the wallet is not connected. Contract-shaped list payloads are adapted
 * into the UI position model with precision enforcement.
 * @returns {{
 *   positions: Array,
 *   loading: boolean,
 *   error: string|null,
 *   errorPayload: unknown,
 *   lastUpdated: Date|null,
 *   reload: () => void
 * }}
 */
export function usePositions() {
  const { isConnected } = useWallet();
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorPayload, setErrorPayload] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    if (!isConnected) {
      setPositions([]);
      setError(null);
      setErrorPayload(null);
      return;
    }
    setLoading(true);
    setError(null);
    setErrorPayload(null);
    try {
      const data = await vaultService.getPositions();
      if (data && typeof data === 'object' && Array.isArray(data.positions) && 'count' in data) {
        const adapted = adaptPositionList(data);
        setPositions(adapted.positions);
      } else {
        setPositions(data);
      }
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof ContractApiError) {
        setError(err.adapted.message);
        setErrorPayload(err.payload);
      } else {
        setError(err.message || 'Failed to load positions');
        setErrorPayload(err?.payload || null);
      }
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  useEffect(() => {
    load();
  }, [load]);

  return { positions, loading, error, errorPayload, lastUpdated, reload: load };
}

export default usePositions;
