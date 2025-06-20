// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

library PnLCalculator {
    struct Position {
        address user;
        address token;
        uint256 size;
        uint256 entryPrice;
        uint256 collateral;
        bool isLong;
        uint256 timestamp;
    }

    uint256 public constant LIQUIDATION_THRESHOLD = 80;
    uint256 public constant PRECISION = 1e18;

    function calculatePositionPnL(Position memory position, uint256 currentPrice) internal pure returns (int256) {
        require(currentPrice > 0, "Invalid current price");
        require(position.entryPrice > 0, "Invalid entry price");

        if (position.isLong) {
            if (currentPrice >= position.entryPrice) {
                uint256 profit = ((currentPrice - position.entryPrice) * position.size) / position.entryPrice;
                return int256(profit);
            } else {
                uint256 loss = ((position.entryPrice - currentPrice) * position.size) / position.entryPrice;
                return -int256(loss);
            }
        } else {
            if (position.entryPrice >= currentPrice) {
                uint256 profit = ((position.entryPrice - currentPrice) * position.size) / position.entryPrice;
                return int256(profit);
            } else {
                uint256 loss = ((currentPrice - position.entryPrice) * position.size) / position.entryPrice;
                return -int256(loss);
            }
        }
    }

    function shouldLiquidatePosition(Position memory position, uint256 currentPrice) internal pure returns (bool) {
        int256 pnl = calculatePositionPnL(position, currentPrice);
        int256 equity = int256(position.collateral) + pnl;
        int256 maintenanceMargin = int256(position.size * LIQUIDATION_THRESHOLD / 100);

        return equity <= maintenanceMargin;
    }

    function calculateLiquidationPrice(Position memory position) internal pure returns (uint256) {
        uint256 maintenanceMargin = position.size * LIQUIDATION_THRESHOLD / 100;

        if (position.isLong) {
            if (position.collateral <= maintenanceMargin) {
                return 0;
            }
            uint256 maxLoss = position.collateral - maintenanceMargin;
            return position.entryPrice - (maxLoss * position.entryPrice) / position.size;
        } else {
            uint256 maxLoss = position.collateral - maintenanceMargin;
            return position.entryPrice + (maxLoss * position.entryPrice) / position.size;
        }
    }

    function calculateMarginLevel(Position memory position, uint256 currentPrice) internal pure returns (uint256) {
        int256 pnl = calculatePositionPnL(position, currentPrice);
        int256 equity = int256(position.collateral) + pnl;

        if (equity <= 0) {
            return 0;
        }

        return (uint256(equity) * 100) / position.size;
    }

    function isPositionHealthy(Position memory position, uint256 currentPrice) internal pure returns (bool) {
        return calculateMarginLevel(position, currentPrice) > LIQUIDATION_THRESHOLD;
    }

    function calculateRequiredCollateral(uint256 positionSize, uint256 leverage) internal pure returns (uint256) {
        require(leverage > 0, "Invalid leverage");
        return positionSize / leverage;
    }

    function validateLeverageAdjustment(
        Position memory position,
        uint256 newLeverage,
        uint256 currentPrice
    ) internal pure returns (bool) {
        require(newLeverage > 0, "Invalid leverage");

        uint256 newSize = position.collateral * newLeverage;
        Position memory tempPosition = Position({
            user: position.user,
            token: position.token,
            size: newSize,
            entryPrice: position.entryPrice,
            collateral: position.collateral,
            isLong: position.isLong,
            timestamp: position.timestamp
        });

        return calculateMarginLevel(tempPosition, currentPrice) >= (LIQUIDATION_THRESHOLD + 50);
    }
}