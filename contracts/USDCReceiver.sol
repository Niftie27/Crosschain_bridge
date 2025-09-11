// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

// Axelar
import { AxelarExecutableWithToken } from
    "@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutableWithToken.sol";
import { IAxelarGateway as IAxelarGatewayCGP } from
    "@axelar-network/axelar-cgp-solidity/contracts/interfaces/IAxelarGateway.sol";

contract USDCReceiver is AxelarExecutableWithToken, Ownable {
    using SafeERC20 for IERC20;

    // Hashes of LOWERCASED strings (stored normalized)
    bytes32 public immutable expectedSourceChainHash;
    bytes32 public immutable expectedSourceAddressHash;

    string  public constant EXPECTED_SYMBOL = "aUSDC";

    event Received(address indexed recipient, uint256 amount, string sourceChain);

    constructor(address gateway_, string memory srcChain, string memory srcAddress)
        AxelarExecutableWithToken(gateway_)
        Ownable(msg.sender)
    {
        // NOTE: pass srcChain = "Ethereum Sepolia"
        expectedSourceChainHash   = keccak256(bytes(srcChain));
        // NOTE: store srcAddress = LOWERCASED sender string
        // store the LOWERCASED address hash
        expectedSourceAddressHash = keccak256(bytes(srcAddress)); // you already handle lowercasing at deploy-time
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

    // Unused (message-only path)
    function _execute(
        bytes32,
        string calldata,
        string calldata,
        bytes calldata
    ) internal pure override {
        revert("unsupported");
    }

    // Token-bearing path (callContractWithToken)
    function _executeWithToken(
        bytes32,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount
    ) internal override {
        // Normalize incoming strings, compare against stored hashes
        require(_keccakLower(sourceChain)  == expectedSourceChainHash,  "bad sourceChain");
        // keccak256(bytes(sourceAddress)) == expectedSourceAddressHash, ⛔ case-sensitive compare
        require(_keccakLower(sourceAddress)== expectedSourceAddressHash, "unauthorized source");  // ✅ normalize case
        // (Or normalize both chain & address with _keccakLower to be extra safe.)

        // Asset guard 
        require(keccak256(bytes(tokenSymbol)) == keccak256(bytes(EXPECTED_SYMBOL)), "wrong token");

        // Resolve token on this (dest) chain via Axelar gateway
        address token = IAxelarGatewayCGP(address(gateway())).tokenAddresses(tokenSymbol);

        // Decode recipient and forward funds (mint happens within this call)
        address recipient = abi.decode(payload, (address));
        IERC20(token).safeTransfer(recipient, amount);

        emit Received(recipient, amount, sourceChain);
    }

    // ✅ ADDED: ops safety
    function sweep(address token, address to, uint256 amount) external onlyOwner { // ✅ CHANGED
        IERC20(token).safeTransfer(to, amount); // ✅ CHANGED
    }
}
