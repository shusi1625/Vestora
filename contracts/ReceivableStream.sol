// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract ReceivableStream is ERC721 {
    uint256 private _nextStreamId = 1;

    event StreamCreated(uint256 indexed streamId, address indexed recipient);

    constructor() ERC721("Vestora Receivable", "vRCV") {}

    function createStream(address recipient) external returns (uint256 streamId) {
        require(recipient != address(0), "invalid recipient");

        streamId = _nextStreamId;
        _nextStreamId += 1;

        _safeMint(recipient, streamId);

        emit StreamCreated(streamId, recipient);
    }

    function nextStreamId() external view returns (uint256) {
        return _nextStreamId;
    }
}