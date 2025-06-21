// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../libraries/RouterLibrary.sol";
import "../libraries/TradingLibrary.sol";
import "./PoolUpgradeable.sol";
import "./TradingUpgradeable.sol";
import "./OracleUpgradeable.sol";
import "../governance/GovernanceToken.sol";
import "../access/AccessControl.sol";

contract RouterUpgradeable is Initializable, AccessControlUpgradeable {
  bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

  PoolUpgradeable public pool;
  TradingUpgradeable public trading;
  OracleUpgradeable public oracle;
  GovernanceToken public governanceToken;
  AccessControlContract public accessControl;

  mapping(address => uint256) public stakingRewards;
  mapping(address => uint256) public totalRewardsDistributed;

  uint256 public feeToStakersPercent;
  uint256 public liquidityMiningRate;

  event ContractUpdated(string indexed contractType, address indexed newAddress);
  event GovernanceTokenSet(address indexed token);
  event StakingRewardsDistributed(address indexed token, uint256 amount);
  event TradingDiscountApplied(address indexed user, uint256 discountBps);

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
      _disableInitializers();
  }

  function initialize(address _pool, address _trading, address _oracle) public initializer {
      __AccessControl_init();
      _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

      pool = PoolUpgradeable(_pool);
      if (_trading != address(0)) {
          trading = TradingUpgradeable(_trading);
      }
      oracle = OracleUpgradeable(_oracle);

      feeToStakersPercent = 30;
      liquidityMiningRate = 1000;
  }

  function setAccessControl(address _accessControl) external onlyRole(DEFAULT_ADMIN_ROLE) {
      require(_accessControl != address(0), "Invalid access control address");
      accessControl = AccessControlContract(_accessControl);
  }

  function getPoolAddress() external view returns (address) {
      return address(pool);
  }

  function getTradingAddress() external view returns (address) {
      return address(trading);
  }

  function getOracleAddress() external view returns (address) {
      return address(oracle);
  }

  function getGovernanceTokenAddress() external view returns (address) {
      return address(governanceToken);
  }

  function getAccessControlAddress() external view returns (address) {
      return address(accessControl);
  }

  function isSystemPaused() external view returns (bool) {
      if (address(accessControl) == address(0)) return false;
      return accessControl.emergencyStop();
  }

  function emergencyStop() external view returns (bool) {
      return this.isSystemPaused();
  }

  function setGovernanceToken(address payable _governanceToken) external onlyRole(DEFAULT_ADMIN_ROLE) {
      require(_governanceToken != address(0), "Invalid token address");
      governanceToken = GovernanceToken(_governanceToken);
      emit GovernanceTokenSet(_governanceToken);
  }

  function depositETH() external payable {
      if (msg.value == 0) revert RouterLibrary.InvalidAmount();

      pool.depositETHForUser{value: msg.value}(msg.sender);

      if (address(governanceToken) != address(0)) {
          _mintLiquidityRewards(msg.sender, msg.value, address(0));
      }

      emit ContractUpdated("DepositETH", msg.sender);
  }

  function depositToken(address token, uint256 amount) external {
      RouterLibrary.depositToken(pool, token, amount, msg.sender, msg.sender);

      if (address(governanceToken) != address(0)) {
          _mintLiquidityRewards(msg.sender, amount, token);
      }

      emit ContractUpdated("DepositToken", msg.sender);
  }

  function withdrawETH(uint256 amount) external {
      pool.withdrawETHForUser(amount, msg.sender);
  }

  function withdrawToken(address token, uint256 amount) external {
      pool.withdrawTokenForUser(token, amount, msg.sender);
  }

  function swapTokens(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)
      external payable returns (uint256 amountOut) {

      if (tokenIn == address(0) && msg.value > 0) {
          pool.depositETHForUser{value: msg.value}(msg.sender);
      }

      uint256 discountBps = _getTradingDiscount(msg.sender);
      if (discountBps > 0) {
          emit TradingDiscountApplied(msg.sender, discountBps);
      }

      amountOut = pool.swapTokens(msg.sender, tokenIn, tokenOut, amountIn, minAmountOut);

      if (address(governanceToken) != address(0)) {
          _mintTradingRewards(msg.sender, amountIn);
      }

      return amountOut;
  }

  function createLimitOrder(
      address tokenIn,
      address tokenOut,
      uint256 amountIn,
      uint256 targetPrice,
      uint256 minAmountOut,
      bool isLong
  ) external payable returns (uint256) {
      if (address(trading) == address(0)) revert RouterLibrary.InvalidTokenAddress();

      if (tokenIn == address(0) && msg.value > 0) {
          pool.depositETHForUser{value: msg.value}(msg.sender);
      }

      _requirePremiumIfNeeded();

      return trading.createLimitOrder(msg.sender, tokenIn, tokenOut, amountIn, targetPrice, minAmountOut, isLong);
  }

  function createStopLossOrder(
      address tokenIn,
      address tokenOut,
      uint256 amountIn,
      uint256 stopPrice,
      uint256 minAmountOut
  ) external payable returns (uint256) {
      if (address(trading) == address(0)) revert RouterLibrary.InvalidTokenAddress();

      if (tokenIn == address(0) && msg.value > 0) {
          pool.depositETHForUser{value: msg.value}(msg.sender);
      }

      return trading.createStopLossOrder(msg.sender, tokenIn, tokenOut, amountIn, stopPrice, minAmountOut);
  }

  function openPosition(
      address token,
      uint256 collateralAmount,
      uint256 leverage,
      bool isLong
  ) external payable returns (uint256) {
      if (msg.value > 0) {
          pool.depositETHForUser{value: msg.value}(msg.sender);
      }

      _requirePremiumIfNeeded();

      return trading.openPosition(msg.sender, token, collateralAmount, leverage, isLong);
  }

  function closePosition(uint256 positionId) external {
      trading.closePosition(msg.sender, positionId);
  }

  function selfExecuteOrder(uint256 orderId) external {
      trading.selfExecuteOrder(msg.sender, orderId);

      if (address(governanceToken) != address(0)) {
          uint256 executionReward = 100 * 10**18;
          governanceToken.mint(msg.sender, executionReward);
      }
  }

  function distributeStakingRewards(address token, uint256 amount) external {
      require(msg.sender == address(pool), "Only pool can distribute");

      if (address(governanceToken) != address(0) && governanceToken.totalStaked() > 0) {
          stakingRewards[token] += amount;
          totalRewardsDistributed[token] += amount;

          governanceToken.distributeRewards(amount);
          emit StakingRewardsDistributed(token, amount);
      }
  }

  function claimLPFees(address token) external {
      pool.claimFees(token);
  }

  function getClaimableLPFees(address user, address token) external view returns (uint256) {
      return pool.getClaimableFees(user, token);
  }

  function cancelOrder(uint256 orderId) external {
      trading.cancelOrder(msg.sender, orderId);
  }

  function modifyOrder(uint256 orderId, uint256 newTargetPrice, uint256 newMinAmountOut) external {
      trading.modifyOrder(msg.sender, orderId, newTargetPrice, newMinAmountOut);
  }

  function liquidatePosition(uint256 positionId) external {
      trading.liquidatePosition(positionId);

      if (address(governanceToken) != address(0)) {
          uint256 liquidationReward = 50 * 10**18;
          governanceToken.mint(msg.sender, liquidationReward);
      }
  }

  function executeOrder(uint256 orderId) external onlyRole(KEEPER_ROLE) {
      trading.executeOrder(orderId);
  }

  function _getTradingDiscount(address user) internal view returns (uint256) {
      if (address(governanceToken) == address(0)) return 0;
      return governanceToken.getTradingDiscount(user);
  }

  function _requirePremiumIfNeeded() internal view {
      if (address(governanceToken) != address(0)) {
          require(governanceToken.isPremiumUser(msg.sender), "Premium access required");
      }
  }

  function _mintLiquidityRewards(address user, uint256 amount, address token) internal {
      uint256 usdValue = _getUSDValue(amount, token);
      uint256 rewardAmount = (usdValue * liquidityMiningRate) / 10000;

      if (rewardAmount > 0) {
          governanceToken.mint(user, rewardAmount);
      }
  }

  function _mintTradingRewards(address user, uint256 amount) internal {
      uint256 rewardAmount = amount / 1000;

      if (rewardAmount > 0) {
          governanceToken.mint(user, rewardAmount);
      }
  }

  function _getUSDValue(uint256 amount, address token) internal view returns (uint256) {
      uint256 price = oracle.getPrice(token);
      return (amount * price) / 10**18;
  }

  function setTradingAddress(address _trading) external onlyRole(DEFAULT_ADMIN_ROLE) {
      if (address(trading) != address(0) && address(trading) != _trading) {
          revert RouterLibrary.InvalidTokenAddress();
      }
      trading = TradingUpgradeable(_trading);
      emit ContractUpdated("Trading", _trading);
  }

  function setFeeToStakersPercent(uint256 _percent) external onlyRole(DEFAULT_ADMIN_ROLE) {
      require(_percent <= 50, "Max 50%");
      feeToStakersPercent = _percent;
  }

  function setLiquidityMiningRate(uint256 _rate) external onlyRole(DEFAULT_ADMIN_ROLE) {
      require(_rate <= 5000, "Max 50%");
      liquidityMiningRate = _rate;
  }

  function getPrice(address token) external view returns (uint256) {
      return oracle.getPrice(token);
  }

  function getOraclePrice(address token) external view returns (uint256) {
      return oracle.getPrice(token);
  }

  function isOraclePriceValid(address token) external view returns (bool) {
      return oracle.isPriceValid(token);
  }

  function updateOraclePrice(address token, uint256 price) external onlyRole(KEEPER_ROLE) {
      oracle.updatePrice(token, price);
  }

  function batchUpdateOraclePrices(address[] calldata tokens, uint256[] calldata prices) external onlyRole(KEEPER_ROLE) {
      oracle.batchUpdatePrices(tokens, prices);
  }

  function getBalance(address user, address token) external view returns (uint256) {
      return pool.getBalance(user, token);
  }

  function getAvailableBalance(address user, address token) external view returns (uint256) {
      return pool.getAvailableBalance(user, token);
  }

  function getAmountOut(uint256 amountIn, address tokenIn, address tokenOut) external view returns (uint256) {
      return pool.getAmountOut(amountIn, tokenIn, tokenOut);
  }

  function getUserTokenomicsInfo(address user) external view returns (
      uint256 balance,
      uint256 staked,
      uint256 rewards,
      uint256 votingPower,
      uint256 discountBps,
      bool premium
  ) {
      if (address(governanceToken) == address(0)) {
          return (0, 0, 0, 0, 0, false);
      }

      (balance, staked, rewards, discountBps) = governanceToken.getUserStakingInfo(user);
      votingPower = governanceToken.getVotingPower(user);
      premium = governanceToken.isPremiumUser(user);
  }

  function getTokenomicsStats() external view returns (
      uint256 totalSupply,
      uint256 totalStaked,
      uint256 stakingAPR,
      address tokenAddress
  ) {
      if (address(governanceToken) == address(0)) {
          return (0, 0, 0, address(0));
      }

      totalSupply = governanceToken.totalSupply();
      totalStaked = governanceToken.totalStaked();
      stakingAPR = governanceToken.rewardRate();
      tokenAddress = address(governanceToken);
  }

  function getPositionUser(uint256 positionId) external view returns (address) {
      return trading.getPositionUser(positionId);
  }

  function getOrderUser(uint256 orderId) external view returns (address) {
      return trading.getOrderUser(orderId);
  }

  function canExecuteOrder(uint256 orderId) external view returns (bool) {
      return trading.shouldExecuteOrder(orderId);
  }

  function closePositionAsKeeper(uint256 positionId) external onlyRole(KEEPER_ROLE) {
      address positionUser = trading.getPositionUser(positionId);
      trading.closePosition(positionUser, positionId);
  }

  function getOrder(uint256 orderId) external view returns (TradingLibrary.Order memory) {
      return trading.getOrder(orderId);
  }

  function getPosition(uint256 positionId) external view returns (TradingLibrary.Position memory) {
      return trading.getPosition(positionId);
  }

  function getUserOrders(address user) external view returns (uint256[] memory) {
      return trading.getUserOrders(user);
  }

  function getUserPositions(address user) external view returns (uint256[] memory) {
      return trading.getUserPositions(user);
  }

  function shouldExecuteOrder(uint256 orderId) external view returns (bool) {
      return trading.shouldExecuteOrder(orderId);
  }

  function getCurrentPrice(address tokenIn, address tokenOut) external view returns (uint256) {
      return trading.getCurrentPrice(tokenIn, tokenOut);
  }

  function calculateMinAmountOut(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256) {
      return trading.calculateMinAmountOut(tokenIn, tokenOut, amountIn);
  }

  function getNextOrderId() external view returns (uint256) {
      return trading.nextOrderId();
  }

  function getNextPositionId() external view returns (uint256) {
      return trading.nextPositionId();
  }

  function getTradingDiscount(address user) external view returns (uint256) {
      return _getTradingDiscount(user);
  }

  function version() external pure returns (string memory) {
      return "1.1.0";
  }

  receive() external payable {
      if (msg.value == 0) revert RouterLibrary.InvalidAmount();

      pool.depositETHForUser{value: msg.value}(msg.sender);

      if (address(governanceToken) != address(0)) {
          _mintLiquidityRewards(msg.sender, msg.value, address(0));
      }

      emit ContractUpdated("ReceiveETH", msg.sender);
  }
}