// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

library PoolLibrary {

    uint256 private constant PRECISION = 1e18;

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

            uint8 decimalsOut = IERC20Metadata(tokenOut).decimals();
            amountOut = _calculateAmountOutWithDecimals(amountIn, ethReserve, tokenReserve, 18, decimalsOut);
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

            uint8 decimalsIn = IERC20Metadata(tokenIn).decimals();
            amountOut = _calculateAmountOutWithDecimals(amountIn, tokenReserve, ethReserve, decimalsIn, 18);
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

            uint8 decimalsIn = IERC20Metadata(tokenIn).decimals();
            uint8 decimalsOut = IERC20Metadata(tokenOut).decimals();
            amountOut = _calculateAmountOutWithDecimals(amountIn, tokenInReserve, tokenOutReserve, decimalsIn, decimalsOut);
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

            uint8 decimalsOut = IERC20Metadata(tokenOut).decimals();
            amountOut = _calculateAmountOutWithDecimals(amountIn, ethReserve, tokenReserve, 18, decimalsOut);
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

            uint8 decimalsIn = IERC20Metadata(tokenIn).decimals();
            amountOut = _calculateAmountOutWithDecimals(amountIn, tokenReserve, ethReserve, decimalsIn, 18);
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

            uint8 decimalsIn = IERC20Metadata(tokenIn).decimals();
            uint8 decimalsOut = IERC20Metadata(tokenOut).decimals();
            amountOut = _calculateAmountOutWithDecimals(amountIn, tokenInReserve, tokenOutReserve, decimalsIn, decimalsOut);
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
        uint8 decimalsIn;
        uint8 decimalsOut;

        if (tokenIn == address(0)) {
            reserveIn = ethBalance;
            reserveOut = totalTokenBalances[tokenOut];
            decimalsIn = 18;
            decimalsOut = IERC20Metadata(tokenOut).decimals();
        } else if (tokenOut == address(0)) {
            reserveIn = totalTokenBalances[tokenIn];
            reserveOut = ethBalance;
            decimalsIn = IERC20Metadata(tokenIn).decimals();
            decimalsOut = 18;
        } else {
            reserveIn = totalTokenBalances[tokenIn];
            reserveOut = totalTokenBalances[tokenOut];
            decimalsIn = IERC20Metadata(tokenIn).decimals();
            decimalsOut = IERC20Metadata(tokenOut).decimals();
        }

        require(reserveIn > 0 && reserveOut > 0, "No liquidity");
        amountOut = _calculateAmountOutWithDecimals(amountIn, reserveIn, reserveOut, decimalsIn, decimalsOut);
    }

    function _calculateAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, "Invalid input amount");
        require(reserveIn > 0 && reserveOut > 0, "Invalid reserves");

        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /**
     * @dev ИСПРАВЛЕННАЯ функция расчета с поддержкой разных decimals
     * Пошаговая математика:
     * 1. Если decimals одинаковые - используем простую формулу
     * 2. Если разные - приводим к общему базису через масштабирование
     * 3. Выполняем AMM расчет в едином базисе
     * 4. Приводим результат к нужной точности
     */
    function _calculateAmountOutWithDecimals(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut,
        uint8 decimalsIn,
        uint8 decimalsOut
    ) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, "Invalid input amount");
        require(reserveIn > 0 && reserveOut > 0, "Invalid reserves");

        // Случай 1: Одинаковые decimals - простой расчет
        if (decimalsIn == decimalsOut) {
            uint256 amountInWithFee = amountIn * 997;
            uint256 numerator = amountInWithFee * reserveOut;
            uint256 denominator = (reserveIn * 1000) + amountInWithFee;
            return numerator / denominator;
        }

        // Случай 2: Разные decimals - используем масштабирование
        // Приводим все к базису 18 decimals для точности
        uint256 scaledAmountIn = _scaleToEighteenDecimals(amountIn, decimalsIn);
        uint256 scaledReserveIn = _scaleToEighteenDecimals(reserveIn, decimalsIn);
        uint256 scaledReserveOut = _scaleToEighteenDecimals(reserveOut, decimalsOut);

        // AMM расчет в едином базисе
        uint256 amountInWithFee = scaledAmountIn * 997;
        uint256 numerator = amountInWithFee * scaledReserveOut;
        uint256 denominator = (scaledReserveIn * 1000) + amountInWithFee;
        uint256 scaledAmountOut = numerator / denominator;

        // Приводим результат к нужной точности
        amountOut = _scaleFromEighteenDecimals(scaledAmountOut, decimalsOut);
    }

    /**
     * @dev Приводит значение к 18 decimals
     * Математика:
     * - Если decimals < 18: умножаем на 10^(18-decimals)
     * - Если decimals = 18: возвращаем как есть
     * - Если decimals > 18: делим на 10^(decimals-18)
     */
    function _scaleToEighteenDecimals(
        uint256 amount,
        uint8 decimals
    ) internal pure returns (uint256) {
        if (decimals == 18) {
            return amount;
        } else if (decimals < 18) {
            return amount * (10 ** (18 - decimals));
        } else {
            // Редкий случай: токены с > 18 decimals
            return amount / (10 ** (decimals - 18));
        }
    }

    /**
     * @dev Приводит значение от 18 decimals к нужной точности
     * Математика:
     * - Если decimals < 18: делим на 10^(18-decimals)
     * - Если decimals = 18: возвращаем как есть
     * - Если decimals > 18: умножаем на 10^(decimals-18)
     */
    function _scaleFromEighteenDecimals(
        uint256 amount,
        uint8 decimals
    ) internal pure returns (uint256) {
        if (decimals == 18) {
            return amount;
        } else if (decimals < 18) {
            return amount / (10 ** (18 - decimals));
        } else {
            // Редкий случай: токены с > 18 decimals
            return amount * (10 ** (decimals - 18));
        }
    }
}