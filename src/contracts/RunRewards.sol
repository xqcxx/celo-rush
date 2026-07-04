// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GameToken.sol";

contract RunRewards {
    using ECDSA for bytes32;

    GameToken public token;
    address public authorizedSigner;

    uint256 public constant FREE_TICKET_COOLDOWN = 1 days;
    uint256 public constant RANKED_ENTRY_COST = 5 * 1e18; // 5 RUSH per ranked entry

    mapping(address => uint256) public lastFreeTicketDay;
    mapping(bytes32 => bool) public claimedRuns;
    mapping(address => uint256) public totalRankedRuns;

    event AuthorizedSignerSet(address indexed signer);
    event RankedRunStarted(address indexed player, bytes32 indexed runId, bool freeTicket);
    event RunRewardClaimed(address indexed player, bytes32 indexed runId, uint256 score, uint256 rewardAmount);

    error AlreadyStarted();
    error RunNotStarted();
    error WrongPlayer();
    error AlreadyClaimed();
    error InvalidSignature();
    error SignatureExpired();

    struct RunClaim {
        bytes32 runId;
        address player;
        uint256 score;
        uint256 rewardAmount;
        uint256 deadline;
    }

    bytes32 private constant RUN_CLAIM_TYPEHASH = keccak256(
        "RunClaim(bytes32 runId,address player,uint256 score,uint256 rewardAmount,uint256 deadline)"
    );

    bytes32 private immutable DOMAIN_SEPARATOR;
    mapping(bytes32 => address) public runPlayer;

    constructor(address _token, address _authorizedSigner) {
        token = GameToken(_token);
        authorizedSigner = _authorizedSigner;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Celo Rush RunRewards")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function setAuthorizedSigner(address signer) external {
        require(msg.sender == token.owner(), "not token owner");
        authorizedSigner = signer;
        emit AuthorizedSignerSet(signer);
    }

    function currentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function startRankedRun(bytes32 runId) external {
        if (runPlayer[runId] != address(0)) revert AlreadyStarted();
        uint256 day = currentDay();
        bool freeTicket = lastFreeTicketDay[msg.sender] < day;

        if (!freeTicket) {
            token.burnFrom(msg.sender, RANKED_ENTRY_COST);
        } else {
            lastFreeTicketDay[msg.sender] = day;
        }

        runPlayer[runId] = msg.sender;
        totalRankedRuns[msg.sender]++;
        emit RankedRunStarted(msg.sender, runId, freeTicket);
    }

    function claimRunReward(
        bytes32 runId,
        uint256 score,
        uint256 rewardAmount,
        uint256 deadline,
        bytes calldata signature
    ) external {
        address player = runPlayer[runId];
        if (player == address(0)) revert RunNotStarted();
        if (player != msg.sender) revert WrongPlayer();
        if (claimedRuns[runId]) revert AlreadyClaimed();
        if (block.timestamp > deadline) revert SignatureExpired();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        RUN_CLAIM_TYPEHASH,
                        runId,
                        msg.sender,
                        score,
                        rewardAmount,
                        deadline
                    )
                )
            )
        );

        address signer = digest.recover(signature);
        if (signer != authorizedSigner) revert InvalidSignature();

        claimedRuns[runId] = true;
        token.mint(msg.sender, rewardAmount);

        emit RunRewardClaimed(msg.sender, runId, score, rewardAmount);
    }

    function hasFreeTicket(address player) external view returns (bool) {
        return lastFreeTicketDay[player] < currentDay();
    }
}

// Minimal ECDSA library for signature recovery
library ECDSA {
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
