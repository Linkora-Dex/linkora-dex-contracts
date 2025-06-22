// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../libraries/PoolLibrary.sol";
import "../libraries/LiquidityLibrary.sol";
import "../interfaces/IRouterFeeDistribution.sol";

contract PoolUpgradeable is Initializable, AccessControlUpgradeable, ReentrancyGuardUpgradeable {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    uint256 public ethBalance;

    mapping(address => uint256) public ethBalances;
    mapping(address => mapping(address => uint256)) public tokenBalances;
    mapping(address => uint256) public lockedEthBalances;
    mapping(address => mapping(address => uint256)) public lockedTokenBalances;
    mapping(address => uint256) public totalTokenBalances;
    mapping(address => uint256) private _lastInteractionBlock;

    mapping(address => mapping(address => uint256)) public liquidityContributions;
    mapping(address => uint256) public totalLiquidityContributions;
    mapping(address => uint256) public totalFeesAccumulated;
    mapping(address => uint256) public totalFeesClaimed;
    mapping(address => mapping(address => uint256)) public userFeesClaimed;

    address public router;
    uint256 public baseFeeRate;
    uint256 public feeToStakersPercent;

    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdrawal(address indexed user, address indexed token, uint256 amount);
    event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event FundsLocked(address indexed user, address indexed token, uint256 amount);
    event FundsUnlocked(address indexed user, address indexed token, uint256 amount);
    event FlashLoanAttemptBlocked(address indexed user, uint256 blockNumber);
    event LiquidityAdded(address indexed provider, address indexed tokenA, address indexed tokenB, uint256 amountA, uint256 amountB, uint256 liquidity);
    event LiquidityRemoved(address indexed provider, address indexed tokenA, address indexed tokenB, uint256 amountA, uint256 amountB, uint256 liquidity);
    event FeeDistributed(address indexed token, uint256 lpFee, uint256 stakingFee, uint256 timestamp);
    event FeeClaimed(address indexed user, address indexed token, uint256 amount);
    event TradingDiscountApplied(address indexed user, uint256 originalFee, uint256 discountedFee);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        baseFeeRate = 30;
        feeToStakersPercent = 30;
    }

    function setRouter(address _router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        router = _router;
        _grantRole(KEEPER_ROLE, _router);
    }

    modifier flashLoanProtection() {
        address user = msg.sender;

        if (block.number <= _lastInteractionBlock[user]) {
            emit FlashLoanAttemptBlocked(user, block.number);
            revert("Same block interaction denied");
        }
        _lastInteractionBlock[user] = block.number;
        _;
    }

    function depositETH() external payable nonReentrant flashLoanProtection {
        require(msg.value > 0, "Amount must be greater than 0");

        address depositor = msg.sender;

        ethBalances[depositor] += msg.value;
        ethBalance += msg.value;

        liquidityContributions[depositor][address(0)] += msg.value;
        totalLiquidityContributions[address(0)] += msg.value;

        emit Deposit(depositor, address(0), msg.value);
    }

    function depositETHForUser(address user) external payable onlyRole(KEEPER_ROLE) nonReentrant {
        require(msg.value > 0, "Amount must be greater than 0");
        require(user != address(0), "Invalid user address");

        ethBalances[user] += msg.value;
        ethBalance += msg.value;

        liquidityContributions[user][address(0)] += msg.value;
        totalLiquidityContributions[address(0)] += msg.value;

        emit Deposit(user, address(0), msg.value);
    }

    function depositToken(address token, uint256 amount) external nonReentrant flashLoanProtection {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");

        address depositor = msg.sender;

        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");

        tokenBalances[depositor][token] += amount;
        totalTokenBalances[token] += amount;

        liquidityContributions[depositor][token] += amount;
        totalLiquidityContributions[token] += amount;

        emit Deposit(depositor, token, amount);
    }

    function depositTokenForUser(address token, uint256 amount, address user) external onlyRole(KEEPER_ROLE) nonReentrant {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        require(user != address(0), "Invalid user address");

        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");

        tokenBalances[user][token] += amount;
        totalTokenBalances[token] += amount;

        liquidityContributions[user][token] += amount;
        totalLiquidityContributions[token] += amount;

        emit Deposit(user, token, amount);
    }

    function withdrawETH(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(ethBalances[msg.sender] >= amount, "Insufficient balance");
        require(ethBalances[msg.sender] - lockedEthBalances[msg.sender] >= amount, "Insufficient unlocked balance");

        ethBalances[msg.sender] -= amount;
        ethBalance -= amount;

        uint256 contributionReduction = liquidityContributions[msg.sender][address(0)] >= amount
            ? amount
            : liquidityContributions[msg.sender][address(0)];
        liquidityContributions[msg.sender][address(0)] -= contributionReduction;
        totalLiquidityContributions[address(0)] -= contributionReduction;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawal(msg.sender, address(0), amount);
    }

    function withdrawETHForUser(uint256 amount, address user) external onlyRole(KEEPER_ROLE) nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(user != address(0), "Invalid user address");
        require(msg.sender == user || hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(KEEPER_ROLE, msg.sender), "Unauthorized withdrawal");
        require(ethBalances[user] >= amount, "Insufficient balance");
        require(ethBalances[user] - lockedEthBalances[user] >= amount, "Insufficient unlocked balance");

        ethBalances[user] -= amount;
        ethBalance -= amount;

        uint256 contributionReduction = liquidityContributions[user][address(0)] >= amount
            ? amount
            : liquidityContributions[user][address(0)];
        liquidityContributions[user][address(0)] -= contributionReduction;
        totalLiquidityContributions[address(0)] -= contributionReduction;

        (bool success, ) = user.call{value: amount, gas: 2300}("");
        require(success, "Transfer failed");

        emit Withdrawal(user, address(0), amount);
    }

    function withdrawToken(address token, uint256 amount) external nonReentrant {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        require(tokenBalances[msg.sender][token] >= amount, "Insufficient balance");
        require(tokenBalances[msg.sender][token] - lockedTokenBalances[msg.sender][token] >= amount, "Insufficient unlocked balance");

        tokenBalances[msg.sender][token] -= amount;
        totalTokenBalances[token] -= amount;

        uint256 contributionReduction = liquidityContributions[msg.sender][token] >= amount
            ? amount
            : liquidityContributions[msg.sender][token];
        liquidityContributions[msg.sender][token] -= contributionReduction;
        totalLiquidityContributions[token] -= contributionReduction;

        require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");

        emit Withdrawal(msg.sender, token, amount);
    }

    function withdrawTokenForUser(address token, uint256 amount, address user) external onlyRole(KEEPER_ROLE) nonReentrant {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        require(user != address(0), "Invalid user address");
        require(msg.sender == user || hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(KEEPER_ROLE, msg.sender), "Unauthorized withdrawal");
        require(tokenBalances[user][token] >= amount, "Insufficient balance");
        require(tokenBalances[user][token] - lockedTokenBalances[user][token] >= amount, "Insufficient unlocked balance");

        tokenBalances[user][token] -= amount;
        totalTokenBalances[token] -= amount;

        uint256 contributionReduction = liquidityContributions[user][token] >= amount
            ? amount
            : liquidityContributions[user][token];
        liquidityContributions[user][token] -= contributionReduction;
        totalLiquidityContributions[token] -= contributionReduction;

        require(IERC20(token).transfer(user, amount), "Transfer failed");

        emit Withdrawal(user, token, amount);
    }

    function swapTokens(address user, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)
        external nonReentrant flashLoanProtection returns (uint256 amountOut) {

        (amountOut, ethBalance) = PoolLibrary.executeSwap(
            ethBalances,
            tokenBalances,
            totalTokenBalances,
            ethBalance,
            user,
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut
        );

        uint256 fee = _calculateTradingFee(user, amountIn);
        _distributeFee(tokenIn, fee);

        emit Swap(user, tokenIn, tokenOut, amountIn, amountOut);
    }

    function executeSwapForUser(address user, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)
        external onlyRole(KEEPER_ROLE) nonReentrant returns (uint256 amountOut) {

        (amountOut, ethBalance) = PoolLibrary.executeSwapForUser(
            ethBalances,
            tokenBalances,
            lockedEthBalances,
            lockedTokenBalances,
            totalTokenBalances,
            ethBalance,
            user,
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut
        );

        uint256 fee = _calculateTradingFee(user, amountIn);
        _distributeFee(tokenIn, fee);

        emit Swap(user, tokenIn, tokenOut, amountIn, amountOut);
    }

    function _calculateTradingFee(address user, uint256 amountIn) internal returns (uint256) {
        uint256 baseFee = (amountIn * baseFeeRate) / 10000;

        if (router != address(0)) {
            try IRouterFeeDistribution(router).getTradingDiscount(user) returns (uint256 discountBps) {
                if (discountBps > 0) {
                    uint256 discountedFee = baseFee - (baseFee * discountBps / 10000);
                    emit TradingDiscountApplied(user, baseFee, discountedFee);
                    return discountedFee;
                }
            } catch {}
        }

        return baseFee;
    }

    function _distributeFee(address token, uint256 feeAmount) internal {
        if (feeAmount == 0) return;

        uint256 lpFee = (feeAmount * (100 - feeToStakersPercent)) / 100;
        uint256 stakingFee = feeAmount - lpFee;

        if (lpFee > 0) {
            totalFeesAccumulated[token] += lpFee;
            if (token == address(0)) {
                ethBalance += lpFee;
                totalLiquidityContributions[address(0)] += lpFee;
            } else {
                totalTokenBalances[token] += lpFee;
                totalLiquidityContributions[token] += lpFee;
            }
        }

        if (stakingFee > 0 && router != address(0)) {
            try IRouterFeeDistribution(router).distributeStakingRewards(token, stakingFee) {
            } catch {}
        }

        emit FeeDistributed(token, lpFee, stakingFee, block.timestamp);
    }



    function claimFees(address token) external nonReentrant {
        uint256 userContribution = liquidityContributions[msg.sender][token];
        require(userContribution > 0, "No liquidity contribution");

        uint256 totalContribution = totalLiquidityContributions[token];
        uint256 totalFees = totalFeesAccumulated[token];

        uint256 userShare = (totalFees * userContribution) / totalContribution;
        uint256 alreadyClaimed = userFeesClaimed[msg.sender][token];

        require(userShare > alreadyClaimed, "No fees to claim");

        uint256 claimableAmount = userShare - alreadyClaimed;

        userFeesClaimed[msg.sender][token] = userShare;
        totalFeesClaimed[token] += claimableAmount;

        if (token == address(0)) {
            ethBalances[msg.sender] += claimableAmount;
        } else {
            tokenBalances[msg.sender][token] += claimableAmount;
        }

        emit FeeClaimed(msg.sender, token, claimableAmount);
    }

    function getClaimableFees(address user, address token) external view returns (uint256) {
        uint256 userContribution = liquidityContributions[user][token];
        if (userContribution == 0) return 0;

        uint256 totalContribution = totalLiquidityContributions[token];
        if (totalContribution == 0) return 0;

        uint256 totalFees = totalFeesAccumulated[token];
        uint256 userShare = (totalFees * userContribution) / totalContribution;
        uint256 alreadyClaimed = userFeesClaimed[user][token];

        return userShare > alreadyClaimed ? userShare - alreadyClaimed : 0;
    }

    function getLiquidityStats(address token) external view returns (
        uint256 totalContributions,
        uint256 totalFeesAcc,
        uint256 totalFeesCla,
        uint256 availableFees
    ) {
        totalContributions = totalLiquidityContributions[token];
        totalFeesAcc = totalFeesAccumulated[token];
        totalFeesCla = totalFeesClaimed[token];
        availableFees = totalFeesAcc - totalFeesCla;
    }

    function getUserLiquidityInfo(address user, address token) external view returns (
        uint256 contribution,
        uint256 sharePercentage,
        uint256 claimableFees,
        uint256 totalClaimed
    ) {
        contribution = liquidityContributions[user][token];
        sharePercentage = totalLiquidityContributions[token] > 0
            ? (contribution * 10000) / totalLiquidityContributions[token]
            : 0;
        claimableFees = this.getClaimableFees(user, token);
        totalClaimed = userFeesClaimed[user][token];
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) external nonReentrant returns (uint256 amountA, uint256 amountB, uint256 liquidity) {

        (amountA, amountB, liquidity, ethBalance) = LiquidityLibrary.addLiquidity(
            ethBalances,
            tokenBalances,
            totalTokenBalances,
            ethBalance,
            msg.sender,
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin
        );

        emit LiquidityAdded(msg.sender, tokenA, tokenB, amountA, amountB, liquidity);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin
    ) external nonReentrant returns (uint256 amountA, uint256 amountB) {

        (amountA, amountB, ethBalance) = LiquidityLibrary.removeLiquidity(
            ethBalances,
            tokenBalances,
            totalTokenBalances,
            ethBalance,
            msg.sender,
            tokenA,
            tokenB,
            liquidity,
            amountAMin,
            amountBMin
        );

        emit LiquidityRemoved(msg.sender, tokenA, tokenB, amountA, amountB, liquidity);
    }

    function getAmountOut(uint256 amountIn, address tokenIn, address tokenOut) external view returns (uint256 amountOut) {
        return PoolLibrary.calculateAmountOut(
            amountIn,
            tokenIn,
            tokenOut,
            ethBalance,
            totalTokenBalances
        );
    }

    function lockFunds(address user, address token, uint256 amount) external onlyRole(KEEPER_ROLE) {
        if (token == address(0)) {
            require(ethBalances[user] >= amount, "Insufficient ETH balance");
            lockedEthBalances[user] += amount;
        } else {
            require(tokenBalances[user][token] >= amount, "Insufficient token balance");
            lockedTokenBalances[user][token] += amount;
        }
        emit FundsLocked(user, token, amount);
    }

    function unlockFunds(address user, address token, uint256 amount) external onlyRole(KEEPER_ROLE) {
        if (token == address(0)) {
            require(lockedEthBalances[user] >= amount, "Insufficient locked ETH");
            lockedEthBalances[user] -= amount;
        } else {
            require(lockedTokenBalances[user][token] >= amount, "Insufficient locked tokens");
            lockedTokenBalances[user][token] -= amount;
        }
        emit FundsUnlocked(user, token, amount);
    }

    function transferFunds(address from, address to, address token, uint256 amount) external onlyRole(KEEPER_ROLE) {
        if (token == address(0)) {
            require(ethBalances[from] >= amount, "Insufficient ETH balance");
            ethBalances[from] -= amount;
            ethBalances[to] += amount;
        } else {
            require(tokenBalances[from][token] >= amount, "Insufficient token balance");
            tokenBalances[from][token] -= amount;
            tokenBalances[to][token] += amount;
        }
    }

    function transferToken(address token, address to, uint256 amount) external payable onlyRole(KEEPER_ROLE) {
        if (token == address(0)) {
            require(msg.value >= amount, "Insufficient ETH sent");
            ethBalance += msg.value;
            ethBalances[to] += amount;
        } else {
            require(totalTokenBalances[token] >= amount, "Insufficient pool tokens");
            totalTokenBalances[token] -= amount;
            tokenBalances[to][token] += amount;
        }
    }

    function getBalance(address user, address token) external view returns (uint256) {
        if (token == address(0)) {
            return ethBalances[user];
        } else {
            return tokenBalances[user][token];
        }
    }

    function getAvailableBalance(address user, address token) external view returns (uint256) {
        if (token == address(0)) {
            return ethBalances[user] - lockedEthBalances[user];
        } else {
            return tokenBalances[user][token] - lockedTokenBalances[user][token];
        }
    }

    function setBaseFeeRate(uint256 _feeRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_feeRate <= 100, "Fee rate too high");
        baseFeeRate = _feeRate;
    }

    function setFeeToStakersPercent(uint256 _percent) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_percent <= 50, "Max 50%");
        feeToStakersPercent = _percent;
    }

    function version() external pure returns (string memory) {
        return "1.1.0";
    }
}