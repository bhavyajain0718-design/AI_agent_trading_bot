// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AgentIdentity.sol";
import "../src/ReputationRegistry.sol";
import "../src/ValidationRegistry.sol";

contract DeployScript is Script {
    function run() external {
        vm.startBroadcast();

        AgentIdentity identity = new AgentIdentity();
        ReputationRegistry reputation = new ReputationRegistry();
        ValidationRegistry validation = new ValidationRegistry();

        vm.stopBroadcast();

        console2.log("AgentIdentity:", address(identity));
        console2.log("ReputationRegistry:", address(reputation));
        console2.log("ValidationRegistry:", address(validation));
    }
}
