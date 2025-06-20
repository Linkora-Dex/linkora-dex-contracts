// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../upgradeable/PoolUpgradeable.sol";

library RouterLibrary {

   error InvalidTokenAddress();
   error InvalidAmount();
   error TransferFailed();
   error InvalidPath();
   error DeadlineExceeded();
   error NoETHSent();
   error InvalidPathForETH();

   function depositToken(
       PoolUpgradeable pool,
       address token,
       uint256 amount,
       address user,
       address sender
   ) external {
       if (token == address(0)) revert InvalidTokenAddress();
       if (amount == 0) revert InvalidAmount();

       if (!IERC20(token).transferFrom(sender, address(this), amount)) revert TransferFailed();
       IERC20(token).approve(address(pool), amount);
       pool.depositTokenForUser(token, amount, user);
   }

   function executeSwapPath(
       PoolUpgradeable pool,
       address[] calldata path,
       uint256 amountIn,
       uint256 amountOutMin,
       address user
   ) external returns (uint256[] memory amounts) {
       if (path.length < 2) revert InvalidPath();

       amounts = new uint256[](path.length);
       amounts[0] = amountIn;

       for (uint256 i = 0; i < path.length - 1; i++) {
           uint256 amountOut = pool.swapTokens(
               user,
               path[i],
               path[i + 1],
               amounts[i],
               i == path.length - 2 ? amountOutMin : 0
           );
           amounts[i + 1] = amountOut;
       }
   }

   function validateSwapPath(
       address[] calldata path,
       uint256 deadline,
       bool isETHInput,
       bool isETHOutput
   ) external view {
       if (path.length < 2) revert InvalidPath();
       if (block.timestamp > deadline) revert DeadlineExceeded();
       if (isETHInput && path[0] != address(0)) revert InvalidPathForETH();
       if (isETHOutput && path[path.length - 1] != address(0)) revert InvalidPathForETH();
   }

   function handleETHDeposit(PoolUpgradeable pool, address user, uint256 value) external {
       if (value == 0) revert NoETHSent();
       pool.depositETHForUser{value: value}(user);
   }
}