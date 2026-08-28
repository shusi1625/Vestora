// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ReceivableStream is ERC721, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Stream {
        address sender;
        address token;
        uint256 depositedAmount;
        uint256 startTime;
        uint256 endTime;
        uint256 withdrawnAmount;
        bool cancelable;
        bool canceled;
        uint256 canceledAt;
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
        uint256 endTime,
        bool cancelable
    );
    event StreamClaimed(
        uint256 indexed streamId,
        address indexed recipient,
        uint256 amount
    );
    event StreamCanceled(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        uint256 vestedAmount,
        uint256 senderRefund
    );

    constructor() ERC721("Vestora Receivable", "vRCV") {}

    function createStream(
        address recipient,
        address token,
        uint256 amount,
        uint256 startTime,
        uint256 endTime,
        bool cancelable
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
            withdrawnAmount: 0,
            cancelable: cancelable,
            canceled: false,
            canceledAt: 0
        });

        _safeMint(recipient, streamId);

        emit StreamCreated(
            streamId,
            msg.sender,
            recipient,
            token,
            amount,
            startTime,
            endTime,
            cancelable
        );
    }

    function nextStreamId() external view returns (uint256) {
        return _nextStreamId;
    }

    function getStream(uint256 streamId) external view returns (Stream memory) {
        _requireStreamExists(streamId);

        return _streams[streamId];
    }

    function vestedAmount(uint256 streamId) public view returns (uint256) {
        _requireStreamExists(streamId);

        Stream memory stream = _streams[streamId];
        uint256 currentTime = stream.canceled ? stream.canceledAt : block.timestamp;

        return _vestedAmountAt(stream, currentTime);
    }

    function claimableAmount(uint256 streamId) public view returns (uint256) {
        _requireStreamExists(streamId);

        Stream memory stream = _streams[streamId];
        uint256 currentTime = stream.canceled ? stream.canceledAt : block.timestamp;
        uint256 vested = _vestedAmountAt(stream, currentTime);

        if (vested <= stream.withdrawnAmount) {
            return 0;
        }

        return vested - stream.withdrawnAmount;
    }

    function claim(uint256 streamId) external nonReentrant returns (uint256 amount) {
        _requireStreamExists(streamId);

        address recipient = ownerOf(streamId);
        require(recipient == msg.sender, "not stream owner");

        amount = claimableAmount(streamId);
        require(amount > 0, "nothing to claim");

        Stream storage stream = _streams[streamId];

        stream.withdrawnAmount += amount;

        IERC20(stream.token).safeTransfer(recipient, amount);

        emit StreamClaimed(streamId, recipient, amount);
    }

    function cancel(uint256 streamId) external nonReentrant returns (uint256 senderRefund) {
        _requireStreamExists(streamId);

        Stream storage stream = _streams[streamId];

        require(stream.sender == msg.sender, "not stream sender");
        require(stream.cancelable, "stream not cancelable");
        require(!stream.canceled, "stream already canceled");

        uint256 canceledAt = block.timestamp;
        uint256 vested = _vestedAmountAt(stream, canceledAt);
        senderRefund = stream.depositedAmount - vested;

        stream.canceled = true;
        stream.canceledAt = canceledAt;

        if (senderRefund > 0) {
            IERC20(stream.token).safeTransfer(stream.sender, senderRefund);
        }

        emit StreamCanceled(
            streamId,
            stream.sender,
            ownerOf(streamId),
            vested,
            senderRefund
        );
    }

    function _requireStreamExists(uint256 streamId) private view {
        require(_ownerOf(streamId) != address(0), "stream not found");
    }

    function _vestedAmountAt(
        Stream memory stream,
        uint256 currentTime
    ) private pure returns (uint256) {
        if (currentTime <= stream.startTime) {
            return 0;
        }

        if (currentTime >= stream.endTime) {
            return stream.depositedAmount;
        }

        uint256 elapsed = currentTime - stream.startTime;
        uint256 duration = stream.endTime - stream.startTime;

        return (stream.depositedAmount * elapsed) / duration;
    }
}
