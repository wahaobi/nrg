/**
 * @module nodeInteraction
 */
import { IDataEntry, ITransaction, TTx, WithId } from './transactions';
export declare type CancellablePromise<T> = Promise<T> & {
    cancel: () => void;
};
export interface INodeRequestOptions {
    timeout?: number;
    apiBase?: string;
}
export declare const currentHeight: (apiBase: string) => Promise<number>;
export declare function waitForHeight(height: number, options?: INodeRequestOptions): Promise<number>;
/**
 * Resolves when specified txId is mined into block
 * @param txId - waves address as base58 string
 * @param options
 */
export declare function waitForTx(txId: string, options?: INodeRequestOptions): Promise<TTx>;
export declare function waitForTxWithNConfirmations(txId: string, confirmations: number, options: INodeRequestOptions): Promise<TTx>;
export declare function waitNBlocks(blocksCount: number, options?: INodeRequestOptions): Promise<number>;
/**
 * Get account effective balance
 * @param txId - transaction ID as base58 string
 * @param nodeUrl - node address to ask balance from. E.g. https://nodes.wavesplatform.com/
 */
export declare function transactionById(txId: string, nodeUrl: string): Promise<ITransaction & WithId & {
    height: number;
}>;
/**
 * Get account effective balance
 * @param address - waves address as base58 string
 * @param nodeUrl - node address to ask balance from. E.g. https://nodes.wavesplatform.com/
 */
export declare function balance(address: string, nodeUrl: string): Promise<number>;
/**
 * Retrieve full information about waves account balance. Effective, generating etc
 * @param address - waves address as base58 string
 * @param nodeUrl - node address to ask balance from. E.g. https://nodes.wavesplatform.com/
 */
export declare function balanceDetails(address: string, nodeUrl: string): Promise<any>;
/**
 * Retrieve information about specific asset account balance
 * @param assetId - id of asset
 * @param address - waves address as base58 string
 * @param nodeUrl - node address to ask balance from. E.g. https://nodes.wavesplatform.com/
 */
export declare function assetBalance(assetId: string, address: string, nodeUrl: string): Promise<any>;
export interface IAccountDataRequestOptions {
    address: string;
    match?: string | RegExp;
}
/**
 * Get full account dictionary
 * @param options - waves address and optional match regular expression. If match is present keys will be filtered by this regexp
 * @param nodeUrl - node address to ask data from. E.g. https://nodes.wavesplatform.com/
 */
export declare function accountData(options: IAccountDataRequestOptions, nodeUrl: string): Promise<Record<string, IDataEntry>>;
export declare function accountData(address: string, nodeUrl: string): Promise<Record<string, IDataEntry>>;
/**
 * Get data from account dictionary by key
 * @param address - waves address as base58 string
 * @param key - dictionary key
 * @param nodeUrl - node address to ask data from. E.g. https://nodes.wavesplatform.com/
 */
export declare function accountDataByKey(key: string, address: string, nodeUrl: string): Promise<IDataEntry>;
/**
 * Get account script info
 * @param address - waves address as base58 string
 * @param nodeUrl - node address to ask data from. E.g. https://nodes.wavesplatform.com/
 */
export declare function scriptInfo(address: string, nodeUrl: string): Promise<any>;
/**
 * Get account script meta, i.e., available callable functions
 * @param address - waves address as base58 string
 * @param nodeUrl - node address to ask data from. E.g. https://nodes.wavesplatform.com/
 */
export declare function scriptMeta(address: string, nodeUrl: string): Promise<any>;
/**
 * Get miner’s reward status and total supply
 * @param nodeUrl - node address to ask data from. E.g. https://nodes.wavesplatform.com/
 */
export declare function rewards(nodeUrl: string): Promise<any>;
/**
 * Get miner’s reward status at height and total supply
 * @param height - block number to get info
 * @param nodeUrl - node address to ask data from. E.g. https://nodes.wavesplatform.com/
 */
export declare function rewards(height: number, nodeUrl: string): Promise<any>;
export interface IStateChangeResponse {
    data: IDataEntry[];
    transfers: {
        address: string;
        amount: number;
        assetId: string | null;
    }[];
}
/**
 * Get invokeScript tx state changes
 * @param transactionId - invokeScript transaction id as base58 string
 * @param nodeUrl - node address to ask data from. E.g. https://nodes.wavesplatform.com/
 */
export declare function stateChanges(transactionId: string, nodeUrl: string): Promise<IStateChangeResponse>;
/**
 * Sends transaction to waves node
 * @param tx - transaction to send
 * @param nodeUrl - node address to send tx to. E.g. https://nodes.wavesplatform.com/
 */
export declare function broadcast<T extends TTx>(tx: T, nodeUrl: string): Promise<T>;
