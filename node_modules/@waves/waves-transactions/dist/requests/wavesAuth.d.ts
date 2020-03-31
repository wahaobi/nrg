import { IWavesAuthParams, IWavesAuth } from '../transactions';
import { TSeedTypes } from '../types';
export declare const serializeWavesAuthData: (auth: {
    publicKey: string;
    timestamp: number;
}) => Uint8Array;
export declare function wavesAuth(params: IWavesAuthParams, seed?: TSeedTypes, chainId?: string | number): IWavesAuth;
