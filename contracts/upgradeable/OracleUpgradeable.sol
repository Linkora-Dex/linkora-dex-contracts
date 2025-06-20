// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

contract OracleUpgradeable is Initializable, AccessControlUpgradeable {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    struct PriceData {
        uint256 price;
        uint256 timestamp;
    }

    struct HistoricalPrice {
        uint256 price;
        uint256 timestamp;
        uint256 blockNumber;
    }

    uint256 public constant MAX_PRICE_CHANGE_PERCENT = 20;
    uint256 public constant PRICE_STALENESS_THRESHOLD = 1 hours;
    uint256 public constant MAX_HISTORICAL_ENTRIES = 100;

    mapping(address => PriceData) public prices;
    mapping(address => HistoricalPrice[]) public historicalPrices;
    mapping(address => uint256) public historicalPriceIndex;

    event PriceUpdated(address indexed token, uint256 oldPrice, uint256 newPrice, uint256 timestamp);
    event SuspiciousPriceChange(address indexed token, uint256 oldPrice, uint256 newPrice, uint256 changePercent);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function updatePrice(address token, uint256 newPrice) external onlyRole(KEEPER_ROLE) {
        require(newPrice > 0, "Price must be positive");

        uint256 oldPrice = prices[token].price;
        if (oldPrice > 0) {
            uint256 priceChange = (newPrice > oldPrice)
                ? (newPrice - oldPrice) * 100 / oldPrice
                : (oldPrice - newPrice) * 100 / oldPrice;

            if (priceChange > MAX_PRICE_CHANGE_PERCENT) {
                emit SuspiciousPriceChange(token, oldPrice, newPrice, priceChange);
                revert("Price change too large");
            }
        }

        _updateHistoricalPrice(token, oldPrice);

        prices[token] = PriceData({
            price: newPrice,
            timestamp: block.timestamp
        });

        emit PriceUpdated(token, oldPrice, newPrice, block.timestamp);
    }

    function batchUpdatePrices(address[] calldata tokens, uint256[] calldata newPrices) external onlyRole(KEEPER_ROLE) {
        require(tokens.length == newPrices.length, "Array length mismatch");
        require(tokens.length <= 10, "Too many tokens");

        for (uint256 i = 0; i < tokens.length; i++) {
            require(newPrices[i] > 0, "Price must be positive");

            uint256 oldPrice = prices[tokens[i]].price;
            if (oldPrice > 0) {
                uint256 priceChange = (newPrices[i] > oldPrice)
                    ? (newPrices[i] - oldPrice) * 100 / oldPrice
                    : (oldPrice - newPrices[i]) * 100 / oldPrice;

                if (priceChange > MAX_PRICE_CHANGE_PERCENT) {
                    emit SuspiciousPriceChange(tokens[i], oldPrice, newPrices[i], priceChange);
                    continue;
                }
            }

            _updateHistoricalPrice(tokens[i], oldPrice);

            prices[tokens[i]] = PriceData({
                price: newPrices[i],
                timestamp: block.timestamp
            });

            emit PriceUpdated(tokens[i], oldPrice, newPrices[i], block.timestamp);
        }
    }

    function getPrice(address token) external view returns (uint256) {
        PriceData memory priceData = prices[token];
        require(priceData.price > 0, "Price not set");
        return priceData.price;
    }

    function isPriceValid(address token) external view returns (bool) {
        PriceData memory priceData = prices[token];
        if (priceData.price == 0) {
            return false;
        }
        return block.timestamp <= priceData.timestamp + PRICE_STALENESS_THRESHOLD;
    }

    function isPriceStale(address token) external view returns (bool) {
        PriceData memory priceData = prices[token];
        if (priceData.price == 0) {
            return true;
        }
        return block.timestamp > priceData.timestamp + PRICE_STALENESS_THRESHOLD;
    }

    function getHistoricalPrice(address token, uint256 timestamp) external view returns (uint256 price) {
        HistoricalPrice[] storage history = historicalPrices[token];

        if (history.length == 0) {
            return 0;
        }

        uint256 closestIndex = 0;
        uint256 closestDiff = type(uint256).max;

        for (uint256 i = 0; i < history.length; i++) {
            uint256 diff = timestamp > history[i].timestamp
                ? timestamp - history[i].timestamp
                : history[i].timestamp - timestamp;

            if (diff < closestDiff) {
                closestDiff = diff;
                closestIndex = i;
            }
        }

        return history[closestIndex].price;
    }

    function getLatestPrices(address[] calldata tokens) external view returns (uint256[] memory priceList, uint256[] memory timestamps) {
        priceList = new uint256[](tokens.length);
        timestamps = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            PriceData memory priceData = prices[tokens[i]];
            priceList[i] = priceData.price;
            timestamps[i] = priceData.timestamp;
        }
    }

    function getPriceHistory(address token, uint256 count) external view returns (HistoricalPrice[] memory) {
        HistoricalPrice[] storage history = historicalPrices[token];

        if (history.length == 0 || count == 0) {
            return new HistoricalPrice[](0);
        }

        uint256 returnCount = count > history.length ? history.length : count;
        HistoricalPrice[] memory result = new HistoricalPrice[](returnCount);

        uint256 startIndex = history.length > returnCount ? history.length - returnCount : 0;

        for (uint256 i = 0; i < returnCount; i++) {
            result[i] = history[startIndex + i];
        }

        return result;
    }

    function emergencyUpdatePrice(address token, uint256 newPrice) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldPrice = prices[token].price;

        _updateHistoricalPrice(token, oldPrice);

        prices[token] = PriceData({
            price: newPrice,
            timestamp: block.timestamp
        });

        emit PriceUpdated(token, oldPrice, newPrice, block.timestamp);
    }

    function initializeHistoricalPrices(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(historicalPrices[token].length == 0, "Already initialized");
        uint256 currentPrice = prices[token].price;

        if (currentPrice > 0) {
            historicalPrices[token].push(HistoricalPrice({
                price: currentPrice,
                timestamp: block.timestamp,
                blockNumber: block.number
            }));
        }
    }

    function _updateHistoricalPrice(address token, uint256 oldPrice) internal {
        if (oldPrice == 0) return;

        HistoricalPrice[] storage history = historicalPrices[token];

        if (history.length >= MAX_HISTORICAL_ENTRIES) {
            for (uint256 i = 0; i < history.length - 1; i++) {
                history[i] = history[i + 1];
            }
            history[history.length - 1] = HistoricalPrice({
                price: oldPrice,
                timestamp: block.timestamp,
                blockNumber: block.number
            });
        } else {
            history.push(HistoricalPrice({
                price: oldPrice,
                timestamp: block.timestamp,
                blockNumber: block.number
            }));
        }
    }

    function getTokenPriceInfo(address token) external view returns (
        uint256 currentPrice,
        uint256 lastUpdate,
        bool isValid,
        bool isStale,
        uint256 historicalCount
    ) {
        PriceData memory priceData = prices[token];
        currentPrice = priceData.price;
        lastUpdate = priceData.timestamp;
        isValid = priceData.price > 0 && block.timestamp <= priceData.timestamp + PRICE_STALENESS_THRESHOLD;
        isStale = priceData.price > 0 && block.timestamp > priceData.timestamp + PRICE_STALENESS_THRESHOLD;
        historicalCount = historicalPrices[token].length;
    }

    function hasHistoricalData(address token) external view returns (bool) {
        return historicalPrices[token].length > 0;
    }

    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}