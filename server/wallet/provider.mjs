export class WalletError extends Error {constructor(message,status=400){super(message);this.name='WalletError';this.status=status;}}
export class UnknownBankOutcome extends WalletError {constructor(reference){super('Bank outcome is unknown; verify the existing reference before retrying.',503);this.reference=reference;}}
export const MAX_KOBO=Number.MAX_SAFE_INTEGER;
export function kobo(value,{zero=false}={}){if(!Number.isSafeInteger(value)||value<(zero?0:1)||value>MAX_KOBO)throw new WalletError('Money must be safe integer kobo.');return value;}
export function reference(value){if(typeof value!=='string'||value.length<1||value.length>160||!value.trim())throw new WalletError('A stable reference is required.');return value;}
// Normalized interface only. No bank endpoints or undocumented real-provider assumptions.
export class WalletProvider {
 async createWallet(){throw new WalletError('Wallet provider is not configured.',503);}
 async getBalance(){throw new WalletError('Wallet provider is not configured.',503);}
 async transfer(){throw new WalletError('Wallet provider is not configured.',503);}
 async startWithdrawal(){throw new WalletError('Wallet provider is not configured.',503);}
 async resolveAccountName(){throw new WalletError('Wallet provider is not configured.',503);}
 async verifyWebhook(){throw new WalletError('Wallet provider is not configured.',503);}
 async listTransactions(){throw new WalletError('Wallet provider is not configured.',503);}
}
