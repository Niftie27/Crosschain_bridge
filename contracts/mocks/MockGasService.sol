// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

contract MockGasService {
    // We store the last payment so tests can assert on it.
    struct LastPay {
        address sender;   // who initiated the cross-chain call (USDCSender contract)
        string  destChain;
        string  destAddr; // receiver address as a STRING (that's what Axelar expects)
        bytes   payload;  // ABI-encoded message (your recipient address)
        string  symbol;   // "aUSDC"
        uint256 amount;   // token amount that will be bridged
        address refund;   // where to refund unused gas
        uint256 value;    // native gas paid (msg.value)
    }

    LastPay public last; // public -> auto-getter for tests

    // Mimics Axelar's payNativeGasForContractCallWithToken(...)
    function payNativeGasForContractCallWithToken(
        address sender,
        string calldata destChain,
        string calldata destAddr,
        bytes calldata payload,
        string calldata symbol,
        uint256 amount,
        address refund
    ) external payable {
        // just record everything; no real gas logic
        last = LastPay({
            sender: sender,
            destChain: destChain,
            destAddr: destAddr,
            payload: payload,
            symbol: symbol,
            amount: amount,
            refund: refund,
            value: msg.value
        });
    }
}
