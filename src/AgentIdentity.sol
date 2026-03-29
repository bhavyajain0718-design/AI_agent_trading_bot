// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentIdentity {
    uint256 public nextAgentId = 1;

    mapping(address => uint256) public agentIds;
    mapping(uint256 => string) public metadataURIs;

    event AgentRegistered(uint256 indexed agentId, address indexed agentWallet, string metadataURI);

    function registerAgent(address agentWallet, string calldata metadataURI) external returns (uint256 tokenId) {
        require(agentWallet != address(0), "invalid wallet");
        require(agentIds[agentWallet] == 0, "already registered");

        tokenId = nextAgentId++;
        agentIds[agentWallet] = tokenId;
        metadataURIs[tokenId] = metadataURI;

        emit AgentRegistered(tokenId, agentWallet, metadataURI);
    }

    function isRegistered(address agentWallet) external view returns (bool) {
        return agentIds[agentWallet] != 0;
    }
}
