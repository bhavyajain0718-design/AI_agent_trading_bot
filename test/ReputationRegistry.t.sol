// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ReputationRegistry.sol";

contract ReputationRegistryTest is Test {
    ReputationRegistry internal reputation;

    function setUp() public {
        reputation = new ReputationRegistry();
    }

    function testRecordPositiveOutcome() public {
        reputation.recordOutcome(1, 250, keccak256("trade-1"));
        (uint256 score, uint256 tradeCount) = reputation.getReputation(1);
        assertEq(score, 250);
        assertEq(tradeCount, 1);
    }
}
