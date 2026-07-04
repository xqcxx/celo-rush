// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./GameToken.sol";

contract ArcadeItems is ERC1155, Ownable {
    using ECDSA15 for bytes32;

    GameToken public rushToken;

    struct ItemDef {
        uint256 id;
        uint256 price;      // in RUSH (18 decimals)
        uint256 maxSupply;
        uint256 minted;
        bool isNonTransferable; // soulbound badges
        uint8 maxLevel;     // 0 = non-upgradable
    }

    uint256 private _nextItemId = 1;

    mapping(uint256 => ItemDef) public items;
    mapping(bytes32 => bool) public usedBadgeVouchers;
    mapping(address => mapping(uint256 => uint8)) public itemLevel;

    bytes32 private constant BADGE_CLAIM_TYPEHASH = keccak256(
        "BadgeClaim(address player,uint256 badgeId,uint256 deadline)"
    );
    bytes32 private immutable DOMAIN_SEPARATOR;

    event ItemCreated(uint256 indexed id, uint256 price, uint256 maxSupply, bool nonTransferable, uint8 maxLevel);
    event ItemBought(address indexed player, uint256 indexed id);
    event ItemUpgraded(address indexed player, uint256 indexed id, uint8 level);
    event AchievementMinted(address indexed player, uint256 indexed badgeId);

    error SoldOut();
    error InsufficientRUSH();
    error InvalidBadgeVoucher();
    error AlreadyClaimedBadge();
    error MaxLevelReached();
    error NotUpgradable();

    constructor(address _token, string memory _baseUri) ERC1155(_baseUri) Ownable(msg.sender) {
        rushToken = GameToken(_token);
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Celo Rush ArcadeItems")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function createItem(
        uint256 price,
        uint256 maxSupply,
        bool isNonTransferable,
        uint8 maxLevel,
        uint256 initialAmount
    ) external onlyOwner returns (uint256 id) {
        id = _nextItemId++;
        items[id] = ItemDef({
            id: id,
            price: price,
            maxSupply: maxSupply,
            minted: initialAmount,
            isNonTransferable: isNonTransferable,
            maxLevel: maxLevel
        });
        if (initialAmount > 0) {
            _mint(msg.sender, id, initialAmount, "");
        }
        emit ItemCreated(id, price, maxSupply, isNonTransferable, maxLevel);
    }

    function buyItem(uint256 itemId) external {
        ItemDef storage item = items[itemId];
        require(item.price > 0, "item does not exist");

        if (item.maxSupply > 0) {
            if (item.minted >= item.maxSupply) revert SoldOut();
        }

        rushToken.burnFrom(msg.sender, item.price);

        item.minted++;
        _mint(msg.sender, itemId, 1, "");
        emit ItemBought(msg.sender, itemId);
    }

    function upgradeItem(uint256 itemId) external {
        ItemDef storage item = items[itemId];
        require(item.price > 0, "item does not exist");
        if (item.maxLevel == 0) revert NotUpgradable();

        uint8 currentLevel = itemLevel[msg.sender][itemId];
        if (currentLevel >= item.maxLevel) revert MaxLevelReached();

        uint256 upgradeCost = item.price * (currentLevel + 1);
        rushToken.burnFrom(msg.sender, upgradeCost);

        itemLevel[msg.sender][itemId] = currentLevel + 1;
        emit ItemUpgraded(msg.sender, itemId, currentLevel + 1);
    }

    function mintAchievementBadge(
        uint256 badgeId,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (badgeId == 0 || badgeId >= _nextItemId) revert();
        ItemDef storage badge = items[badgeId];
        if (!badge.isNonTransferable) revert InvalidBadgeVoucher();
        if (badge.maxSupply > 0 && badge.minted >= badge.maxSupply) revert SoldOut();

        bytes32 voucherId = keccak256(abi.encodePacked(msg.sender, badgeId));
        if (usedBadgeVouchers[voucherId]) revert AlreadyClaimedBadge();
        if (block.timestamp > deadline) revert InvalidBadgeVoucher();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(BADGE_CLAIM_TYPEHASH, msg.sender, badgeId, deadline))
            )
        );
        address signer = digest.recover(signature);
        if (signer != owner()) revert InvalidBadgeVoucher();

        usedBadgeVouchers[voucherId] = true;
        badge.minted++;
        _mint(msg.sender, badgeId, 1, "");
        emit AchievementMinted(msg.sender, badgeId);
    }

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal virtual override {
        for (uint256 i = 0; i < ids.length; i++) {
            if (from != address(0) && to != address(0)) {
                if (items[ids[i]].isNonTransferable) {
                    revert ERC1155InvalidReceiver(to);
                }
            }
        }
        super._update(from, to, ids, values);
    }

    function getItem(uint256 id) external view returns (ItemDef memory) {
        return items[id];
    }
}

library ECDSA15 {
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
