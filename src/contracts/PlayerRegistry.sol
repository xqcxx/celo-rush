// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PlayerRegistry {
    struct Player {
        address wallet;
        uint256 registeredAt;
    }

    mapping(address => Player) public players;
    mapping(address => bool) public isPlayer;

    event PlayerRegistered(address indexed wallet, uint256 timestamp);

    error AlreadyRegistered();
    error NotRegistered();

    function register() external {
        if (isPlayer[msg.sender]) revert AlreadyRegistered();

        isPlayer[msg.sender] = true;
        players[msg.sender] = Player({
            wallet: msg.sender,
            registeredAt: block.timestamp
        });

        emit PlayerRegistered(msg.sender, block.timestamp);
    }

    function isRegistered(address wallet) external view returns (bool) {
        return isPlayer[wallet];
    }

    function getPlayerCount() external view returns (uint256) {
        uint256 count;
        // iterate through players mapping to count
        // for gas efficiency on-chain, maintain a counter or use events
        return count; // placeholder; use events off-chain for accurate count
    }
}
