// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

// Minimal interface for the receiver’s external entry (used to simulate delivery) (Axelar calls this in prod)
interface IReceiverExternalWithToken {
    function executeWithToken(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount
    ) external;
}

contract MockGateway {
    // For receiver tests: symbol -> token address on THIS chain
    mapping(string => address) public tokenAddresses;

    // For sender tests: record the last call
    struct CallWithToken {
        string destChain;
        string destAddr; // receiver address as string
        bytes payload;
        string symbol;
        uint256 amount;
    }
    CallWithToken public lastCall;

    // 1) map token symbol to token address on the destination chain
    function setTokenAddress(string calldata symbol, address token) external { // ✅ ADDED
        tokenAddresses[symbol] = token;
    }

    // What USDCSender calls
    function callContractWithToken(
        string calldata destChain,
        string calldata destAddr,
        bytes calldata payload,
        string calldata symbol,
        uint256 amount
    ) external {
        lastCall = CallWithToken(destChain, destAddr, payload, symbol, amount); 
        // records last call USDCSender made to callContractWithToken(...).
        // In prod: Axelar relays later.
        // In local tests: trigger delivery via mockExecuteWithToken.
        // In real life: Axelar would validate and later deliver to the destination chain.
        // In the mock: we only record the arguments so your test can check them.
    }

    // [ADDED] AxelarExecutableWithToken expects this to exist on the gateway, additional
    // Axelar GMP base calls this on the gateway during executeWithToken(...)
    function validateContractCallAndMint( // ✅ stub expected by AxelarExecutableWithToken (receiver will call this on the gateway)
        bytes32 /*commandId*/,
        string calldata /*sourceChain*/,
        string calldata /*sourceAddress*/,
        bytes32 /*payloadHash*/,
        string calldata /*tokenSymbol*/,
        uint256 /*amount*/
    ) external pure returns (bool) {
        return true; // accept everything in tests
    }

    // Test helper: Simulate Axelar delivering msg+token to the receiver (includes commandId) (the magic button)
    // pretends to be Axelar delivering the cross-chain message + tokens.
    // triggers USDCReceiver’s logic immediately.
    function mockExecuteWithToken(
        address receiver,
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount
    ) external {
        IReceiverExternalWithToken(receiver).executeWithToken(
            commandId, sourceChain, sourceAddress, payload, tokenSymbol, amount
        );
    }
}
