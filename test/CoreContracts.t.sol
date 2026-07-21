// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {GameToken} from "../src/contracts/GameToken.sol";
import {PlayerRegistry} from "../src/contracts/PlayerRegistry.sol";
import {CheckIn} from "../src/contracts/CheckIn.sol";
import {RunRewards} from "../src/contracts/RunRewards.sol";
import {WeeklyRewardsEscrow} from "../src/contracts/WeeklyRewardsEscrow.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CoreContractsTest is Test {
    GameToken internal token;
    PlayerRegistry internal registry;
    CheckIn internal checkIn;
    RunRewards internal rewards;
    WeeklyRewardsEscrow internal weeklyRewards;
    MockCUSD internal cUSD;

    address internal signer;
    uint256 internal signerPk;
    address internal player = makeAddr("player");

    function setUp() public {
        vm.warp(8 days);
        signerPk = 0xA11CE;
        signer = vm.addr(signerPk);

        token = new GameToken();
        registry = new PlayerRegistry();
        checkIn = new CheckIn(address(token));
        rewards = new RunRewards(address(token), signer);
        cUSD = new MockCUSD();
        weeklyRewards = new WeeklyRewardsEscrow(address(cUSD), signer);

        token.setMinter(address(checkIn), true);
        token.setMinter(address(rewards), true);
    }

    function test_WeeklyRewardRequestApprovalAndWithdrawal() public {
        uint256 week = weeklyRewards.currentWeek() - 1;
        uint256 amount = 25e6;
        cUSD.mint(address(this), amount);
        cUSD.approve(address(weeklyRewards), amount);
        weeklyRewards.fund(amount);

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _weeklyRequestDigest(player, week, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        vm.prank(player);
        weeklyRewards.requestReward(week, deadline, abi.encodePacked(r, s, v));
        weeklyRewards.approveReward(week, player, amount);

        vm.prank(player);
        weeklyRewards.withdrawReward(week);
        assertEq(cUSD.balanceOf(player), amount);
        (, bool withdrawn, ) = weeklyRewards.rewards(week, player);
        assertTrue(withdrawn);
    }

    function test_WeeklyWithdrawalRevertsWhenEscrowWasDrained() public {
        uint256 week = weeklyRewards.currentWeek() - 1;
        cUSD.mint(address(this), 10e6);
        cUSD.approve(address(weeklyRewards), 10e6);
        weeklyRewards.fund(10e6);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _weeklyRequestDigest(player, week, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        vm.prank(player);
        weeklyRewards.requestReward(week, deadline, abi.encodePacked(r, s, v));
        weeklyRewards.approveReward(week, player, 10e6);
        weeklyRewards.drain(address(this), 10e6);

        vm.prank(player);
        vm.expectRevert(WeeklyRewardsEscrow.InsufficientEscrowBalance.selector);
        weeklyRewards.withdrawReward(week);
    }

    function test_RewardCannotBeApprovedOrWithdrawnBeforeRequest() public {
        uint256 week = weeklyRewards.currentWeek() - 1;
        vm.expectRevert(WeeklyRewardsEscrow.NotRequested.selector);
        weeklyRewards.approveReward(week, player, 1e6);

        vm.prank(player);
        vm.expectRevert(WeeklyRewardsEscrow.NotRequested.selector);
        weeklyRewards.withdrawReward(week);
    }

    function test_NonOwnerCannotFundApproveOrDrain() public {
        uint256 week = weeklyRewards.currentWeek() - 1;
        vm.startPrank(player);
        vm.expectRevert();
        weeklyRewards.fund(1e6);
        vm.expectRevert();
        weeklyRewards.approveReward(week, player, 1e6);
        vm.expectRevert();
        weeklyRewards.drain(player, 1e6);
        vm.stopPrank();
    }

    function test_RequesterCanWithdrawOnlyOnce() public {
        uint256 week = weeklyRewards.currentWeek() - 1;
        uint256 amount = 1e6;
        cUSD.mint(address(this), amount);
        cUSD.approve(address(weeklyRewards), amount);
        weeklyRewards.fund(amount);

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _weeklyRequestDigest(player, week, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        vm.prank(player);
        weeklyRewards.requestReward(week, deadline, abi.encodePacked(r, s, v));
        weeklyRewards.approveReward(week, player, amount);

        vm.prank(player);
        weeklyRewards.withdrawReward(week);
        vm.prank(player);
        vm.expectRevert(WeeklyRewardsEscrow.AlreadyWithdrawn.selector);
        weeklyRewards.withdrawReward(week);
    }

    function test_HistoricalWinnerCanRequestAndWrongWalletCannotWithdraw() public {
        uint256 week = 0;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _weeklyRequestDigest(player, week, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        vm.prank(makeAddr("other"));
        vm.expectRevert(WeeklyRewardsEscrow.InvalidSignature.selector);
        weeklyRewards.requestReward(week, deadline, abi.encodePacked(r, s, v));
        vm.prank(player);
        weeklyRewards.requestReward(week, deadline, abi.encodePacked(r, s, v));
        vm.prank(makeAddr("other"));
        vm.expectRevert(WeeklyRewardsEscrow.NotRequested.selector);
        weeklyRewards.withdrawReward(week);
    }

    function test_CurrentWeekCannotBeRequested() public {
        uint256 week = weeklyRewards.currentWeek();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _weeklyRequestDigest(player, week, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);

        vm.prank(player);
        vm.expectRevert(WeeklyRewardsEscrow.CurrentWeekNotRequestable.selector);
        weeklyRewards.requestReward(week, deadline, abi.encodePacked(r, s, v));
    }

    function test_ExpiredWeeklyRequestRejected() public {
        uint256 week = weeklyRewards.currentWeek() - 1;
        uint256 deadline = block.timestamp - 1;
        bytes32 digest = _weeklyRequestDigest(player, week, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);

        vm.prank(player);
        vm.expectRevert(WeeklyRewardsEscrow.SignatureExpired.selector);
        weeklyRewards.requestReward(week, deadline, abi.encodePacked(r, s, v));
    }

    function test_OwnerCanDrainAnyBalance() public {
        cUSD.mint(address(this), 50e6);
        cUSD.approve(address(weeklyRewards), 50e6);
        weeklyRewards.fund(50e6);
        weeklyRewards.drain(address(this), 50e6);
        assertEq(cUSD.balanceOf(address(weeklyRewards)), 0);
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

    function _weeklyRequestDigest(address player_, uint256 week, uint256 deadline) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Celo Rush Weekly Rewards")),
                keccak256(bytes("1")),
                block.chainid,
                address(weeklyRewards)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("RewardRequest(address player,uint256 week,uint256 deadline)"),
                player_,
                week,
                deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }
}

contract MockCUSD is IERC20 {
    string public constant name = "Mock cUSD";
    string public constant symbol = "mcUSD";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
