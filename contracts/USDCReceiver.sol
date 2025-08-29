// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

// [ ] to do list task

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// NOTE: use the WithToken base (your current AxelarExecutable is msg-only)
import {AxelarExecutableWithToken} from
    "@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutableWithToken.sol";
// Use CGP interface for tokenAddresses(...)
import {IAxelarGateway as IAxelarGatewayCGP} from
    "@axelar-network/axelar-cgp-solidity/contracts/interfaces/IAxelarGateway.sol";

contract USDCReceiver is AxelarExecutableWithToken {
    // store hashes (strings can’t be immutable value types)
    bytes32 public immutable expectedSourceChainHash;
    bytes32 public immutable expectedSourceAddressHash;
    string  public constant EXPECTED_SYMBOL = "aUSDC";

    event Received(address indexed recipient, uint256 amount, string sourceChain);

    constructor(address gateway_, string memory srcChain, string memory srcAddress)
        AxelarExecutableWithToken(gateway_)
    {
        expectedSourceChainHash = keccak256(bytes(srcChain));
        // store the LOWERCASED address hash
        expectedSourceAddressHash = _keccakLower(srcAddress); // <-- edited
    }

    // --- helper: keccak of lowercase(s) ---  <-- added
    function _keccakLower(string memory s) internal pure returns (bytes32) {
        bytes memory b = bytes(s);
        for (uint i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 65 && c <= 90) { // 'A'..'Z'
                b[i] = bytes1(c + 32);
            }
        }
        return keccak256(b);
    }

    // Required by base but unused in our app (message-only path)
    function _execute(
        bytes32 /*commandId*/,
        string calldata /*sourceChain*/,
        string calldata /*sourceAddress*/,
        bytes calldata  /*payload*/
    ) internal pure override {
        revert("unsupported");
    }

    // Token-bearing path (this is what Axelar calls for callContractWithToken)
    function _executeWithToken(
    bytes32, string calldata sourceChain, string calldata, bytes calldata payload,
    string calldata tokenSymbol, uint256 amount
    ) internal override {
    require(keccak256(bytes(tokenSymbol)) == keccak256(bytes("aUSDC")), "wrong token");
    address token = IAxelarGatewayCGP(address(gateway())).tokenAddresses(tokenSymbol);
    address recipient = abi.decode(payload, (address));
    require(IERC20(token).transfer(recipient, amount), "transfer failed");
    emit Received(recipient, amount, sourceChain);
    }
}
