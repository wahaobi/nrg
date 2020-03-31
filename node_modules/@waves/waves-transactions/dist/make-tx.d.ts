import { IAliasParams, IAliasTransaction, IBurnParams, IBurnTransaction, ICancelLeaseParams, ICancelLeaseTransaction, IDataParams, IDataTransaction, IExchangeTransaction, IInvokeScriptParams, IInvokeScriptTransaction, IIssueParams, IIssueTransaction, ILeaseParams, ILeaseTransaction, IMassTransferParams, IMassTransferTransaction, IReissueParams, IReissueTransaction, ISetAssetScriptParams, ISetAssetScriptTransaction, ISetScriptParams, ISetScriptTransaction, ISponsorshipParams, ISponsorshipTransaction, ITransferParams, ITransferTransaction, TRANSACTION_TYPE, TTransactionType, WithId, WithSender } from './transactions';
export declare type TTransaction<T extends TTransactionType> = TxTypeMap[T];
export declare type TxTypeMap = {
    [TRANSACTION_TYPE.ISSUE]: IIssueTransaction;
    [TRANSACTION_TYPE.TRANSFER]: ITransferTransaction;
    [TRANSACTION_TYPE.REISSUE]: IReissueTransaction;
    [TRANSACTION_TYPE.BURN]: IBurnTransaction;
    [TRANSACTION_TYPE.LEASE]: ILeaseTransaction;
    [TRANSACTION_TYPE.CANCEL_LEASE]: ICancelLeaseTransaction;
    [TRANSACTION_TYPE.ALIAS]: IAliasTransaction;
    [TRANSACTION_TYPE.MASS_TRANSFER]: IMassTransferTransaction;
    [TRANSACTION_TYPE.DATA]: IDataTransaction;
    [TRANSACTION_TYPE.SET_SCRIPT]: ISetScriptTransaction;
    [TRANSACTION_TYPE.SET_ASSET_SCRIPT]: ISetAssetScriptTransaction;
    [TRANSACTION_TYPE.SPONSORSHIP]: ISponsorshipTransaction;
    [TRANSACTION_TYPE.EXCHANGE]: IExchangeTransaction;
    [TRANSACTION_TYPE.INVOKE_SCRIPT]: IInvokeScriptTransaction;
};
export declare type TTxParamsWithType<T extends TTransactionType> = TxParamsTypeMap[T] & {
    type: T;
};
export declare type TxParamsTypeMap = {
    [TRANSACTION_TYPE.ISSUE]: IIssueParams;
    [TRANSACTION_TYPE.TRANSFER]: ITransferParams;
    [TRANSACTION_TYPE.REISSUE]: IReissueParams;
    [TRANSACTION_TYPE.BURN]: IBurnParams;
    [TRANSACTION_TYPE.LEASE]: ILeaseParams;
    [TRANSACTION_TYPE.CANCEL_LEASE]: ICancelLeaseParams;
    [TRANSACTION_TYPE.ALIAS]: IAliasParams;
    [TRANSACTION_TYPE.MASS_TRANSFER]: IMassTransferParams;
    [TRANSACTION_TYPE.DATA]: IDataParams;
    [TRANSACTION_TYPE.SET_SCRIPT]: ISetScriptParams;
    [TRANSACTION_TYPE.SET_ASSET_SCRIPT]: ISetAssetScriptParams;
    [TRANSACTION_TYPE.SPONSORSHIP]: ISponsorshipParams;
    [TRANSACTION_TYPE.EXCHANGE]: IExchangeTransaction;
    [TRANSACTION_TYPE.INVOKE_SCRIPT]: IInvokeScriptParams;
};
/**
 * Makes transaction from params. Validates all fields and calculates id
 */
export declare function makeTx<T extends TTransactionType>(params: TTxParamsWithType<T> & WithSender): TTransaction<T> & WithId;
