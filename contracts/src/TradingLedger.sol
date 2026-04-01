// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TradingLedger
 * @notice On-chain execution ledger for the AI Trading Bot.
 *         The strategy still runs off-chain, but every execution lifecycle
 *         event can be appended on-chain by an authorized agent wallet.
 */
contract TradingLedger {
    struct TradeEvent {
        uint256 id;
        uint256 localTradeId;
        string phase;       // open | close | settle
        string symbol;
        string side;        // buy | sell
        int256 price;       // price x 1e8
        int256 quantity;    // qty x 1e8
        int256 pnl;         // pnl x 1e8
        address wallet;     // wallet session associated with the trade
        uint256 timestamp;
        address agent;      // authorized backend signer
    }

    address public owner;
    mapping(address => bool) public authorizedAgents;

    TradeEvent[] private _events;
    int256 public totalPnl;

    event TradeLifecycleRecorded(
        uint256 indexed id,
        uint256 indexed localTradeId,
        string phase,
        string symbol,
        string side,
        int256 price,
        int256 quantity,
        int256 pnl,
        address indexed wallet,
        address agent
    );

    event AgentAuthorized(address indexed agent, bool authorized);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "TradingLedger: not owner");
        _;
    }

    modifier onlyAuthorizedAgent() {
        require(authorizedAgents[msg.sender], "TradingLedger: not authorized agent");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedAgents[msg.sender] = true;
        emit AgentAuthorized(msg.sender, true);
    }

    function setAgent(address agent, bool authorized) external onlyOwner {
        authorizedAgents[agent] = authorized;
        emit AgentAuthorized(agent, authorized);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "TradingLedger: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function recordTradeEvent(
        uint256 localTradeId,
        string calldata phase,
        string calldata symbol,
        string calldata side,
        int256 price,
        int256 quantity,
        int256 pnl,
        address wallet
    ) external onlyAuthorizedAgent returns (uint256 id) {
        require(localTradeId > 0, "TradingLedger: local trade id required");
        require(bytes(symbol).length > 0, "TradingLedger: symbol required");
        require(bytes(side).length > 0, "TradingLedger: side required");
        require(bytes(phase).length > 0, "TradingLedger: phase required");

        id = _events.length + 1;

        _events.push(
            TradeEvent({
                id: id,
                localTradeId: localTradeId,
                phase: phase,
                symbol: symbol,
                side: side,
                price: price,
                quantity: quantity,
                pnl: pnl,
                wallet: wallet,
                timestamp: block.timestamp,
                agent: msg.sender
            })
        );

        totalPnl += pnl;

        emit TradeLifecycleRecorded(
            id,
            localTradeId,
            phase,
            symbol,
            side,
            price,
            quantity,
            pnl,
            wallet,
            msg.sender
        );
    }

    function eventCount() external view returns (uint256) {
        return _events.length;
    }

    function getTradeEvent(uint256 id) external view returns (TradeEvent memory) {
        require(id > 0 && id <= _events.length, "TradingLedger: event not found");
        return _events[id - 1];
    }

    function getTradeEvents(uint256 offset, uint256 limit)
        external
        view
        returns (TradeEvent[] memory result)
    {
        uint256 total = _events.length;
        if (offset >= total || limit == 0) return new TradeEvent[](0);

        uint256 count = limit;
        if (offset + count > total) count = total - offset;

        result = new TradeEvent[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = _events[total - 1 - offset - i];
        }
    }

    function getCumulativePnl() external view returns (int256) {
        return totalPnl;
    }
}
