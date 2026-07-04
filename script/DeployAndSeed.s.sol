// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {GameToken} from "../src/contracts/GameToken.sol";
import {PlayerRegistry} from "../src/contracts/PlayerRegistry.sol";
import {CheckIn} from "../src/contracts/CheckIn.sol";
import {RunRewards} from "../src/contracts/RunRewards.sol";
import {ArcadeItems} from "../src/contracts/ArcadeItems.sol";
import {SeasonTrophy} from "../src/contracts/SeasonTrophy.sol";
import {SeasonManager} from "../src/contracts/SeasonManager.sol";

contract DeployAndSeed is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address signer = vm.envAddress("AUTHORIZED_SIGNER");
        string memory baseUri = vm.envOr("ARCADE_BASE_URI", string("https://api.celorush.xyz/metadata/{id}.json"));

        vm.startBroadcast(deployerKey);

        GameToken rush = new GameToken();
        PlayerRegistry registry = new PlayerRegistry();
        CheckIn checkIn = new CheckIn(address(rush));
        RunRewards rewards = new RunRewards(address(rush), signer);
        ArcadeItems items = new ArcadeItems(address(rush), baseUri);
        SeasonTrophy trophy = new SeasonTrophy();
        SeasonManager seasons = new SeasonManager(address(rush), address(items), address(trophy));

        rush.setMinter(address(checkIn), true);
        rush.setMinter(address(rewards), true);
        trophy.setMinter(address(seasons));

        // Badge IDs 1-8: non-transferable, no price, one per eligible wallet via voucher.
        for (uint256 i = 0; i < 8; i++) {
            items.createItem(0, 0, true, 0, 0);
        }

        // Cosmetic IDs 9-13: must match frontend SHOP_ITEMS and capsule backend list.
        items.createItem(50 ether, 0, false, 3, 0); // 9 Celo Green Runner
        items.createItem(35 ether, 0, false, 3, 0); // 10 MiniPay Jacket
        items.createItem(40 ether, 0, false, 3, 0); // 11 Gold Trail
        items.createItem(60 ether, 0, false, 3, 0); // 12 Rugproof Armor
        items.createItem(45 ether, 0, false, 3, 0); // 13 Stablecoin Magnet

        console.log("GameToken", address(rush));
        console.log("PlayerRegistry", address(registry));
        console.log("CheckIn", address(checkIn));
        console.log("RunRewards", address(rewards));
        console.log("ArcadeItems", address(items));
        console.log("SeasonTrophy", address(trophy));
        console.log("SeasonManager", address(seasons));

        vm.stopBroadcast();
    }
}
