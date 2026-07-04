// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./GameToken.sol";

contract SeasonManager is Ownable {
    using ECDSA_SM for bytes32;

    GameToken public rushToken;
    ERC1155 public arcadeItems;
    IERC721Mintable public trophies;

    uint256 public constant SEASON_ENTRY_COST = 10 * 1e18;
    uint256 public constant VOTE_COST = 1 * 1e18;

    struct Season {
        uint256 id;
        uint256 startTime;
        uint256 endTime;
        bool finalized;
        mapping(address => bool) entered;
        uint256 entrantCount;
    }

    struct Proposal {
        uint256 id;
        uint256 seasonId;
        string description;
        string[] options;
        uint256 endTime;
        mapping(uint256 => uint256) votes; // optionId -> count
        mapping(address => uint256) voterChoice;
        mapping(address => bool) hasVoted;
        uint256 totalVotes;
    }

    uint256 private _nextSeasonId = 1;
    uint256 private _nextProposalId = 1;

    mapping(uint256 => Season) public seasons;
    mapping(uint256 => Proposal) public proposals;

    bytes32 private constant SEASON_BADGE_TYPEHASH = keccak256(
        "SeasonBadge(address player,uint256 seasonId,uint256 badgeId,uint256 rank,uint256 deadline)"
    );
    bytes32 private constant TROPHY_TYPEHASH = keccak256(
        "SeasonTrophy(address player,uint256 seasonId,uint256 deadline)"
    );

    bytes32 private immutable DOMAIN_SEPARATOR;

    mapping(bytes32 => bool) public usedBadgeClaims;
    mapping(bytes32 => bool) public usedTrophyClaims;

    event SeasonCreated(uint256 indexed id, uint256 startTime, uint256 endTime);
    event SeasonEntered(uint256 indexed seasonId, address indexed player);
    event ProposalCreated(uint256 indexed id, uint256 seasonId, string description);
    event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 optionId);
    event SeasonBadgeClaimed(uint256 indexed seasonId, address indexed player, uint256 rank);
    event TrophyClaimed(uint256 indexed seasonId, address indexed player);

    error SeasonNotFound();
    error SeasonNotActive();
    error AlreadyEntered();
    error InsufficientRUSHEntry();
    error NoSeasonPass();
    error AlreadyVoted();
    error ProposalEnded();

    constructor(
        address _rush,
        address _arcadeItems,
        address _trophies
    ) Ownable(msg.sender) {
        rushToken = GameToken(_rush);
        arcadeItems = ERC1155(_arcadeItems);
        trophies = IERC721Mintable(_trophies);
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Celo Rush SeasonManager")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function createSeason(uint256 startTime, uint256 endTime) external onlyOwner returns (uint256 id) {
        id = _nextSeasonId++;
        Season storage s = seasons[id];
        s.id = id;
        s.startTime = startTime;
        s.endTime = endTime;
        emit SeasonCreated(id, startTime, endTime);
    }

    function enterSeason(uint256 seasonId) external {
        Season storage s = seasons[seasonId];
        if (s.id == 0) revert SeasonNotFound();
        if (block.timestamp < s.startTime || block.timestamp > s.endTime) revert SeasonNotActive();
        if (s.entered[msg.sender]) revert AlreadyEntered();

        rushToken.burnFrom(msg.sender, SEASON_ENTRY_COST);

        s.entered[msg.sender] = true;
        s.entrantCount++;
        emit SeasonEntered(seasonId, msg.sender);
    }

    function hasEntered(uint256 seasonId, address player) external view returns (bool) {
        return seasons[seasonId].entered[player];
    }

    function hasVoted(uint256 proposalId, address voter) external view returns (bool) {
        return proposals[proposalId].hasVoted[voter];
    }

    function claimSeasonBadge(
        uint256 seasonId,
        uint256 badgeId,
        uint256 rank,
        uint256 deadline,
        bytes calldata signature
    ) external {
        Season storage s = seasons[seasonId];
        if (s.id == 0) revert SeasonNotFound();
        if (!s.finalized) revert SeasonNotActive();

        bytes32 claimId = keccak256(abi.encodePacked(msg.sender, seasonId, badgeId));
        if (usedBadgeClaims[claimId]) revert AlreadyEntered();
        if (block.timestamp > deadline) revert();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(SEASON_BADGE_TYPEHASH, msg.sender, seasonId, badgeId, rank, deadline))
            )
        );
        if (digest.recover(signature) != owner()) revert();

        usedBadgeClaims[claimId] = true;
        arcadeItems.safeTransferFrom(address(this), msg.sender, badgeId, 1, "");
        emit SeasonBadgeClaimed(seasonId, msg.sender, rank);
    }

    function claimTrophy(uint256 seasonId, uint256 deadline, bytes calldata signature) external {
        Season storage s = seasons[seasonId];
        if (s.id == 0) revert SeasonNotFound();
        if (!s.finalized) revert SeasonNotActive();

        bytes32 claimId = keccak256(abi.encodePacked(msg.sender, seasonId));
        if (usedTrophyClaims[claimId]) revert AlreadyEntered();
        if (block.timestamp > deadline) revert();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(TROPHY_TYPEHASH, msg.sender, seasonId, deadline))
            )
        );
        if (digest.recover(signature) != owner()) revert();

        usedTrophyClaims[claimId] = true;
        // mint unique ERC-721 trophy
        uint256 tokenId = seasonId;
        trophies.safeMint(msg.sender, tokenId);
        emit TrophyClaimed(seasonId, msg.sender);
    }

    function finalizeSeason(uint256 seasonId) external onlyOwner {
        Season storage s = seasons[seasonId];
        if (s.id == 0) revert SeasonNotFound();
        s.finalized = true;
    }

    function createProposal(
        uint256 seasonId,
        string calldata description,
        string[] calldata options,
        uint256 endTime
    ) external onlyOwner returns (uint256 id) {
        id = _nextProposalId++;
        Proposal storage p = proposals[id];
        p.id = id;
        p.seasonId = seasonId;
        p.description = description;
        p.endTime = endTime;
        for (uint256 i = 0; i < options.length; i++) {
            p.options.push(options[i]);
        }
        emit ProposalCreated(id, seasonId, description);
    }

    function vote(uint256 proposalId, uint256 optionId) external {
        Proposal storage p = proposals[proposalId];
        if (p.id == 0) revert();
        if (block.timestamp > p.endTime) revert ProposalEnded();
        if (optionId >= p.options.length) revert();
        if (p.hasVoted[msg.sender]) revert AlreadyVoted();

        rushToken.burnFrom(msg.sender, VOTE_COST);

        p.votes[optionId]++;
        p.voterChoice[msg.sender] = optionId;
        p.hasVoted[msg.sender] = true;
        p.totalVotes++;
        emit VoteCast(proposalId, msg.sender, optionId);
    }

    function getProposal(uint256 id) external view returns (
        uint256 seasonId,
        string memory description,
        string[] memory options,
        uint256[] memory voteCounts,
        uint256 totalVotes,
        uint256 endTime
    ) {
        Proposal storage p = proposals[id];
        voteCounts = new uint256[](p.options.length);
        for (uint256 i = 0; i < p.options.length; i++) {
            voteCounts[i] = p.votes[i];
        }
        return (p.seasonId, p.description, p.options, voteCounts, p.totalVotes, p.endTime);
    }
}

library ECDSA_SM {
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
        require(v == 27 || v == 28, "ECDSA: invalid v");
        return ecrecover(hash, v, r, s);
    }
}

interface IERC721Mintable {
    function safeMint(address to, uint256 tokenId) external;
}
