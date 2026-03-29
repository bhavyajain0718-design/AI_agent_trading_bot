// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ValidationRegistry {
    struct ValidationRecord {
        uint256 agentId;
        string checkType;
        bool passed;
        uint256 timestamp;
    }

    mapping(bytes32 => ValidationRecord) public validations;

    event ValidationRecorded(uint256 indexed agentId, bytes32 indexed intentHash, string checkType, bool passed);

    function recordValidation(uint256 agentId, bytes32 intentHash, string calldata checkType, bool passed) external {
        require(agentId != 0, "invalid agent");
        validations[intentHash] = ValidationRecord({
            agentId: agentId,
            checkType: checkType,
            passed: passed,
            timestamp: block.timestamp
        });

        emit ValidationRecorded(agentId, intentHash, checkType, passed);
    }
}
