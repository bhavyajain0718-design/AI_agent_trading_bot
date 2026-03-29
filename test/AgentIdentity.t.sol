// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentIdentity.sol";

contract AgentIdentityTest is Test {
    AgentIdentity internal identity;

    function setUp() public {
        identity = new AgentIdentity();
    }

    function testRegisterAgent() public {
        uint256 agentId = identity.registerAgent(address(this), "ipfs://metadata");
        assertEq(agentId, 1);
        assertTrue(identity.isRegistered(address(this)));
    }
}
