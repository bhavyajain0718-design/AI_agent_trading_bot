// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TradingLedger.sol";

/**
 * @title Deploy
 * @notice Foundry deployment script for TradingLedger.
 *
 * Usage (local Anvil):
 *   anvil &
 *   forge script contracts/script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
 *         --broadcast --private-key <ANVIL_PRIVATE_KEY>
 *
 * Usage (Sepolia testnet):
 *   forge script contracts/script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL \
 *         --broadcast --verify --private-key $DEPLOYER_PRIVATE_KEY
 */
contract Deploy is Script {
    function run() external returns (TradingLedger ledger) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console2.log("Deploying TradingLedger...");
        console2.log("  Deployer:", deployer);

        vm.startBroadcast(deployerKey);
        ledger = new TradingLedger();
        vm.stopBroadcast();

        console2.log("TradingLedger deployed at:", address(ledger));
    }
}
