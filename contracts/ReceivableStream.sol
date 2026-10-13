// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ReceivableStream is ERC721, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidRecipient();
    error InvalidToken();
    error InvalidAmount();
    error InvalidTimeRange();
    error InvalidDuration();
    error StreamNotFound();
    error NotStreamOwner();
    error NothingToClaim();
    error NotStreamSender();
    error StreamNotCancelable();
    error StreamAlreadyCanceled();

    struct Stream {
        address sender;
        address token;
        uint256 depositedAmount;
        uint64 startTime;
        uint64 endTime;
        uint256 withdrawnAmount;
        bool cancelable;
        bool canceled;
        uint64 canceledAt;
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
        return _createStream(
            recipient, 
            token, 
            amount, 
            startTime, 
            endTime, 
            cancelable
        );
    }

    function createStreamWithDuration(
        address recipient,
        address token,
        uint256 amount,
        uint256 startDelay,
        uint256 duration,
        bool cancelable
    ) external returns (uint256 streamId) {
        if (duration == 0) {
            revert InvalidDuration();
        }

        uint256 startTime = block.timestamp + startDelay;
        uint256 endTime = startTime + duration;

        return _createStream(
            recipient,
            token,
            amount,
            startTime,
            endTime,
            cancelable
        );
    }
    
    function _createStream(
        address recipient,
        address token,
        uint256 amount,
        uint256 startTime,
        uint256 endTime,
        bool cancelable
    ) private returns (uint256 streamId) {
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }
        if (token == address(0)) {
            revert InvalidToken();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }
        if (endTime <= startTime) {
            revert InvalidTimeRange();
        }
        if (endTime > type(uint64).max) {
            revert InvalidTimeRange();
        }

        address sender = msg.sender;
        IERC20(token).safeTransferFrom(sender, address(this), amount);

        streamId = _nextStreamId;
        unchecked {
            _nextStreamId = streamId + 1;
        }

        _streams[streamId] = Stream({
            sender: sender,
            token: token,
            depositedAmount: amount,
            startTime: uint64(startTime),
            endTime: uint64(endTime),
            withdrawnAmount: 0,
            cancelable: cancelable,
            canceled: false,
            canceledAt: 0
        });

        _safeMint(recipient, streamId);

        emit StreamCreated(
            streamId,
            sender,
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
        _streamOf(streamId);

        return _streams[streamId];
    }

    function vestedAmount(uint256 streamId) public view returns (uint256) {
        Stream storage stream = _streamOf(streamId);
        uint256 currentTime = stream.canceled ? stream.canceledAt : block.timestamp;

        return _vestedAmountAt(stream, currentTime);
    }

    function claimableAmount(uint256 streamId) public view returns (uint256) {
        return _claimableAmount(_streamOf(streamId));
    }

    function claim(uint256 streamId) external nonReentrant returns (uint256 amount) {
        Stream storage stream = _streamOf(streamId);

        address recipient = _ownerOf(streamId);
        if (recipient != msg.sender) {
            revert NotStreamOwner();
        }

        amount = _claimableAmount(stream);
        if (amount == 0) {
            revert NothingToClaim();
        }

        stream.withdrawnAmount += amount;

        IERC20(stream.token).safeTransfer(recipient, amount);

        emit StreamClaimed(streamId, recipient, amount);
    }

    function cancel(uint256 streamId) external nonReentrant returns (uint256 senderRefund) {
        Stream storage stream = _streamOf(streamId);

        address sender = stream.sender;
        if (sender != msg.sender) {
            revert NotStreamSender();
        }
        if (!stream.cancelable) {
            revert StreamNotCancelable();
        }
        if (stream.canceled) {
            revert StreamAlreadyCanceled();
        }

        uint256 depositedAmount = stream.depositedAmount;
        address token = stream.token;

        uint64 canceledAt = uint64(block.timestamp);
        uint256 vested = _vestedAmountAt(stream, canceledAt);
        senderRefund = depositedAmount - vested;

        stream.canceled = true;
        stream.canceledAt = canceledAt;

        if (senderRefund > 0) {
            IERC20(token).safeTransfer(sender, senderRefund);
        }

        emit StreamCanceled(
            streamId,
            sender,
            _ownerOf(streamId),
            vested,
            senderRefund
        );
    }

    function _streamOf(uint256 streamId) private view returns (Stream storage stream) {
        if (_ownerOf(streamId) == address(0)) {
            revert StreamNotFound();
        }

        return _streams[streamId];
    }

    function _claimableAmount(
        Stream storage stream
    ) private view returns (uint256) {
        uint256 currentTime = stream.canceled ? stream.canceledAt : block.timestamp;
        uint256 vested = _vestedAmountAt(stream, currentTime);
        uint256 withdrawnAmount = stream.withdrawnAmount;

        if (vested <= withdrawnAmount) {
            return 0;
        }

        return vested - withdrawnAmount;
    }

    function _vestedAmountAt(
        Stream storage stream,
        uint256 currentTime
    ) private view returns (uint256) {
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
