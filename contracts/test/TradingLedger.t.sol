// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TradingLedger.sol";

contract TradingLedgerTest is Test {
    TradingLedger ledger;
    address owner   = address(this);
    address agent   = address(0xBEEF);
    address stranger = address(0xDEAD);
    address wallet = address(0xCAFE);

    function setUp() public {
        ledger = new TradingLedger();
    }

    function test_ownerIsAuthorized() public {
        assertTrue(ledger.authorizedAgents(owner));
    }

    function test_recordTradeEventByOwner() public {
        uint256 id = ledger.recordTradeEvent(1, "open", "BTC/USD", "buy", 6800000000000, 1000000, 0, wallet);
        assertEq(id, 1);
        assertEq(ledger.eventCount(), 1);
    }

    function test_recordTradeEventByAgent() public {
        ledger.setAgent(agent, true);
        vm.prank(agent);
        uint256 id = ledger.recordTradeEvent(2, "close", "ETH/USD", "sell", 200000000000, 2000000, -10000000, wallet);
        assertEq(id, 1);
    }

    function test_revertUnauthorizedAgent() public {
        vm.prank(stranger);
        vm.expectRevert("TradingLedger: not authorized agent");
        ledger.recordTradeEvent(1, "open", "SOL/USD", "buy", 8100000000, 5000000, 0, wallet);
    }

    function test_totalPnlAccumulates() public {
        ledger.recordTradeEvent(1, "open", "BTC/USD", "buy",  6800000000000, 1000000, 0, wallet);
        ledger.recordTradeEvent(1, "close", "BTC/USD", "buy",  6900000000000, 1000000,  50000000, wallet);
        ledger.recordTradeEvent(2, "settle", "ETH/USD", "sell", 200000000000,  2000000, -20000000, wallet);
        assertEq(ledger.totalPnl(), 30000000);
    }

    function test_getTradeEvent() public {
        ledger.recordTradeEvent(3, "settle", "SOL/USD", "buy", 8100000000, 5000000, 1500000, wallet);
        TradingLedger.TradeEvent memory t = ledger.getTradeEvent(1);
        assertEq(t.localTradeId, 3);
        assertEq(t.phase,  "settle");
        assertEq(t.symbol, "SOL/USD");
        assertEq(t.side,   "buy");
        assertEq(t.pnl,    1500000);
        assertEq(t.wallet, wallet);
    }

    function test_getTradeEventsNewestFirst() public {
        ledger.recordTradeEvent(1, "open", "BTC/USD", "buy",  6800000000000, 1000000, 0, wallet);
        ledger.recordTradeEvent(1, "close", "BTC/USD", "buy", 6900000000000, 1000000, 10000000, wallet);
        TradingLedger.TradeEvent[] memory events = ledger.getTradeEvents(0, 10);
        assertEq(events.length, 2);
        assertEq(events[0].phase, "close");
        assertEq(events[1].phase, "open");
    }

    function test_revokeAgent() public {
        ledger.setAgent(agent, true);
        ledger.setAgent(agent, false);
        vm.prank(agent);
        vm.expectRevert("TradingLedger: not authorized agent");
        ledger.recordTradeEvent(1, "open", "BTC/USD", "buy", 1, 1, 0, wallet);
    }

    function test_transferOwnership() public {
        ledger.transferOwnership(agent);
        assertEq(ledger.owner(), agent);
    }

    function test_revertGetInvalidTradeEvent() public {
        vm.expectRevert("TradingLedger: event not found");
        ledger.getTradeEvent(99);
    }
}
