// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../libraries/TradingLibrary.sol";
import "./PoolUpgradeable.sol";
import "./OracleUpgradeable.sol";

contract TradingUpgradeable is Initializable, AccessControlUpgradeable, ReentrancyGuardUpgradeable {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    using TradingLibrary for TradingLibrary.Order;
    using TradingLibrary for TradingLibrary.Position;

    PoolUpgradeable public pool;
    OracleUpgradeable public oracle;

    uint256 public nextOrderId;
    uint256 public nextPositionId;

    mapping(uint256 => TradingLibrary.Order) public orders;
    mapping(uint256 => TradingLibrary.Position) public positions;
    mapping(address => uint256[]) public userOrders;
    mapping(address => uint256[]) public userPositions;

    event OrderCreated(uint256 indexed orderId, address indexed user, address tokenIn, address tokenOut, uint256 amountIn);
    event OrderExecuted(uint256 indexed orderId, address indexed executor, uint256 amountOut);
    event OrderCancelled(uint256 indexed orderId, address indexed user);
    event OrderModified(uint256 indexed orderId, uint256 newTargetPrice, uint256 newMinAmountOut);
    event PositionOpened(uint256 indexed positionId, address indexed user, address token, uint256 size);
    event PositionClosed(uint256 indexed positionId, address indexed user, int256 pnl);
    event PositionLiquidated(uint256 indexed positionId, address indexed user, address indexed liquidator, int256 pnl);
    event ExecutionReward(uint256 indexed orderId, address indexed executor, uint256 reward, uint256 timestamp);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _pool, address _oracle) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        pool = PoolUpgradeable(_pool);
        oracle = OracleUpgradeable(_oracle);
        nextOrderId = 1;
        nextPositionId = 1;
    }

    function createLimitOrder(
        address user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 targetPrice,
        uint256 minAmountOut,
        bool isLong
    ) external nonReentrant returns (uint256) {
        TradingLibrary.validateOrderCreation(oracle, user, amountIn, tokenIn, tokenOut);

        if (minAmountOut == 0) {
            minAmountOut = TradingLibrary.calculateMinAmountOut(pool, tokenIn, tokenOut, amountIn);
        }

        pool.lockFunds(user, tokenIn, amountIn);

        orders[nextOrderId] = TradingLibrary.Order({
            id: nextOrderId,
            user: user,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            targetPrice: targetPrice,
            minAmountOut: minAmountOut,
            orderType: TradingLibrary.OrderType.LIMIT,
            isLong: isLong,
            executed: false,
            createdAt: block.timestamp,
            selfExecutable: true
        });

        userOrders[user].push(nextOrderId);
        emit OrderCreated(nextOrderId, user, tokenIn, tokenOut, amountIn);

        return nextOrderId++;
    }

    function createStopLossOrder(
        address user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 stopPrice,
        uint256 minAmountOut
    ) external nonReentrant returns (uint256) {
        TradingLibrary.validateOrderCreation(oracle, user, amountIn, tokenIn, tokenOut);

        if (minAmountOut == 0) {
            minAmountOut = TradingLibrary.calculateMinAmountOut(pool, tokenIn, tokenOut, amountIn);
        }

        pool.lockFunds(user, tokenIn, amountIn);

        orders[nextOrderId] = TradingLibrary.Order({
            id: nextOrderId,
            user: user,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            targetPrice: stopPrice,
            minAmountOut: minAmountOut,
            orderType: TradingLibrary.OrderType.STOP_LOSS,
            isLong: false,
            executed: false,
            createdAt: block.timestamp,
            selfExecutable: true
        });

        userOrders[user].push(nextOrderId);
        emit OrderCreated(nextOrderId, user, tokenIn, tokenOut, amountIn);

        return nextOrderId++;
    }

    function executeOrder(uint256 orderId) external onlyRole(KEEPER_ROLE) nonReentrant {
        (uint256 amountOut, uint256 reward) = TradingLibrary.executeOrder(
            pool,
            oracle,
            orders[orderId],
            msg.sender
        );

        if (reward > 0) {
            emit ExecutionReward(orderId, msg.sender, reward, block.timestamp);
        }

        emit OrderExecuted(orderId, msg.sender, amountOut);
    }

    function selfExecuteOrder(address executor, uint256 orderId) external nonReentrant {
        TradingLibrary.Order storage order = orders[orderId];
        if (!order.selfExecutable) revert TradingLibrary.NotSelfExecutable();

        (uint256 amountOut, uint256 reward) = TradingLibrary.executeOrder(
            pool,
            oracle,
            order,
            executor
        );

        if (reward > 0) {
            emit ExecutionReward(orderId, executor, reward, block.timestamp);
        }

        emit OrderExecuted(orderId, executor, amountOut);
    }

    function cancelOrder(address user, uint256 orderId) external {
        TradingLibrary.Order storage order = orders[orderId];
        if (order.user != user && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert TradingLibrary.NotAuthorized();
        }
        if (order.executed) revert TradingLibrary.OrderExecuted();

        pool.unlockFunds(order.user, order.tokenIn, order.amountIn);
        order.executed = true;

        emit OrderCancelled(orderId, user);
    }

    function modifyOrder(address user, uint256 orderId, uint256 newTargetPrice, uint256 newMinAmountOut) external {
        TradingLibrary.Order storage order = orders[orderId];
        if (order.user != user) revert TradingLibrary.NotOrderOwner();
        if (order.executed) revert TradingLibrary.OrderExecuted();

        if (newMinAmountOut == 0) {
            newMinAmountOut = TradingLibrary.calculateMinAmountOut(pool, order.tokenIn, order.tokenOut, order.amountIn);
        }

        order.targetPrice = newTargetPrice;
        order.minAmountOut = newMinAmountOut;

        emit OrderModified(orderId, newTargetPrice, newMinAmountOut);
    }

    function openPosition(
        address user,
        address token,
        uint256 collateralAmount,
        uint256 leverage,
        bool isLong
    ) external nonReentrant returns (uint256) {
        TradingLibrary.validatePositionCreation(user, collateralAmount, leverage);

        uint256 tokenPrice = oracle.getPrice(token);
        uint256 size = (collateralAmount * leverage * tokenPrice) / 1e18;

        pool.lockFunds(user, address(0), collateralAmount);

        positions[nextPositionId] = TradingLibrary.Position({
            id: nextPositionId,
            user: user,
            token: token,
            collateralAmount: collateralAmount,
            leverage: leverage,
            positionType: isLong ? TradingLibrary.PositionType.LONG : TradingLibrary.PositionType.SHORT,
            entryPrice: tokenPrice,
            size: size,
            createdAt: block.timestamp,
            isOpen: true
        });

        userPositions[user].push(nextPositionId);
        emit PositionOpened(nextPositionId, user, token, size);

        return nextPositionId++;
    }

    function closePosition(address user, uint256 positionId) external nonReentrant {
        TradingLibrary.Position storage position = positions[positionId];
        if (position.user != user && !hasRole(KEEPER_ROLE, msg.sender)) {
            revert TradingLibrary.NotAuthorized();
        }
        if (!position.isOpen) revert TradingLibrary.PositionClosed();

        uint256 currentPrice = oracle.getPrice(position.token);
        int256 pnl = TradingLibrary.calculatePositionPnL(position, currentPrice);

        pool.unlockFunds(position.user, address(0), position.collateralAmount);

        if (pnl > 0) {
            pool.transferToken(address(0), position.user, uint256(pnl));
        }

        position.isOpen = false;
        emit PositionClosed(positionId, user, pnl);
    }

    function liquidatePosition(uint256 positionId) external nonReentrant {
        TradingLibrary.Position storage position = positions[positionId];
        if (!position.isOpen) revert TradingLibrary.PositionClosed();

        uint256 currentPrice = oracle.getPrice(position.token);
        (bool canLiquidate, int256 pnlPercent) = TradingLibrary.isPositionLiquidatable(position, currentPrice);

        if (!canLiquidate) revert TradingLibrary.NotLiquidatable();

        pool.unlockFunds(position.user, address(0), position.collateralAmount);

        uint256 liquidationReward = position.collateralAmount / 20;
        if (liquidationReward > 0) {
            pool.transferFunds(position.user, msg.sender, address(0), liquidationReward);
        }

        position.isOpen = false;
        emit PositionLiquidated(positionId, position.user, msg.sender, pnlPercent);
    }

    function shouldExecuteOrder(uint256 orderId) public view returns (bool) {
        return TradingLibrary.shouldExecuteOrder(oracle, orders[orderId]);
    }

    function canExecuteOrder(uint256 orderId) external view returns (bool) {
        return shouldExecuteOrder(orderId);
    }

    function getCurrentPrice(address tokenIn, address tokenOut) public view returns (uint256) {
        return TradingLibrary.getCurrentPrice(oracle, tokenIn, tokenOut);
    }

    function calculateMinAmountOut(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256) {
        return TradingLibrary.calculateMinAmountOut(pool, tokenIn, tokenOut, amountIn);
    }

    function getOrder(uint256 orderId) external view returns (TradingLibrary.Order memory) {
        return orders[orderId];
    }

    function getPosition(uint256 positionId) external view returns (TradingLibrary.Position memory) {
        return positions[positionId];
    }

    function getOrderUser(uint256 orderId) external view returns (address) {
        return orders[orderId].user;
    }

    function getPositionUser(uint256 positionId) external view returns (address) {
        return positions[positionId].user;
    }

    function getUserOrders(address user) external view returns (uint256[] memory) {
        return userOrders[user];
    }

    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }

    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}