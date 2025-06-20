// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../access/AccessControl.sol";

contract TradingEvents is AccessControlContract {
    event OrderCreated(uint256 indexed orderId, address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 targetPrice, uint8 orderType);
    event OrderExecuted(uint256 indexed orderId, address indexed executor, uint256 amountOut, bool selfExecution);
    event OrderCancelled(uint256 indexed orderId, address indexed user, uint256 timestamp);
    event OrderModified(uint256 indexed orderId, uint256 oldTargetPrice, uint256 newTargetPrice, uint256 newMinAmountOut);

    event StopLossTriggered(uint256 indexed orderId, address indexed user, uint256 triggerPrice, uint256 executedPrice);
    event ExecutionReward(uint256 indexed orderId, address indexed executor, uint256 reward, uint256 timestamp);

    event PositionOpened(uint256 indexed positionId, address indexed user, address token, uint256 size, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice);
    event PositionClosed(uint256 indexed positionId, address indexed user, int256 pnl, uint256 exitPrice, uint256 duration);
    event PositionLiquidated(uint256 indexed positionId, address indexed user, address indexed liquidator, uint256 reward, uint256 liquidationPrice);

    event MarginCall(uint256 indexed positionId, address indexed user, uint256 marginLevel, uint256 liquidationPrice);
    event LiquidationAttempt(uint256 indexed positionId, address indexed liquidator, bool success, string reason);

    event SystemAlert(string alertType, string message, uint256 timestamp);
    event SuspiciousActivity(address indexed user, string activityType, uint256 value, uint256 timestamp);

    struct EventLog {
        uint256 timestamp;
        address user;
        string eventType;
        string data;
    }

    mapping(uint256 => EventLog) public eventLogs;
    uint256 public eventCounter;

    function logEvent(address user, string calldata eventType, string calldata data) external onlyRole(KEEPER_ROLE) {
        eventLogs[eventCounter] = EventLog({
            timestamp: block.timestamp,
            user: user,
            eventType: eventType,
            data: data
        });
        eventCounter++;
    }

    function emitOrderCreated(uint256 orderId, address user, address tokenIn, address tokenOut, uint256 amountIn, uint256 targetPrice, uint8 orderType) external onlyRole(KEEPER_ROLE) {
        emit OrderCreated(orderId, user, tokenIn, tokenOut, amountIn, targetPrice, orderType);
    }

    function emitOrderExecuted(uint256 orderId, address executor, uint256 amountOut, bool selfExecution) external onlyRole(KEEPER_ROLE) {
        emit OrderExecuted(orderId, executor, amountOut, selfExecution);
    }

    function emitPositionLiquidated(uint256 positionId, address user, address liquidator, uint256 reward, uint256 liquidationPrice) external onlyRole(KEEPER_ROLE) {
        emit PositionLiquidated(positionId, user, liquidator, reward, liquidationPrice);
    }

    function emitMarginCall(uint256 positionId, address user, uint256 marginLevel, uint256 liquidationPrice) external onlyRole(KEEPER_ROLE) {
        emit MarginCall(positionId, user, marginLevel, liquidationPrice);
    }

    function emitSystemAlert(string calldata alertType, string calldata message) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit SystemAlert(alertType, message, block.timestamp);
    }

    function emitSuspiciousActivity(address user, string calldata activityType, uint256 value) external onlyRole(KEEPER_ROLE) {
        emit SuspiciousActivity(user, activityType, value, block.timestamp);
    }

    function getEventLog(uint256 eventId) external view returns (EventLog memory) {
        return eventLogs[eventId];
    }

    function getRecentEvents(uint256 count) external view returns (EventLog[] memory) {
        require(count <= 100, "Too many events requested");

        uint256 startIndex = eventCounter > count ? eventCounter - count : 0;
        uint256 resultCount = eventCounter - startIndex;

        EventLog[] memory recentEvents = new EventLog[](resultCount);

        for (uint256 i = 0; i < resultCount; i++) {
            recentEvents[i] = eventLogs[startIndex + i];
        }

        return recentEvents;
    }
}