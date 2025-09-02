// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

// [ ] to do list task


import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol"; // additional ✅
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAxelarGateway} from "@axelar-network/axelar-cgp-solidity/contracts/interfaces/IAxelarGateway.sol";
import {IAxelarGasService} from "@axelar-network/axelar-cgp-solidity/contracts/interfaces/IAxelarGasService.sol";


contract USDCSender {
    using SafeERC20 for IERC20;  // additional ✅

    IAxelarGateway public immutable gateway;       // Axelar Gateway on source chain
    IAxelarGasService public immutable gasService; // Axelar Gas Service on source chain
    IERC20 public immutable aUSDC;                 // aUSDC token on source chain

    string public constant TOKEN_SYMBOL = "aUSDC";

    event Bridging(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        string  destChain,
        string  destContract // hex string of USDCReceiver on dest chain
    );

    constructor(address gateway_, address gasService_, address aUSDC_) {
        gateway = IAxelarGateway(gateway_);
        gasService = IAxelarGasService(gasService_);
        aUSDC = IERC20(aUSDC_);
    }

    /**
     * @param destChain       Axelar's chain name (e.g., "Avalanche" for Fuji)
     * @param destContract    USDCReceiver contract address on dest chain, as "0x..." string
     * @param recipient       Who should receive tokens on dest chain
     * @param amount          aUSDC amount (6 decimals)
     */
    function bridge(
        string calldata destChain,
        string calldata destContract,
        address recipient,
        uint256 amount
    ) external payable {
        require(bytes(destChain).length != 0, "destChain required");
        require(bytes(destContract).length != 0, "destContract required");
        require(amount > 0, "amount=0");
        require(msg.value > 0, "msg.value (gas) required");

        // 1) Safe pull user's aUSDC into this contract, additional
        // require(aUSDC.transferFrom(msg.sender, address(this), amount), "pull failed"); ✅
        aUSDC.safeTransferFrom(msg.sender, address(this), amount);

        // 2) Approve the Gateway to take exactly this amount
        // approve the Gateway for exactly `amount` (OZ v5: use forceApprove) ✅
        aUSDC.forceApprove(address(gateway), amount); // ✅ CHANGED (was safeApprove/reset; not available in OZ v5)

        // 3) Encode the message payload (only send encoded recipient address, and that's the instruction for receiver chain)
		// * If the receiver ignores the payload and doesn’t transfer the funds out, the tokens will sit in the receiver contract.
        bytes memory payload = abi.encode(recipient);

        // 4) Prepay destination execution gas (refunds go to msg.sender)
        gasService.payNativeGasForContractCallWithToken{value: msg.value}(
            address(this),
            destChain,
            destContract,
            payload,
            TOKEN_SYMBOL,
            amount,
            msg.sender
        );

        // 5) Ask Gateway to deliver message + tokens
        gateway.callContractWithToken(
            destChain,
            destContract,
            payload,
            TOKEN_SYMBOL,
            amount
        );

        emit Bridging(msg.sender, recipient, amount, destChain, destContract);
    }
}

