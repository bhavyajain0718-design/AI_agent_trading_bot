// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TradingLedger.sol";

contract TradingLedgerTest is Test {
    TradingLedger ledger;
    address owner   = address(this);
    address agent   = address(0xBEEF);
    address stranger = address(0xDEAD);

    function setUp() public {
        ledger = new TradingLedger();
    }

    function test_ownerIsAuthorized() public {
        assertTrue(ledger.authorizedAgents(owner));
    }

    function test_recordTradeByOwner() public {
        uint256 id = ledger.recordTrade("BTC/USD", "buy", 6800000000000, 1000000, 50000000);
        assertEq(id, 1);
        assertEq(ledger.tradeCount(), 1);
    }

    function test_recordTradeByAgent() public {
        ledger.setAgent(agent, true);
        vm.prank(agent);
        uint256 id = ledger.recordTrade("ETH/USD", "sell", 200000000000, 2000000, -10000000);
        assertEq(id, 1);
    }

    function test_revertUnauthorizedAgent() public {
        vm.prank(stranger);
        vm.expectRevert("TradingLedger: not authorized agent");
        ledger.recordTrade("SOL/USD", "buy", 8100000000, 5000000, 0);
    }

    function test_totalPnlAccumulates() public {
        ledger.recordTrade("BTC/USD", "buy",  6800000000000, 1000000,  50000000);
        ledger.recordTrade("ETH/USD", "sell", 200000000000,  2000000, -20000000);
        assertEq(ledger.totalPnl(), 30000000);
    }

    function test_getTrade() public {
        ledger.recordTrade("SOL/USD", "buy", 8100000000, 5000000, 1500000);
        TradingLedger.Trade memory t = ledger.getTrade(1);
        assertEq(t.symbol, "SOL/USD");
        assertEq(t.side,   "buy");
        assertEq(t.pnl,    1500000);
    }

    function test_getTradesNewestFirst() public {
        ledger.recordTrade("BTC/USD", "buy",  6800000000000, 1000000, 10000000);
        ledger.recordTrade("ETH/USD", "sell", 200000000000,  2000000, 20000000);
        TradingLedger.Trade[] memory trades = ledger.getTrades(0, 10);
        assertEq(trades.length, 2);
        assertEq(trades[0].symbol, "ETH/USD"); // newest first
        assertEq(trades[1].symbol, "BTC/USD");
    }

    function test_revokeAgent() public {
        ledger.setAgent(agent, true);
        ledger.setAgent(agent, false);
        vm.prank(agent);
        vm.expectRevert("TradingLedger: not authorized agent");
        ledger.recordTrade("BTC/USD", "buy", 1, 1, 0);
    }

    function test_transferOwnership() public {
        ledger.transferOwnership(agent);
        assertEq(ledger.owner(), agent);
    }

    function test_revertGetInvalidTrade() public {
        vm.expectRevert("TradingLedger: trade not found");
        ledger.getTrade(99);
    }
}
