// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IReceivableStream is IERC721 {
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

    function getStream(uint256 streamId) external view returns (Stream memory);
    function vestedAmount(uint256 streamId) external view returns (uint256);
}

contract ReceivableMarketplace is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IReceivableStream public immutable receivableNft;
    IERC20 public immutable paymentToken;

    struct Listing {
        address seller;
        uint256 price;
    }

    mapping(uint256 => Listing) private _listings;

    event Listed(
        uint256 indexed streamId,
        address indexed seller,
        uint256 price
    );

    event ListingCanceled(
        uint256 indexed streamId,
        address indexed seller
    );

    event Purchased(
        uint256 indexed streamId,
        address indexed seller,
        address indexed buyer,
        uint256 price
    );

    constructor(address receivableNft_, address paymentToken_) {
        require(receivableNft_ != address(0), "invalid NFT");
        require(paymentToken_ != address(0), "invalid payment token");

        receivableNft = IReceivableStream(receivableNft_);
        paymentToken = IERC20(paymentToken_);
    }

    function list(uint256 streamId, uint256 price) external {
        require(price > 0, "invalid price");
        require(receivableNft.ownerOf(streamId) == msg.sender, "not NFT owner");
        require(_listings[streamId].seller == address(0), "already listed");

        address approved = receivableNft.getApproved(streamId);
        bool approvedForAll = receivableNft.isApprovedForAll(
            msg.sender,
            address(this)
        );

        require(
            approved == address(this) || approvedForAll,
            "marketplace not approved"
        );

        _listings[streamId] = Listing({
            seller: msg.sender,
            price: price
        });

        emit Listed(streamId, msg.sender, price);
    }

    function cancelListing(uint256 streamId) external {
        Listing memory listing = _listings[streamId];

        require(listing.seller != address(0), "not listed");
        require(listing.seller == msg.sender, "not seller");

        delete _listings[streamId];

        emit ListingCanceled(streamId, msg.sender);
    }

    function getListing(uint256 streamId) external view returns (Listing memory) {
        return _listings[streamId];
    }

    function buy(uint256 streamId) external nonReentrant {
        _buy(
            streamId,
            type(uint256).max,
            0,
            type(uint256).max,
            address(0)
        );
    }

    function buyWithProtection(
        uint256 streamId,
        uint256 maxPrice,
        uint256 minRemainingReceivable,
        uint256 maxWithdrawnAmount,
        address expectedSeller
    ) external nonReentrant {
        require(expectedSeller != address(0), "invalid expected seller");

        _buy(
            streamId,
            maxPrice,
            minRemainingReceivable,
            maxWithdrawnAmount,
            expectedSeller
        );
    }

    function _buy(
        uint256 streamId,
        uint256 maxPrice,
        uint256 minRemainingReceivable,
        uint256 maxWithdrawnAmount,
        address expectedSeller
    ) private {
        Listing memory listing = _listings[streamId];

        require(listing.seller != address(0), "not listed");
        require(listing.price <= maxPrice, "price exceeds maximum");

        if (expectedSeller != address(0)) {
            require(listing.seller == expectedSeller, "unexpected seller");
        }

        require(
            receivableNft.ownerOf(streamId) == listing.seller,
            "seller no longer owns NFT"
        );

        IReceivableStream.Stream memory stream = receivableNft.getStream(
            streamId
        );

        require(
            stream.withdrawnAmount <= maxWithdrawnAmount,
            "withdrawn exceeds maximum"
        );

        require(
            _remainingReceivable(streamId, stream) >= minRemainingReceivable,
            "remaining below minimum"
        );

        delete _listings[streamId];

        paymentToken.safeTransferFrom(
            msg.sender,
            listing.seller,
            listing.price
        );

        receivableNft.safeTransferFrom(
            listing.seller,
            msg.sender,
            streamId
        );

        emit Purchased(
            streamId,
            listing.seller,
            msg.sender,
            listing.price
        );
    }

    function _remainingReceivable(
        uint256 streamId,
        IReceivableStream.Stream memory stream
    ) private view returns (uint256) {
        uint256 settlementCeiling = stream.canceled
            ? receivableNft.vestedAmount(streamId)
            : stream.depositedAmount;

        if (settlementCeiling <= stream.withdrawnAmount) {
            return 0;
        }

        return settlementCeiling - stream.withdrawnAmount;
    }
}
