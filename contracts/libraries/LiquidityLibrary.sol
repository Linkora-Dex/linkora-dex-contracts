// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

library LiquidityLibrary {

    function addLiquidity(
        mapping(address => uint256) storage ethBalances,
        mapping(address => mapping(address => uint256)) storage tokenBalances,
        mapping(address => uint256) storage totalTokenBalances,
        uint256 ethBalance,
        address user,
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity, uint256 newEthBalance) {
        require(tokenA != tokenB, "Identical tokens");
        require(amountADesired > 0 && amountBDesired > 0, "Invalid amounts");

        newEthBalance = ethBalance;

        if (tokenA == address(0)) {
            require(ethBalances[user] >= amountADesired, "Insufficient ETH balance");
            require(tokenBalances[user][tokenB] >= amountBDesired, "Insufficient token balance");
        } else if (tokenB == address(0)) {
            require(tokenBalances[user][tokenA] >= amountADesired, "Insufficient token balance");
            require(ethBalances[user] >= amountBDesired, "Insufficient ETH balance");
        } else {
            require(tokenBalances[user][tokenA] >= amountADesired, "Insufficient token A balance");
            require(tokenBalances[user][tokenB] >= amountBDesired, "Insufficient token B balance");
        }

        amountA = amountADesired;
        amountB = amountBDesired;

        require(amountA >= amountAMin && amountB >= amountBMin, "Insufficient amounts");

        if (tokenA == address(0)) {
            // ETH + Token ликвидность
            ethBalances[user] -= amountA;
            tokenBalances[user][tokenB] -= amountB;
            // ИСПРАВЛЕНО: ETH остается в пуле, newEthBalance не изменяется
            totalTokenBalances[tokenB] += amountB;
        } else if (tokenB == address(0)) {
            // Token + ETH ликвидность
            tokenBalances[user][tokenA] -= amountA;
            ethBalances[user] -= amountB;
            totalTokenBalances[tokenA] += amountA;
            // ИСПРАВЛЕНО: ETH остается в пуле, newEthBalance не изменяется
        } else {
            // Token + Token ликвидность
            tokenBalances[user][tokenA] -= amountA;
            tokenBalances[user][tokenB] -= amountB;
            totalTokenBalances[tokenA] += amountA;
            totalTokenBalances[tokenB] += amountB;
        }

        liquidity = (amountA * amountB) / 1e18;
    }

    function removeLiquidity(
        mapping(address => uint256) storage ethBalances,
        mapping(address => mapping(address => uint256)) storage tokenBalances,
        mapping(address => uint256) storage totalTokenBalances,
        uint256 ethBalance,
        address user,
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin
    ) external returns (uint256 amountA, uint256 amountB, uint256 newEthBalance) {
        require(tokenA != tokenB, "Identical tokens");
        require(liquidity > 0, "Invalid liquidity");

        newEthBalance = ethBalance;
        uint256 reserveA;
        uint256 reserveB;

        if (tokenA == address(0)) {
            reserveA = ethBalance;
            reserveB = totalTokenBalances[tokenB];
        } else if (tokenB == address(0)) {
            reserveA = totalTokenBalances[tokenA];
            reserveB = ethBalance;
        } else {
            reserveA = totalTokenBalances[tokenA];
            reserveB = totalTokenBalances[tokenB];
        }

        require(reserveA > 0 && reserveB > 0, "No liquidity");

        amountA = (liquidity * reserveA) / ((reserveA * reserveB) / 1e18);
        amountB = (liquidity * reserveB) / ((reserveA * reserveB) / 1e18);

        require(amountA >= amountAMin && amountB >= amountBMin, "Insufficient amounts");

        if (tokenA == address(0)) {
            // Возвращаем ETH + Token
            newEthBalance -= amountA;  // ETH уходит из пула
            totalTokenBalances[tokenB] -= amountB;
            ethBalances[user] += amountA;
            tokenBalances[user][tokenB] += amountB;
        } else if (tokenB == address(0)) {
            // Возвращаем Token + ETH
            totalTokenBalances[tokenA] -= amountA;
            newEthBalance -= amountB;  // ETH уходит из пула
            tokenBalances[user][tokenA] += amountA;
            ethBalances[user] += amountB;
        } else {
            // Возвращаем Token + Token
            totalTokenBalances[tokenA] -= amountA;
            totalTokenBalances[tokenB] -= amountB;
            tokenBalances[user][tokenA] += amountA;
            tokenBalances[user][tokenB] += amountB;
        }
    }
}