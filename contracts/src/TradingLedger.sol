// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TradingLedger
 * @notice On-chain settlement and P&L recording for the AI Trading Bot.
 *         Trades are recorded by the authorized agent wallet. Anyone can
 *         read the ledger.
 *
 * @dev Deployed with Foundry. Owner = deployer.
 *      Agent address must be authorized by owner before calling recordTrade.
 */
contract TradingLedger {
    // ─────────────────────────────────────────────────────────
    // Structs
    // ─────────────────────────────────────────────────────────

    struct Trade {
        uint256 id;
        string  symbol;      // e.g. "BTC/USD"
        string  side;        // "buy" | "sell"
        int256  price;       // price × 1e8  (to avoid floats)
        int256  quantity;    // qty  × 1e8
        int256  pnl;         // P&L  × 1e8 (signed, can be negative)
        uint256 timestamp;
        address agent;
    }

    // ─────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────

    address public owner;
    mapping(address => bool) public authorizedAgents;

    Trade[] private _trades;
    int256  public totalPnl;   // sum of all trade P&L × 1e8

    // ─────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────

    event TradeRecorded(
        uint256 indexed id,
        string  symbol,
        string  side,
        int256  price,
        int256  quantity,
        int256  pnl,
        address indexed agent
    );

    event AgentAuthorized(address indexed agent, bool authorized);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "TradingLedger: not owner");
        _;
    }

    modifier onlyAuthorizedAgent() {
        require(authorizedAgents[msg.sender], "TradingLedger: not authorized agent");
        _;
    }

    // ─────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        authorizedAgents[msg.sender] = true;
        emit AgentAuthorized(msg.sender, true);
    }

    // ─────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────

    /**
     * @notice Grant or revoke agent authorization
     */
    function setAgent(address agent, bool authorized) external onlyOwner {
        authorizedAgents[agent] = authorized;
        emit AgentAuthorized(agent, authorized);
    }

    /**
     * @notice Transfer contract ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "TradingLedger: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ─────────────────────────────────────────────────────────
    // Write
    // ─────────────────────────────────────────────────────────

    /**
     * @notice Record a settled trade on-chain.
     * @param symbol   Trading pair, e.g. "BTC/USD"
     * @param side     "buy" or "sell"
     * @param price    Price multiplied by 1e8 (e.g. $68,000 = 6800000000000)
     * @param quantity Quantity multiplied by 1e8
     * @param pnl      Profit/loss multiplied by 1e8 (negative = loss)
     * @return id      The sequential trade ID (1-indexed)
     */
    function recordTrade(
        string calldata symbol,
        string calldata side,
        int256 price,
        int256 quantity,
        int256 pnl
    ) external onlyAuthorizedAgent returns (uint256 id) {
        id = _trades.length + 1;

        _trades.push(Trade({
            id:        id,
            symbol:    symbol,
            side:      side,
            price:     price,
            quantity:  quantity,
            pnl:       pnl,
            timestamp: block.timestamp,
            agent:     msg.sender
        }));

        totalPnl += pnl;

        emit TradeRecorded(id, symbol, side, price, quantity, pnl, msg.sender);
    }

    // ─────────────────────────────────────────────────────────
    // Read
    // ─────────────────────────────────────────────────────────

    /**
     * @notice Total number of settled trades
     */
    function tradeCount() external view returns (uint256) {
        return _trades.length;
    }

    /**
     * @notice Get a single trade by its sequential ID (1-indexed)
     */
    function getTrade(uint256 id) external view returns (Trade memory) {
        require(id > 0 && id <= _trades.length, "TradingLedger: trade not found");
        return _trades[id - 1];
    }

    /**
     * @notice Get a paginated slice of trades (newest first)
     * @param offset  0-indexed starting offset (from newest)
     * @param limit   Max number of trades to return
     */
    function getTrades(uint256 offset, uint256 limit)
        external
        view
        returns (Trade[] memory result)
    {
        uint256 total = _trades.length;
        if (offset >= total || limit == 0) return new Trade[](0);

        uint256 count = limit;
        if (offset + count > total) count = total - offset;

        result = new Trade[](count);
        for (uint256 i = 0; i < count; i++) {
            // Return in reverse (newest first)
            result[i] = _trades[total - 1 - offset - i];
        }
    }

    /**
     * @notice Returns cumulative P&L (× 1e8) — convenience getter
     */
    function getCumulativePnl() external view returns (int256) {
        return totalPnl;
    }
}
