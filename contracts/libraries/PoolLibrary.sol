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
            // ETH → Token swap
            require(tokenOut != address(0), "Invalid token pair");
            require(ethBalances[user] >= amountIn, "Insufficient ETH balance");

            uint256 ethReserve = ethBalance;
            uint256 tokenReserve = totalTokenBalances[tokenOut];
            require(tokenReserve > 0, "No token liquidity");

            uint8 decimalsOut = IERC20Metadata(tokenOut).decimals();
            amountOut = _calculateAmountOutWithDecimals(amountIn, ethReserve, tokenReserve, 18, decimalsOut);
            require(amountOut >= minAmountOut, "Slippage too high");
            require(tokenReserve >= amountOut, "Insufficient token liquidity");

            // ИСПРАВЛЕННАЯ ЛОГИКА: ETH остается в пуле, токены уходят из пула
            ethBalances[user] -= amountIn;
            tokenBalances[user][tokenOut] += amountOut;
            // newEthBalance остается тем же - ETH от пользователя остается в пуле
            totalTokenBalances[tokenOut] -= amountOut;

        } else if (tokenOut == address(0)) {
            // Token → ETH swap
            require(tokenIn != address(0), "Invalid token pair");
            require(tokenBalances[user][tokenIn] >= amountIn, "Insufficient token balance");

            uint256 tokenReserve = totalTokenBalances[tokenIn];
            uint256 ethReserve = ethBalance;
            require(ethReserve > 0, "No ETH liquidity");

            uint8 decimalsIn = IERC20Metadata(tokenIn).decimals();
            amountOut = _calculateAmountOutWithDecimals(amountIn, tokenReserve, ethReserve, decimalsIn, 18);
            require(amountOut >= minAmountOut, "Slippage too high");
            require(ethReserve >= amountOut, "Insufficient ETH liquidity");

            // ИСПРАВЛЕННАЯ ЛОГИКА: токены остаются в пуле, ETH уходит из пула
            tokenBalances[user][tokenIn] -= amountIn;
            ethBalances[user] += amountOut;
            totalTokenBalances[tokenIn] += amountIn; // токены от пользователя остаются в пуле
            newEthBalance -= amountOut; // ETH уходит из пула к пользователю

        } else {
            // Token → Token swap
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

            // Token → Token: один токен поступает в пул, другой уходит из пула
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
            // newEthBalance остается тем же
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
            uint256 simpleAmountInWithFee = amountIn * 997;
            uint256 simpleNumerator = simpleAmountInWithFee * reserveOut;
            uint256 simpleDenominator = (reserveIn * 1000) + simpleAmountInWithFee;
            return simpleNumerator / simpleDenominator;
        }

        // Случай 2: Разные decimals - используем масштабирование
        uint256 scaledAmountIn = _scaleToEighteenDecimals(amountIn, decimalsIn);
        uint256 scaledReserveIn = _scaleToEighteenDecimals(reserveIn, decimalsIn);
        uint256 scaledReserveOut = _scaleToEighteenDecimals(reserveOut, decimalsOut);

        uint256 scaledAmountInWithFee = scaledAmountIn * 997;
        uint256 scaledNumerator = scaledAmountInWithFee * scaledReserveOut;
        uint256 scaledDenominator = (scaledReserveIn * 1000) + scaledAmountInWithFee;
        uint256 scaledAmountOut = scaledNumerator / scaledDenominator;

        amountOut = _scaleFromEighteenDecimals(scaledAmountOut, decimalsOut);
    }

    function _scaleToEighteenDecimals(
        uint256 amount,
        uint8 decimals
    ) internal pure returns (uint256) {
        if (decimals == 18) {
            return amount;
        } else if (decimals < 18) {
            return amount * (10 ** (18 - decimals));
        } else {
            return amount / (10 ** (decimals - 18));
        }
    }

    function _scaleFromEighteenDecimals(
        uint256 amount,
        uint8 decimals
    ) internal pure returns (uint256) {
        if (decimals == 18) {
            return amount;
        } else if (decimals < 18) {
            return amount / (10 ** (18 - decimals));
        } else {
            return amount * (10 ** (decimals - 18));
        }
    }
}