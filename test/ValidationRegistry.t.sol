// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ValidationRegistry.sol";

contract ValidationRegistryTest is Test {
    ValidationRegistry internal validation;

    function setUp() public {
        validation = new ValidationRegistry();
    }

    function testRecordValidation() public {
        bytes32 intentHash = keccak256("intent-1");
        validation.recordValidation(1, intentHash, "TRADE_INTENT", true);
        (uint256 agentId, string memory checkType, bool passed, uint256 timestamp) = validation.validations(intentHash);
        assertEq(agentId, 1);
        assertEq(checkType, "TRADE_INTENT");
        assertTrue(passed);
        assertGt(timestamp, 0);
    }
}
