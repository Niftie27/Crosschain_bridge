// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockGasServiceAUSDC {
    // Native path record
    struct LastNative {
        address sender;
        string  destChain;
        string  destAddr;
        bytes   payload;
        string  symbol;
        uint256 amount;
        address refund;
        uint256 value; // msg.value
    }

    // ERC-20 path record
    struct LastERC20 {
        address sender;
        string  destChain;
        string  destAddr;
        bytes   payload;
        string  symbol;
        uint256 amount;
        address gasToken;
        uint256 gasFeeInToken;
        address refund;
    }

    LastNative public lastNative;
    LastERC20  public lastERC20;

    event NativeGasPaid(address indexed sender, string destChain, string destAddr, string symbol, uint256 amount, address indexed refund, uint256 value);
    event ERC20GasPaid(address indexed sender, string destChain, string destAddr, string symbol, uint256 amount, address indexed gasToken, uint256 gasFee, address indexed refund);

    // Mimics Axelar: pay native for a call-with-token
    function payNativeGasForContractCallWithToken(
        address sender,
        string calldata destChain,
        string calldata destAddr,
        bytes calldata payload,
        string calldata symbol,
        uint256 amount,
        address refund
    ) external payable {
        lastNative = LastNative({
            sender: sender,
            destChain: destChain,
            destAddr: destAddr,
            payload: payload,
            symbol: symbol,
            amount: amount,
            refund: refund,
            value: msg.value
        });
        emit NativeGasPaid(sender, destChain, destAddr, symbol, amount, refund, msg.value);
    }

    // Mimics Axelar: pay ERC-20 for a call-with-token (GAS IN aUSDC)
    // NOTE: We actually PULL tokens from `sender` (USDCSender) — which must have approved us.
    function payGasForContractCallWithToken(
        address sender,
        string calldata destChain,
        string calldata destAddr,
        bytes calldata payload,
        string calldata symbol,
        uint256 amount,
        address gasToken,
        uint256 gasFeeInToken,
        address refund
    ) external {
        // pull the gas fee from the `sender` contract (USDCSender)
        // USDCSender should have called aUSDC.forceApprove(address(this), gasFeeInToken)
        if (gasFeeInToken > 0) {
            require(IERC20(gasToken).transferFrom(sender, address(this), gasFeeInToken), "gas token pull failed");
        }

        lastERC20 = LastERC20({
            sender: sender,
            destChain: destChain,
            destAddr: destAddr,
            payload: payload,
            symbol: symbol,
            amount: amount,
            gasToken: gasToken,
            gasFeeInToken: gasFeeInToken,
            refund: refund
        });

        emit ERC20GasPaid(sender, destChain, destAddr, symbol, amount, gasToken, gasFeeInToken, refund);
    }
}
