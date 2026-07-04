// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {GameToken} from "../src/contracts/GameToken.sol";
import {PlayerRegistry} from "../src/contracts/PlayerRegistry.sol";
import {CheckIn} from "../src/contracts/CheckIn.sol";
import {RunRewards} from "../src/contracts/RunRewards.sol";

contract CoreContractsTest is Test {
    GameToken internal token;
    PlayerRegistry internal registry;
    CheckIn internal checkIn;
    RunRewards internal rewards;

    address internal signer;
    uint256 internal signerPk;
    address internal player = makeAddr("player");

    function setUp() public {
        vm.warp(2 days);
        signerPk = 0xA11CE;
        signer = vm.addr(signerPk);

        token = new GameToken();
        registry = new PlayerRegistry();
        checkIn = new CheckIn(address(token));
        rewards = new RunRewards(address(token), signer);

        token.setMinter(address(checkIn), true);
        token.setMinter(address(rewards), true);
    }

    function test_RegisterPlayer() public {
        vm.prank(player);
        registry.register();
        assertTrue(registry.isRegistered(player));
    }

    function test_CheckInMintsRushOncePerDay() public {
        vm.prank(player);
        checkIn.checkIn();
        assertEq(token.balanceOf(player), 10 ether);

        vm.prank(player);
        vm.expectRevert(CheckIn.AlreadyCheckedIn.selector);
        checkIn.checkIn();
    }

    function test_RankedRunFreeTicketAndClaim() public {
        bytes32 runId = keccak256("run-1");

        vm.prank(player);
        rewards.startRankedRun(runId);
        assertEq(rewards.runPlayer(runId), player);

        uint256 rewardAmount = 3 ether;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _runClaimDigest(runId, player, 1000, rewardAmount, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(player);
        rewards.claimRunReward(runId, 1000, rewardAmount, deadline, sig);
        assertEq(token.balanceOf(player), rewardAmount);
    }

    function test_RankedClaimRejectsWrongPlayer() public {
        bytes32 runId = keccak256("run-2");
        address attacker = makeAddr("attacker");

        vm.prank(player);
        rewards.startRankedRun(runId);

        vm.prank(attacker);
        vm.expectRevert(RunRewards.WrongPlayer.selector);
        rewards.claimRunReward(runId, 1000, 1 ether, block.timestamp + 1 hours, "");
    }

    function _runClaimDigest(
        bytes32 runId,
        address player_,
        uint256 score,
        uint256 rewardAmount,
        uint256 deadline
    ) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Celo Rush RunRewards")),
                keccak256(bytes("1")),
                block.chainid,
                address(rewards)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("RunClaim(bytes32 runId,address player,uint256 score,uint256 rewardAmount,uint256 deadline)"),
                runId,
                player_,
                score,
                rewardAmount,
                deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }
}
