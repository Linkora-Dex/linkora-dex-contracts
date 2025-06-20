// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IRouterFeeDistribution {
    function distributeStakingRewards(address token, uint256 amount) external;
    function getTradingDiscount(address user) external view returns (uint256);
}