// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Historical weekly cUSD reward escrow controlled by the deployer.
/// The leaderboard is calculated off-chain; a backend signer authorizes only
/// the verified winner of a completed week to create an on-chain request.
contract WeeklyRewardsEscrow is Ownable {
    using SafeERC20 for IERC20;
    using ECDSAWeekly for bytes32;

    uint256 public constant WEEK = 7 days;
    IERC20 public immutable cUSD;
    address public immutable requestSigner;

    struct Reward {
        bool requested;
        bool withdrawn;
        uint256 approvedAmount;
    }

    mapping(uint256 => mapping(address => Reward)) public rewards;

    bytes32 private constant REQUEST_TYPEHASH = keccak256(
        "RewardRequest(address player,uint256 week,uint256 deadline)"
    );
    bytes32 private immutable DOMAIN_SEPARATOR;

    event RewardRequested(uint256 indexed week, address indexed player);
    event RewardApproved(uint256 indexed week, address indexed player, uint256 amount);
    event RewardWithdrawn(uint256 indexed week, address indexed player, uint256 amount);
    event Funded(address indexed admin, uint256 amount);
    event Drained(address indexed admin, address indexed recipient, uint256 amount);

    error AlreadyRequested();
    error NotRequested();
    error NotApproved();
    error AlreadyWithdrawn();
    error InsufficientEscrowBalance();
    error ZeroAddress();
    error CurrentWeekNotRequestable();
    error SignatureExpired();
    error InvalidSignature();

    constructor(address cUSD_, address requestSigner_) Ownable(msg.sender) {
        if (cUSD_ == address(0) || requestSigner_ == address(0)) revert ZeroAddress();
        cUSD = IERC20(cUSD_);
        requestSigner = requestSigner_;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Celo Rush Weekly Rewards")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function currentWeek() public view returns (uint256) {
        return block.timestamp / WEEK;
    }

    function requestReward(uint256 week, uint256 deadline, bytes calldata signature) external {
        if (week >= currentWeek()) revert CurrentWeekNotRequestable();
        if (block.timestamp > deadline) revert SignatureExpired();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(REQUEST_TYPEHASH, msg.sender, week, deadline))
            )
        );
        if (digest.recover(signature) != requestSigner) revert InvalidSignature();

        Reward storage reward = rewards[week][msg.sender];
        if (reward.requested) revert AlreadyRequested();
        reward.requested = true;
        emit RewardRequested(week, msg.sender);
    }

    function approveReward(uint256 week, address player, uint256 amount) external onlyOwner {
        if (player == address(0)) revert ZeroAddress();
        Reward storage reward = rewards[week][player];
        if (!reward.requested) revert NotRequested();
        if (reward.withdrawn) revert AlreadyWithdrawn();
        reward.approvedAmount = amount;
        emit RewardApproved(week, player, amount);
    }

    function withdrawReward(uint256 week) external {
        Reward storage reward = rewards[week][msg.sender];
        if (!reward.requested) revert NotRequested();
        if (reward.approvedAmount == 0) revert NotApproved();
        if (reward.withdrawn) revert AlreadyWithdrawn();
        uint256 amount = reward.approvedAmount;
        if (cUSD.balanceOf(address(this)) < amount) revert InsufficientEscrowBalance();

        reward.withdrawn = true;
        cUSD.safeTransfer(msg.sender, amount);
        emit RewardWithdrawn(week, msg.sender, amount);
    }

    /// @dev The owner must approve cUSD allowance before calling this function.
    function fund(uint256 amount) external onlyOwner {
        cUSD.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    /// @dev Deliberately has no reservation or liability constraint. The owner
    /// may drain funds at any time; a later withdrawal reverts until refilled.
    function drain(address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        cUSD.safeTransfer(recipient, amount);
        emit Drained(msg.sender, recipient, amount);
    }
}

library ECDSAWeekly {
    function recover(bytes32 hash, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "ECDSA: invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "ECDSA: invalid signature v");
        return ecrecover(hash, v, r, s);
    }
}
