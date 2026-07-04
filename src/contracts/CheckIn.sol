// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GameToken.sol";

contract CheckIn {
    GameToken public token;

    uint256 public constant CHECK_IN_REWARD = 10 * 1e18; // 10 RUSH per check-in
    uint256 public constant SECONDS_PER_DAY = 86400;

    struct Player {
        uint256 lastCheckInDay;
        uint256 streak;
    }

    mapping(address => Player) public players;
    mapping(address => mapping(uint256 => bool)) public badgeClaimed;

    // Streak milestone badge IDs
    uint256 public constant BRONZE_BADGE = 1; // 3 days
    uint256 public constant MINIPAY_BADGE = 2; // 7 days
    uint256 public constant DIAMOND_BADGE = 3; // 30 days

    event CheckedIn(address indexed player, uint256 streak, uint256 day);

    error AlreadyCheckedIn();

    constructor(address _token) {
        token = GameToken(_token);
    }

    function currentDay() public view returns (uint256) {
        return block.timestamp / SECONDS_PER_DAY;
    }

    function checkIn() external {
        uint256 day = currentDay();
        Player storage p = players[msg.sender];

        if (p.lastCheckInDay >= day) revert AlreadyCheckedIn();

        if (p.lastCheckInDay == 0 || day - p.lastCheckInDay > 1) {
            p.streak = 1;
        } else {
            p.streak += 1;
        }
        p.lastCheckInDay = day;

        token.mint(msg.sender, CHECK_IN_REWARD);
        emit CheckedIn(msg.sender, p.streak, day);
    }

    function hasCheckedInToday(address player) external view returns (bool) {
        return players[player].lastCheckInDay >= currentDay();
    }

    function getStreak(address player) external view returns (uint256) {
        Player memory p = players[player];
        uint256 day = currentDay();
        if (p.lastCheckInDay == 0 || day - p.lastCheckInDay > 1) {
            return 0;
        }
        return p.streak;
    }

    function isBadgeEligible() public view returns (
        bool bronze,
        bool miniPay,
        bool diamond
    ) {
        uint256 s = players[msg.sender].streak;
        bronze = s >= 3 && !badgeClaimed[msg.sender][BRONZE_BADGE];
        miniPay = s >= 7 && !badgeClaimed[msg.sender][MINIPAY_BADGE];
        diamond = s >= 30 && !badgeClaimed[msg.sender][DIAMOND_BADGE];
    }
}
