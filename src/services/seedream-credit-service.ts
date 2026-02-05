/**
 * Seedream Credit Balance Service
 * GET https://api.kie.ai/api/v1/chat/credit
 */

const CREDIT_URL = 'https://api.kie.ai/api/v1/chat/credit';

export interface CreditBalanceResult {
  balance: number;
  isLow: boolean;
  isCritical: boolean;
}

/**
 * Fetch current credit balance from Kie.ai
 */
export const fetchCreditBalance = async (apiKey: string): Promise<number> => {
  const response = await fetch(CREDIT_URL, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication failed. Please check your Kie.ai API key.');
    }
    throw new Error(`Failed to fetch credits: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.code !== 200) {
    throw new Error(`Failed to fetch credits: ${result.msg || 'Unknown error'}`);
  }

  return result.data;
};

/**
 * Get credit balance with warning thresholds
 */
export const getCreditBalanceWithStatus = async (apiKey: string): Promise<CreditBalanceResult> => {
  const balance = await fetchCreditBalance(apiKey);

  return {
    balance,
    isLow: balance < 10,
    isCritical: balance < 3,
  };
};
