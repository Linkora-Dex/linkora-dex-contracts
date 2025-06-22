// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../upgradeable/PoolUpgradeable.sol";
import "../upgradeable/OracleUpgradeable.sol";

library TradingLibrary {
   enum OrderType {LIMIT, STOP_LOSS, MARKET, CONDITIONAL}
   enum PositionType {LONG, SHORT}

   struct Order {
       uint256 id;
       address user;
       address tokenIn;
       address tokenOut;
       uint256 amountIn;
       uint256 targetPrice;
       uint256 minAmountOut;
       OrderType orderType;
       bool isLong;
       bool executed;
       uint256 createdAt;
       bool selfExecutable;
   }

   struct Position {
       uint256 id;
       address user;
       address token;
       uint256 collateralAmount;
       uint256 leverage;
       PositionType positionType;
       uint256 entryPrice;
       uint256 size;
       uint256 createdAt;
       bool isOpen;
   }

   error InvalidUser();
   error InvalidAmount();
   error SameToken();
   error InvalidTokenPrice();
   error OrderExecuted();
   error ExecutionConditionsNotMet();
   error NotSelfExecutable();
   error NotAuthorized();
   error NotOrderOwner();
   error InvalidCollateral();
   error InvalidLeverage();
   error PositionClosed();
   error NotLiquidatable();

   uint256 constant EXECUTION_REWARD_RATE = 10;
   uint256 constant SLIPPAGE_TOLERANCE = 500;

   function executeOrder(
       address poolAddress,
       address oracleAddress,
       Order storage order,
       address executor
   ) external returns (uint256 amountOut, uint256 reward) {
       PoolUpgradeable pool = PoolUpgradeable(poolAddress);

       if (order.executed) revert OrderExecuted();
       if (!shouldExecuteOrder(oracleAddress, order)) revert ExecutionConditionsNotMet();

       amountOut = pool.executeSwapForUser(
           order.user,
           order.tokenIn,
           order.tokenOut,
           order.amountIn,
           order.minAmountOut
       );

       pool.unlockFunds(order.user, order.tokenIn, order.amountIn);

       reward = (amountOut * EXECUTION_REWARD_RATE) / 10000;
       if (reward > 0 && amountOut > reward) {
           pool.transferFunds(order.user, executor, order.tokenOut, reward);
       }

       order.executed = true;
   }

   function shouldExecuteOrder(address oracleAddress, Order memory order) public view returns (bool) {

       if (order.executed) return false;

       uint256 currentPrice = getCurrentPrice(oracleAddress, order.tokenIn, order.tokenOut);

       if (order.orderType == OrderType.LIMIT) {
           return order.isLong ?
               currentPrice <= order.targetPrice :  // ✅ BUY когда цена упала до цели
               currentPrice >= order.targetPrice;   // ✅ SELL когда цена поднялась до цели
       } else if (order.orderType == OrderType.STOP_LOSS) {
           return currentPrice <= order.targetPrice;
       }

       return false;
   }

   function getCurrentPrice(address oracleAddress, address tokenIn, address tokenOut) public view returns (uint256) {
       OracleUpgradeable oracle = OracleUpgradeable(oracleAddress);
       oracle;

       if (tokenIn == address(0)) {
           return oracle.getPrice(tokenOut);
       } else if (tokenOut == address(0)) {
           return oracle.getPrice(tokenIn);
       } else {
           uint256 tokenInPrice = oracle.getPrice(tokenIn);
           uint256 tokenOutPrice = oracle.getPrice(tokenOut);
           return (tokenInPrice * 1e18) / tokenOutPrice;
       }
   }

   function calculateMinAmountOut(
       address poolAddress,
       address tokenIn,
       address tokenOut,
       uint256 amountIn
   ) external view returns (uint256) {
       PoolUpgradeable pool = PoolUpgradeable(poolAddress);

       uint256 reserveIn;
       uint256 reserveOut;

       if (tokenIn == address(0)) {
           reserveIn = pool.ethBalance();
           reserveOut = pool.totalTokenBalances(tokenOut);
       } else if (tokenOut == address(0)) {
           reserveIn = pool.totalTokenBalances(tokenIn);
           reserveOut = pool.ethBalance();
       } else {
           reserveIn = pool.totalTokenBalances(tokenIn);
           reserveOut = pool.totalTokenBalances(tokenOut);
       }

       if (reserveIn == 0 || reserveOut == 0) return 0;

       uint256 amountOut = (amountIn * reserveOut) / (reserveIn + amountIn);
       return (amountOut * (10000 - SLIPPAGE_TOLERANCE)) / 10000;
   }

   function calculatePositionPnL(
       Position memory position,
       uint256 currentPrice
   ) external pure returns (int256 pnl) {
       if (position.positionType == PositionType.LONG) {
           if (currentPrice > position.entryPrice) {
               pnl = int256((currentPrice - position.entryPrice) * position.size / position.entryPrice);
           } else {
               pnl = - int256((position.entryPrice - currentPrice) * position.size / position.entryPrice);
           }
       } else {
           if (position.entryPrice > currentPrice) {
               pnl = int256((position.entryPrice - currentPrice) * position.size / position.entryPrice);
           } else {
               pnl = - int256((currentPrice - position.entryPrice) * position.size / position.entryPrice);
           }
       }
   }

   function isPositionLiquidatable(
       Position memory position,
       uint256 currentPrice
   ) external pure returns (bool, int256 pnlPercent) {
       if (position.positionType == PositionType.LONG) {
           if (currentPrice <= position.entryPrice) {
               pnlPercent = - int256((position.entryPrice - currentPrice) * 100 / position.entryPrice);
               return (pnlPercent <= - 80, pnlPercent);
           }
       } else {
           if (currentPrice >= position.entryPrice) {
               pnlPercent = - int256((currentPrice - position.entryPrice) * 100 / position.entryPrice);
               return (pnlPercent <= - 80, pnlPercent);
           }
       }
       return (false, 0);
   }

   function validateOrderCreation(
       address oracleAddress,
       address user,
       uint256 amountIn,
       address tokenIn,
       address tokenOut
   ) external view {
       OracleUpgradeable oracle = OracleUpgradeable(oracleAddress);

       if (user == address(0)) revert InvalidUser();
       if (amountIn == 0) revert InvalidAmount();
       if (tokenIn == tokenOut) revert SameToken();
       if (tokenIn != address(0) && !oracle.isPriceValid(tokenIn)) revert InvalidTokenPrice();
       if (tokenOut != address(0) && !oracle.isPriceValid(tokenOut)) revert InvalidTokenPrice();
   }

   function validatePositionCreation(
       address user,
       uint256 collateralAmount,
       uint256 leverage
   ) external pure {
       if (user == address(0)) revert InvalidUser();
       if (collateralAmount == 0) revert InvalidCollateral();
       if (leverage < 1 || leverage > 100) revert InvalidLeverage();
   }
}