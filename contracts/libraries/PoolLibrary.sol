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

        // Приводим все к одной базе для вычислений (используем максимальные decimals)
        uint8 maxDecimals = decimalsIn > decimalsOut ? decimalsIn : decimalsOut;
        maxDecimals = maxDecimals > 18 ? maxDecimals : 18; // минимум 18 для точности

        uint256 normalizedAmountIn = _normalizeDecimals(amountIn, decimalsIn, maxDecimals);
        uint256 normalizedReserveIn = _normalizeDecimals(reserveIn, decimalsIn, maxDecimals);
        uint256 normalizedReserveOut = _normalizeDecimals(reserveOut, decimalsOut, maxDecimals);

        // Стандартная формула AMM с комиссией 0.3%
        uint256 amountInWithFee = normalizedAmountIn * 997;
        uint256 numerator = amountInWithFee * normalizedReserveOut;
        uint256 denominator = (normalizedReserveIn * 1000) + amountInWithFee;
        uint256 normalizedAmountOut = numerator / denominator;

        // Возвращаем в нужные decimals
        amountOut = _denormalizeDecimals(normalizedAmountOut, maxDecimals, decimalsOut);
    }

    function _normalizeDecimals(uint256 amount, uint8 fromDecimals, uint8 toDecimals) internal pure returns (uint256) {
        if (fromDecimals == toDecimals) {
            return amount;
        } else if (fromDecimals < toDecimals) {
            return amount * (10 ** (toDecimals - fromDecimals));
        } else {
            return amount / (10 ** (fromDecimals - toDecimals));
        }
    }

    function _denormalizeDecimals(uint256 amount, uint8 fromDecimals, uint8 toDecimals) internal pure returns (uint256) {
        if (fromDecimals == toDecimals) {
            return amount;
        } else if (fromDecimals > toDecimals) {
            return amount / (10 ** (fromDecimals - toDecimals));
        } else {
            return amount * (10 ** (toDecimals - fromDecimals));
        }
    }


}