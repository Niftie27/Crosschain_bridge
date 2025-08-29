// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol"; // standard ERC-20 implementation

contract MockAUSDC is ERC20 {
    constructor() ERC20("Axelar USDC", "aUSDC") {
      
    }
    function decimals() public pure override returns (uint8){
       return 6; 
    }
    function mint(address to, uint256 amt) external {
      _mint(to, amt); 
    }
}
