// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ReputationRegistry {
    struct Reputation {
        uint256 score;
        uint256 tradeCount;
    }

    mapping(uint256 => Reputation) private reputations;
    mapping(bytes32 => bool) public seenTradeHashes;

    event OutcomeRecorded(uint256 indexed agentId, int256 pnlBps, bytes32 indexed tradeHash, uint256 score, uint256 tradeCount);

    function recordOutcome(uint256 agentId, int256 pnlBps, bytes32 tradeHash) external {
        require(agentId != 0, "invalid agent");
        require(!seenTradeHashes[tradeHash], "duplicate trade");

        seenTradeHashes[tradeHash] = true;

        Reputation storage rep = reputations[agentId];
        rep.tradeCount += 1;

        if (pnlBps > 0) {
            rep.score += uint256(pnlBps);
        } else {
            uint256 loss = uint256(-pnlBps);
            rep.score = loss >= rep.score ? 0 : rep.score - loss;
        }

        emit OutcomeRecorded(agentId, pnlBps, tradeHash, rep.score, rep.tradeCount);
    }

    function getReputation(uint256 agentId) external view returns (uint256 score, uint256 tradeCount) {
        Reputation storage rep = reputations[agentId];
        return (rep.score, rep.tradeCount);
    }
}
