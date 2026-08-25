// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ReceivableStream is ERC721 {
    using SafeERC20 for IERC20;

    struct Stream {
        address sender;
        address token;
        uint256 depositedAmount;
        uint256 startTime;
        uint256 endTime;
        uint256 withdrawnAmount;
    }

    mapping(uint256 => Stream) private _streams;

    uint256 private _nextStreamId = 1;

    event StreamCreated(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 depositedAmount,
        uint256 startTime,
        uint256 endTime
    );

    constructor() ERC721("Vestora Receivable", "vRCV") {}

    function createStream(
        address recipient,
        address token,
        uint256 amount,
        uint256 startTime,
        uint256 endTime
    ) external returns (uint256 streamId) {
        require(recipient != address(0), "invalid recipient");
        require(token != address(0), "invalid token");
        require(amount > 0, "invalid amount");
        require(endTime > startTime, "invalid time range");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        streamId = _nextStreamId;
        _nextStreamId += 1;

        _streams[streamId] = Stream({
            sender: msg.sender,
            token: token,
            depositedAmount: amount,
            startTime: startTime,
            endTime: endTime,
            withdrawnAmount: 0
        });

        _safeMint(recipient, streamId);

        emit StreamCreated(
            streamId,
            msg.sender,
            recipient,
            token,
            amount,
            startTime,
            endTime
        );
    }

    function nextStreamId() external view returns (uint256) {
        return _nextStreamId;
    }

    function getStream(uint256 streamId) external view returns (Stream memory) {
        require(_ownerOf(streamId) != address(0), "stream not found");

        return _streams[streamId];
    }

    function vestedAmount(uint256 streamId) public view returns (uint256) {
        require(_ownerOf(streamId) != address(0), "stream not found");

        Stream memory stream = _streams[streamId];

        //시작 전
        if (block.timestamp <= stream.startTime) {
            return 0;
        }
        //종료 후
        if (block.timestamp >= stream.endTime) {
            return stream.depositedAmount;
        }
        //진행 중
        uint256 elapsed = block.timestamp - stream.startTime;
        uint256 duration = stream.endTime - stream.startTime;

        return (stream.depositedAmount * elapsed) / duration;
    }

    function claimableAmount(uint256 streamId) public view returns (uint256) {
        require(_ownerOf(streamId) != address(0), "stream not found");

        Stream memory stream = _streams[streamId];
        uint256 vested = vestedAmount(streamId);

        if (vested <= stream.withdrawnAmount) {
            return 0;
        }

        return vested - stream.withdrawnAmount;
    }
}