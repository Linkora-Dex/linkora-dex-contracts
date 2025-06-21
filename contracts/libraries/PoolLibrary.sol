// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

library PoolLibrary {

   function executeSwap(
       mapping(address => uint256) storage ethBalances,
       mapping(address => mapping(address => uint256)) storage tokenBalances,
       mapping(address => uint256) storage totalTokenBalances,
       uint256 ethBalance,
       address user,
       address tokenIn,
       address tokenOut,
       uint256 amountIn,
       uint256 minAmountOut
   ) external returns (uint256 amountOut, uint256 newEthBalance) {
       require(amountIn > 0, "Amount must be greater than 0");
       require(tokenIn != tokenOut, "Cannot swap same token");

       newEthBalance = ethBalance;

       if (tokenIn == address(0)) {
           require(tokenOut != address(0), "Invalid token pair");
           require(ethBalances[user] >= amountIn, "Insufficient ETH balance");

           uint256 ethReserve = ethBalance;
           uint256 tokenReserve = totalTokenBalances[tokenOut];
           require(tokenReserve > 0, "No token liquidity");

           amountOut = (amountIn * tokenReserve) / (ethReserve + amountIn);
           require(amountOut >= minAmountOut, "Slippage too high");
           require(tokenReserve >= amountOut, "Insufficient token liquidity");

           ethBalances[user] -= amountIn;
           tokenBalances[user][tokenOut] += amountOut;
           newEthBalance += amountIn;
           totalTokenBalances[tokenOut] -= amountOut;
       } else if (tokenOut == address(0)) {
           require(tokenIn != address(0), "Invalid token pair");
           require(tokenBalances[user][tokenIn] >= amountIn, "Insufficient token balance");

           uint256 tokenReserve = totalTokenBalances[tokenIn];
           uint256 ethReserve = ethBalance;
           require(ethReserve > 0, "No ETH liquidity");

           amountOut = (amountIn * ethReserve) / (tokenReserve + amountIn);
           require(amountOut >= minAmountOut, "Slippage too high");
           require(ethReserve >= amountOut, "Insufficient ETH liquidity");

           tokenBalances[user][tokenIn] -= amountIn;
           ethBalances[user] += amountOut;
           totalTokenBalances[tokenIn] += amountIn;
           newEthBalance -= amountOut;
       } else {
           require(tokenIn != address(0) && tokenOut != address(0), "Invalid token pair");
           require(tokenBalances[user][tokenIn] >= amountIn, "Insufficient token balance");

           uint256 tokenInReserve = totalTokenBalances[tokenIn];
           uint256 tokenOutReserve = totalTokenBalances[tokenOut];
           require(tokenOutReserve > 0, "No token liquidity");

           amountOut = (amountIn * tokenOutReserve) / (tokenInReserve + amountIn);
           require(amountOut >= minAmountOut, "Slippage too high");
           require(tokenOutReserve >= amountOut, "Insufficient token liquidity");

           tokenBalances[user][tokenIn] -= amountIn;
           tokenBalances[user][tokenOut] += amountOut;
           totalTokenBalances[tokenIn] += amountIn;
           totalTokenBalances[tokenOut] -= amountOut;
       }
   }

   function executeSwapForUser(
       mapping(address => uint256) storage ethBalances,
       mapping(address => mapping(address => uint256)) storage tokenBalances,
       mapping(address => uint256) storage lockedEthBalances,
       mapping(address => mapping(address => uint256)) storage lockedTokenBalances,
       mapping(address => uint256) storage totalTokenBalances,
       uint256 ethBalance,
       address user,
       address tokenIn,
       address tokenOut,
       uint256 amountIn,
       uint256 minAmountOut
   ) external returns (uint256 amountOut, uint256 newEthBalance) {
       require(amountIn > 0, "Amount must be greater than 0");
       require(tokenIn != tokenOut, "Cannot swap same token");

       newEthBalance = ethBalance;

       if (tokenIn == address(0)) {
           require(tokenOut != address(0), "Invalid token pair");
           require(ethBalances[user] >= amountIn, "Insufficient ETH balance");
           require(lockedEthBalances[user] >= amountIn, "Insufficient locked ETH");

           uint256 ethReserve = ethBalance;
           uint256 tokenReserve = totalTokenBalances[tokenOut];
           require(tokenReserve > 0, "No token liquidity");

           amountOut = (amountIn * tokenReserve) / (ethReserve + amountIn);
           require(amountOut >= minAmountOut, "Slippage too high");
           require(tokenReserve >= amountOut, "Insufficient token liquidity");

           ethBalances[user] -= amountIn;
           tokenBalances[user][tokenOut] += amountOut;
           newEthBalance += amountIn;
           totalTokenBalances[tokenOut] -= amountOut;
       } else if (tokenOut == address(0)) {
           require(tokenIn != address(0), "Invalid token pair");
           require(tokenBalances[user][tokenIn] >= amountIn, "Insufficient token balance");
           require(lockedTokenBalances[user][tokenIn] >= amountIn, "Insufficient locked tokens");

           uint256 tokenReserve = totalTokenBalances[tokenIn];
           uint256 ethReserve = ethBalance;
           require(ethReserve > 0, "No ETH liquidity");

           amountOut = (amountIn * ethReserve) / (tokenReserve + amountIn);
           require(amountOut >= minAmountOut, "Slippage too high");
           require(ethReserve >= amountOut, "Insufficient ETH liquidity");

           tokenBalances[user][tokenIn] -= amountIn;
           ethBalances[user] += amountOut;
           totalTokenBalances[tokenIn] += amountIn;
           newEthBalance -= amountOut;
       } else {
           require(tokenIn != address(0) && tokenOut != address(0), "Invalid token pair");
           require(tokenBalances[user][tokenIn] >= amountIn, "Insufficient token balance");
           require(lockedTokenBalances[user][tokenIn] >= amountIn, "Insufficient locked tokens");

           uint256 tokenInReserve = totalTokenBalances[tokenIn];
           uint256 tokenOutReserve = totalTokenBalances[tokenOut];
           require(tokenOutReserve > 0, "No token liquidity");

           amountOut = (amountIn * tokenOutReserve) / (tokenInReserve + amountIn);
           require(amountOut >= minAmountOut, "Slippage too high");
           require(tokenOutReserve >= amountOut, "Insufficient token liquidity");

           tokenBalances[user][tokenIn] -= amountIn;
           tokenBalances[user][tokenOut] += amountOut;
           totalTokenBalances[tokenIn] += amountIn;
           totalTokenBalances[tokenOut] -= amountOut;
       }
   }

   function calculateAmountOut(
       uint256 amountIn,
       address tokenIn,
       address tokenOut,
       uint256 ethBalance,
       mapping(address => uint256) storage totalTokenBalances
   ) external view returns (uint256 amountOut) {
       require(amountIn > 0, "Invalid amount");
       require(tokenIn != tokenOut, "Same token");

       uint256 reserveIn;
       uint256 reserveOut;

       if (tokenIn == address(0)) {
           reserveIn = ethBalance;
           reserveOut = totalTokenBalances[tokenOut];
       } else if (tokenOut == address(0)) {
           reserveIn = totalTokenBalances[tokenIn];
           reserveOut = ethBalance;
       } else {
           reserveIn = totalTokenBalances[tokenIn];
           reserveOut = totalTokenBalances[tokenOut];
       }

       require(reserveIn > 0 && reserveOut > 0, "No liquidity");
       amountOut = (amountIn * reserveOut) / (reserveIn + amountIn);
   }
}